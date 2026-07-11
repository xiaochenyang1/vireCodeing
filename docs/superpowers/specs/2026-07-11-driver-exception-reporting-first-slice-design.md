# Driver Exception Reporting First Slice Design

## Goal

把当前工作区中只完成了部分后端和移动端接线的“司机异常上报”补成可验证的纵向闭环：司机在执行订单期间可以填写异常类型、异常说明和可选证据图片，平台把异常记录为订单事件，并在司机端立即展示最新上报结果。

本设计只完成异常上报第一片，不把客服工单、赔付、申诉、保险理赔或资金结算混进来。那几块都需要独立状态机和后台能力，硬塞进这一片只会把边界搅成一锅粥。

## Current Evidence

当前未提交工作已经包含以下半成品：

- API 已新增 `POST /driver/orders/{orderId}/exception` 的 controller、validation、service 和 repository 接线。
- 请求模型已支持 `typeLabel`、`description`、可选 `photoCount` 和最多 6 个 `photoFileIds`。
- 后端已开始校验异常图片属于当前司机、状态为 `uploaded`、用途为 `exception`。
- 订单仓储已开始追加 `driver_exception_reported` 事件，并把图片文件 ID 写入 `attachmentFileIds`。
- 移动端 `platformDriverOrderApi` 已开始提供 `reportException()` 和请求归一化。
- `DriverHomeScreen` 已存在异常表单状态和提交函数，但尚未渲染表单、上传入口或最新异常记录。
- 当前根 ESLint 因这些未使用的 UI 状态和函数产生 4 个错误，证明该切片尚未闭环。

当前自动检查基线：

- 移动端 Jest：37 suites / 715 tests passed。
- API Jest：64 suites / 610 tests passed。
- 移动端和 API TypeScript 检查通过。
- 根 ESLint 失败，错误集中在未完成的司机异常上报 UI。
- API 源码输出到干净目录可以编译；常规 `api:build` 仍受现有 `apps/api/dist` Windows 写入或占用问题影响。

## Scope

### In Scope

- 司机在 `loading`、`transporting`、`confirming` 状态的本人订单中上报异常。
- 异常类型使用预设选项，并允许选择“其他”。
- 异常说明去除首尾空白后必须为 6 到 200 字。
- 支持 0 到 6 张证据图片，复用现有 `platformFileApi` 上传链路，文件用途固定为 `exception`。
- 后端验证订单归属、订单状态、文件归属、文件状态和文件用途。
- 上报成功后追加 `driver_exception_reported` 事件，不改变订单状态。
- 司机端刷新当前订单和“我的订单”列表，并展示最新异常记录。
- 普通提交失败时保留当前表单内容，允许用户修正或重试。
- 补齐移动端、API、OpenAPI 和状态文档测试。

### Out of Scope

- 自动创建客服工单。
- 客服处理状态、处理记录和后台处理页面。
- 赔付、退款、违约金、保险理赔和资金冻结。
- 货主确认、驳回或申诉异常。
- 推送、IM 或短信通知。
- 删除或修改已上报的异常事件。
- 多端草稿同步和异常表单离线队列。

## Architecture

保持现有模块边界，不新建平行体系：

- `apps/api/src/driver-orders` 负责司机请求校验、订单权限和业务状态判断。
- `apps/api/src/orders/orders.repository.ts` 负责把异常写成不可变订单事件。
- `apps/api/src/files` 继续作为证据文件的事实来源，异常模块只引用文件 ID。
- `src/services/platformDriverOrderApi.ts` 负责移动端请求归一化和 HTTP 调用。
- `src/screens/driver-home/driverHomeUtils.ts` 负责纯表单校验、状态判断和最新异常事件选择。
- `src/screens/DriverHomeScreen.tsx` 只负责交互状态、文件上传编排和界面展示。

异常仍存储为 `OrderEvent`，本阶段不新增 `OrderException` 表。当前只需要不可变的上报记录，独立工单状态机尚未进入范围；提前建半吊子表只会产生两套事实来源。

## API Contract

### Endpoint

`POST /driver/orders/{orderId}/exception`

### Request

```ts
type DriverReportExceptionRequest = {
  typeLabel: string;
  description: string;
  photoCount?: number;
  photoFileIds?: string[];
};
```

约束：

- `typeLabel` 去除首尾空白后长度为 1 到 30。
- `description` 去除首尾空白后长度为 6 到 200。
- `photoCount` 如存在，必须为 0 到 6 的整数。
- `photoFileIds` 如存在，最多 6 个；去重后保持首次出现顺序。
- 每个文件必须属于当前司机、状态为 `uploaded`、用途为 `exception`。

### Response

返回更新后的 `ShipperOrderRecord`。新增事件：

```ts
{
  eventType: 'driver_exception_reported';
  actorUserId: driverId;
  noteText: string;
  attachmentFileIds?: string[];
  createdAtIso: string;
}
```

`noteText` 使用稳定格式编码异常类型、说明和图片数量，保持现有事件派生展示方式，不在本阶段增加新的数据库 JSON 字段。

## Mobile Experience

### Visibility

异常区域只在以下条件同时满足时展示：

- 当前查看的是司机本人已接订单。
- 订单状态为 `loading`、`transporting` 或 `confirming`。

已完成、已取消、待接单和其他不允许状态只展示历史异常记录，不展示提交表单。

### Form

预设异常类型：

