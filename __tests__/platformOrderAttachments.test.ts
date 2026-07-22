import {
  hydrateRecentOrderAttachmentRefs,
  mergePlatformOrderWithLocalRuntimeState,
} from '../src/utils/platformOrderAttachments';
import type { PlatformFileUploadRecord } from '../src/services/platformFileApi';
import type { RecentOrder } from '../src/types';

function createRecentOrder(
  overrides: Partial<RecentOrder> = {},
): RecentOrder {
  return {
    id: 'HY202607220001',
    platformOrderId: 'order-platform-1',
    status: 'waiting',
    from: '宝安仓',
    to: '南山店',
    cargoType: '数码',
    weightText: '1.2 吨',
    vehicleRequirement: '中型货车',
    priceText: '￥660',
    updatedAtText: '平台已同步',
    ...overrides,
  };
}

describe('platform order attachments', () => {
  it('hydrates cargo, exception, and evaluation attachment refs from file metadata', async () => {
    const purposeByFileId = {
      'file-cargo-1': 'cargo',
      'file-exception-1': 'exception',
      'file-evaluation-1': 'evaluation',
    } as const;
    const getFileMetadata: (fileId: string) => Promise<PlatformFileUploadRecord> =
      jest.fn(async (fileId: string) => ({
        id: fileId,
        ownerUserId: 'user-1',
        purpose: purposeByFileId[fileId as keyof typeof purposeByFileId],
        objectKey: `user-1/${fileId}.png`,
        publicUrl: `https://cdn.example.com/${fileId}.png`,
        status: 'uploaded' as const,
        createdAtIso: '2026-07-22T08:00:00.000Z',
      }));

    const hydratedOrder = await hydrateRecentOrderAttachmentRefs(
      createRecentOrder({
        cargoPhotoFiles: [
          {
            fileId: 'file-cargo-1',
            fileName: '平台货物图片 1',
            purpose: 'cargo',
            status: 'uploaded',
          },
        ],
        exceptionReport: {
          typeLabel: '货损',
          description: '外包装破损',
          photoCount: 1,
          photoFiles: [
            {
              fileId: 'file-exception-1',
              fileName: '平台异常图片 1',
              purpose: 'exception',
              status: 'uploaded',
            },
          ],
        },
        evaluation: {
          rating: 5,
          tags: ['准时'],
          content: '服务很好',
          photoCount: 1,
          photoFiles: [
            {
              fileId: 'file-evaluation-1',
              fileName: '平台评价图片 1',
              purpose: 'evaluation',
              status: 'uploaded',
            },
          ],
        },
      }),
      { getFileMetadata },
    );

    expect(getFileMetadata).toHaveBeenCalledTimes(3);
    expect(hydratedOrder.cargoPhotoFiles).toMatchObject([
      {
        fileId: 'file-cargo-1',
        objectKey: 'user-1/file-cargo-1.png',
        publicUrl: 'https://cdn.example.com/file-cargo-1.png',
      },
    ]);
    expect(hydratedOrder.exceptionReport?.photoFiles).toMatchObject([
      {
        fileId: 'file-exception-1',
        objectKey: 'user-1/file-exception-1.png',
        publicUrl: 'https://cdn.example.com/file-exception-1.png',
      },
    ]);
    expect(hydratedOrder.evaluation?.photoFiles).toMatchObject([
      {
        fileId: 'file-evaluation-1',
        objectKey: 'user-1/file-evaluation-1.png',
        publicUrl: 'https://cdn.example.com/file-evaluation-1.png',
      },
    ]);
  });

  it('merges hydrated platform attachment metadata back into local runtime snapshots', () => {
    const localOrder = createRecentOrder({
      bonusText: '已加价 20 元',
      cargoPhotoFiles: [
        {
          fileId: 'file-cargo-1',
          fileName: '货物图片凭证1.png',
          purpose: 'cargo',
          status: 'uploaded',
        },
      ],
      exceptionReport: {
        typeLabel: '货损',
        description: '本地异常说明',
        statusText: '待客服跟进',
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-exception-1',
            fileName: '异常图片凭证.png',
            purpose: 'exception',
            status: 'uploaded',
          },
        ],
      },
      evaluation: {
        rating: 5,
        tags: ['服务好'],
        content: '本地评价内容',
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-evaluation-1',
            fileName: '评价图片凭证.png',
            purpose: 'evaluation',
            status: 'uploaded',
          },
        ],
      },
    });
    const platformOrder = createRecentOrder({
      cargoPhotoFiles: [
        {
          fileId: 'file-cargo-1',
          fileName: '平台货物图片 1',
          purpose: 'cargo',
          status: 'uploaded',
          objectKey: 'user-1/cargo/file-cargo-1.png',
          publicUrl: 'https://cdn.example.com/file-cargo-1.png',
        },
      ],
      exceptionReport: {
        typeLabel: '货损',
        description: '平台异常说明',
        statusText: '待客服跟进',
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-exception-1',
            fileName: '平台异常图片 1',
            purpose: 'exception',
            status: 'uploaded',
            objectKey: 'user-1/exception/file-exception-1.png',
            publicUrl: 'https://cdn.example.com/file-exception-1.png',
          },
        ],
      },
      evaluation: {
        rating: 5,
        tags: ['准时'],
        content: '平台评价内容',
        photoCount: 1,
        photoFiles: [
          {
            fileId: 'file-evaluation-1',
            fileName: '平台评价图片 1',
            purpose: 'evaluation',
            status: 'uploaded',
            objectKey: 'user-1/evaluation/file-evaluation-1.png',
            publicUrl: 'https://cdn.example.com/file-evaluation-1.png',
          },
        ],
      },
    });

    const mergedOrder = mergePlatformOrderWithLocalRuntimeState(
      platformOrder,
      localOrder,
    );

    expect(mergedOrder.bonusText).toBe('已加价 20 元');
    expect(mergedOrder.cargoPhotoFiles).toMatchObject([
      {
        fileId: 'file-cargo-1',
        fileName: '货物图片凭证1.png',
        publicUrl: 'https://cdn.example.com/file-cargo-1.png',
      },
    ]);
    expect(mergedOrder.exceptionReport).toMatchObject({
      description: '本地异常说明',
      photoFiles: [
        {
          fileId: 'file-exception-1',
          fileName: '异常图片凭证.png',
          publicUrl: 'https://cdn.example.com/file-exception-1.png',
        },
      ],
    });
    expect(mergedOrder.evaluation).toMatchObject({
      content: '本地评价内容',
      photoFiles: [
        {
          fileId: 'file-evaluation-1',
          fileName: '评价图片凭证.png',
          publicUrl: 'https://cdn.example.com/file-evaluation-1.png',
        },
      ],
    });
  });
});
