import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/access-token.guard';
import type { AuthenticatedUser } from '../auth/dto';
import { AdminOnlyGuard } from '../auth/role.guard';
import { ok } from '../common/api-response';
import { ApiErrorCode, BusinessError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type {
  ConfirmFileUploadedRequest,
  ConfirmStorageCallbackRequest,
  CreateFileUploadIntentRequest,
} from './dto';
import { FilesService } from './files.service';
import {
  confirmFileUploadedSchema,
  confirmStorageCallbackSchema,
  createFileUploadIntentSchema,
  parseConfirmFileUploadedRequest,
  parseConfirmStorageCallbackRequest,
  parseCreateFileUploadIntentRequest,
} from './files.validation';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload-intents')
  @UseGuards(AccessTokenGuard)
  async createUploadIntent(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createFileUploadIntentSchema))
    body: CreateFileUploadIntentRequest,
  ) {
    return ok(
      await this.filesService.createUploadIntent(
        getCurrentUserId(request),
        parseCreateFileUploadIntentRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post(':fileId/uploaded')
  @UseGuards(AccessTokenGuard)
  async confirmUploaded(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Body(new ZodValidationPipe(confirmFileUploadedSchema))
    body: ConfirmFileUploadedRequest,
  ) {
    return ok(
      await this.filesService.confirmUploaded(
        getCurrentUserId(request),
        fileId,
        parseConfirmFileUploadedRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('storage-callbacks/s3-compatible')
  @HttpCode(200)
  async confirmStorageCallback(
    @Body(new ZodValidationPipe(confirmStorageCallbackSchema))
    body: ConfirmStorageCallbackRequest,
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.filesService.confirmStorageCallback(
        parseConfirmStorageCallbackRequest(body),
      ),
      getRequestId(request),
    );
  }

  @Post('maintenance/reject-expired-pending')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async rejectExpiredPendingFiles(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.filesService.rejectExpiredPendingFiles(),
      getRequestId(request),
    );
  }

  @Get('maintenance/summary')
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async getMaintenanceSummary(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.filesService.getMaintenanceSummary(),
      getRequestId(request),
    );
  }

  @Post('maintenance/delete-rejected-objects')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard, AdminOnlyGuard)
  async deleteRejectedFileObjects(@Req() request: AuthenticatedRequest) {
    return ok(
      await this.filesService.deleteRejectedFileObjects(),
      getRequestId(request),
    );
  }

  @Get(':fileId')
  @UseGuards(AccessTokenGuard)
  async getFileMetadata(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
  ) {
    return ok(
      await this.filesService.getFileMetadata(getCurrentUser(request), fileId),
      getRequestId(request),
    );
  }

  @Post('uploads/:fileId')
  @UseGuards(AccessTokenGuard)
  async uploadLocalFile(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
  ) {
    return ok(
      await this.filesService.uploadLocalFile(
        getCurrentUserId(request),
        fileId,
        await readRequestBody(request),
      ),
      getRequestId(request),
    );
  }

  @Get('previews/*')
  async getPreviewMetadata(
    @Param('0') objectKey: string,
    @Query()
    query: {
      expiresAtIso: string;
      signature: string;
    },
    @Req() request?: AuthenticatedRequest,
  ) {
    return ok(
      await this.filesService.getPreviewMetadataByObjectKey(objectKey, query),
      getRequestId(request),
    );
  }

  @Get('preview-contents/*')
  async getPreviewContent(
    @Param('0') objectKey: string,
    @Query()
    query: {
      expiresAtIso: string;
      signature: string;
    },
  ) {
    const result = await this.filesService.getPreviewContentByObjectKey(
      objectKey,
      query,
    );

    return new StreamableFile(result.content, {
      type: result.file.contentType,
    });
  }
}

function getCurrentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.currentUser) {
    throw new BusinessError(
      ApiErrorCode.AUTH_ACCESS_TOKEN_INVALID,
      '访问令牌无效',
    );
  }

  return request.currentUser;
}

function getCurrentUserId(request: AuthenticatedRequest) {
  return getCurrentUser(request).id;
}

function getRequestId(request?: AuthenticatedRequest) {
  const requestIdHeader = request?.headers?.['x-request-id'];

  return Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
}

async function readRequestBody(request: AuthenticatedRequest) {
  const requestWithBody = request as AuthenticatedRequest & {
    body?: unknown;
  };

  if (Buffer.isBuffer(requestWithBody.body)) {
    return requestWithBody.body;
  }

  if (typeof requestWithBody.body === 'string') {
    return Buffer.from(requestWithBody.body);
  }

  if (requestWithBody.body instanceof Uint8Array) {
    return Buffer.from(requestWithBody.body);
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request as AuthenticatedRequest &
    AsyncIterable<Buffer | string | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