- 车辆故障
- 交通事故
- 货物损坏
- 地址或联系人异常
- 其他

选择“其他”时仍使用同一个 `typeLabel` 字段保存最终显示文本；第一片不增加复杂分类字典或后台配置。

表单包含：

- 异常类型选择。
- 6 到 200 字异常说明输入。
- 最多 6 张证据图片的上传入口和已上传计数。
- 提交按钮。

图片上传复用现有本地上传确认流程：创建 `exception` 用途上传意图、上传本地占位内容、确认 uploaded、把返回的 `fileId` 写入当前订单异常表单状态。

### Result Display

提交成功后：

- 用 API 返回值更新当前选中订单。
- 用 `upsertOrder()` 更新“我的订单”。
- 清空该订单异常表单。
- 展示“异常已上报，等待客服跟进。”提示。
- 显示最新异常的类型、说明、时间和证据图片数量。

历史事件保持不可编辑。多次上报时，详情默认展示最新一条，事件数据本身全部保留。

## Data Flow

1. 司机选择异常类型并填写说明。
2. 如需图片，移动端通过 `platformFileApi` 创建 `exception` 上传意图并完成上传确认。
3. 移动端纯函数把表单归一化为 `PlatformDriverReportExceptionRequest`。
4. adapter 调用 `POST /driver/orders/{orderId}/exception`。
5. controller 通过 guard 确认当前账号为司机，再校验请求体。
6. service 确认订单属于当前司机且处于允许状态，并逐个校验证据文件。
7. repository 追加 `driver_exception_reported` 事件，不修改订单状态。
8. API 返回更新后的订单，移动端更新详情和列表并显示最新异常。

## Error Handling

- 缺少平台 API：提示“异常上报需要平台 API 配置。”，不清空表单。
- 缺少 access token：提示重新登录，不发请求，不清空表单和已上传文件引用。
- 表单非法：提示填写异常类型和至少 6 个字的说明。
- 状态不允许：映射 `ORDER_STATE_INVALID`，提示当前订单状态不允许上报。
- 订单不存在或不属于当前司机：沿用 `ORDER_NOT_FOUND`，不泄露其他司机订单。
- 文件不存在：沿用 `FILE_NOT_FOUND`。
- 文件未上传完成：沿用 `FILE_STATE_INVALID`。
- 文件用途错误：沿用 `FILE_PURPOSE_INVALID`。
- 上传失败：保留已填写文字和已成功上传的文件 ID，允许继续重试剩余图片。
- 其他网络或平台错误：提示稍后重试并保留完整表单。

## Testing

### Mobile Pure Utilities

- 合法异常表单生成标准请求。
- 类型为空、类型超长、说明不足 6 字、说明超过 200 字时拒绝生成请求。
- 只有执行中状态允许上报。
- 多条事件中选择创建时间最新的 `driver_exception_reported`。

### Mobile Adapter

- 裁剪类型和说明。
- 校验 `photoCount` 和最多 6 个 `photoFileIds`。
- 文件 ID 去重且保持顺序。
- 缺少 bearer token、非法 order ID 和非法请求返回稳定错误码。
- 正确调用 `/driver/orders/{orderId}/exception`。

### Mobile Screen

- 允许状态展示异常表单，其他状态不展示。
- 非法表单不调用 API。
- 成功上传证据图片后提交文件 ID。
- 提交成功后更新订单、清空表单并展示最新异常。
- 状态错误和普通失败均保留表单。

### API

- validation 覆盖所有长度、数量、去重和类型边界。
- controller 覆盖路由、guard 顺序和响应包装。
- service 覆盖非司机、非本人订单、非法状态和文件校验。
- repository 覆盖内存和 Prisma 事件写入、附件绑定及订单状态不变。
- OpenAPI 覆盖 endpoint、请求 schema、事件枚举和业务错误。

## Verification Gates

实现完成后必须运行并通过：

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm --prefix apps/api test`
- `npm --prefix apps/api run typecheck`
- `npm --prefix apps/api run lint`
- `npm --prefix apps/api run prisma:validate`
- `npm run api:build`

如果 `api:build` 继续在 `apps/api/dist` 报 Windows `EPERM`，必须按系统调试流程定位占用进程或目录权限，并保留诊断证据；不能拿干净目录编译成功冒充正式构建门通过。

## Documentation

完成后更新：

- `docs/platform/openapi-stage-1.yaml`
- `docs/03-项目当前状态与补全路线.md`
- `docs/platform/README.md`

文档必须明确：司机异常上报第一片已完成，但客服工单、赔付、申诉、通知和资金处理仍未完成。

## Completion Criteria

本切片完成必须同时满足：

- 司机能在允许状态填写并提交异常。
- 可选证据图片能走真实文件 API 第一片并绑定订单事件。
- 后端权限、状态和文件校验完整。
- API 返回后移动端立即展示最新异常。
- 所有相关测试和完整质量门通过。
- OpenAPI 和状态文档与代码一致。
- 不把异常上报第一片描述成完整客服或赔付闭环。

## Self Review

- Placeholder scan：无占位项。
- Internal consistency：移动端、API、文件用途和事件模型使用同一组字段与状态边界。
- Scope check：只覆盖异常上报纵向闭环，客服工单和资金处理已明确排除。
- Ambiguity check：证据图片为可选 0 到 6 张；事件不改变订单状态；历史事件不可编辑。
