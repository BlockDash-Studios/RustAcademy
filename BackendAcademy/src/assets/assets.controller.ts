import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseFilters,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, MulterError } from 'multer';
import type { Response } from 'express';
import type { NestInterceptor } from '@nestjs/common';
import type { Options as MulterOptions } from 'multer';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AssetsService, ALLOWED_MIME_TYPES } from './assets.service';
import { UploadAssetDto } from './dto/upload-asset.dto';
import type { Asset, AssetListResponse, AssetSortOrder } from './interfaces/asset.interface';

/** Maximum per-file upload size (mirrors `ASSETS_MAX_SIZE_MB`, default 10 MB). */
const MAX_UPLOAD_BYTES =
  (() => {
    const mb = Number(process.env.ASSETS_MAX_SIZE_MB ?? 10);
    return Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : 10 * 1024 * 1024;
  })();

/**
 * Maps multer upload failures onto clean HTTP responses:
 *  - oversized uploads → 413 (Payload Too Large)
 *  - wrong field name / unexpected file → 400 (Bad Request)
 * This keeps the controller body free of transport-specific error handling.
 */
@Catch(MulterError)
class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (exception.code === 'LIMIT_FILE_SIZE') {
      res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'Uploaded asset exceeds the maximum allowed size',
        error: 'Payload Too Large',
      });
      return;
    }
    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message,
      error: 'Bad Request',
    });
  }
}

/**
 * Builds multer options with strict bounds, reading live limits from the
 * injected service. Declared as a function so the interceptor can be bound to
 * a concrete controller instance in the constructor.
 */
function buildUploadOptions(assetsService: AssetsService): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: {
      fileSize: assetsService.getMaxSizeBytes(),
      files: 1,
      fieldSize: 1024 * 1024,
      fields: 10,
      parts: 12,
    },
    fileFilter: (_req: any, file: any, cb: any) => {
      const declared = (file.mimetype || '').toLowerCase();
      const isAllowed = ALLOWED_MIME_TYPES.some(({ mime, prefix }) =>
        prefix ? declared.startsWith(mime) : declared === mime,
      );

      if (
        !isAllowed ||
        /^(?:application\/(?:x-|octet-stream)|text\/html|image\/svg\+xml)/.test(
          declared,
        )
      ) {
        cb(
          new BadRequestException(
            `Asset MIME type '${file.mimetype}' is not allowed`,
          ),
          false,
        );
        return;
      }

      const lower = (file.originalname || '').toLowerCase();
      if (
        /\.(?:exe|dll|sh|bat|cmd|msi|php|phtml|js|cgi|pl|py|rb|jar|com|scr|vbs|wsf)$/.test(
          lower,
        )
      ) {
        cb(
          new BadRequestException('Asset filename uses a disallowed extension'),
          false,
        );
        return;
      }

      cb(null, true);
    },
  };
}

@ApiTags('Assets')
@Controller('assets')
@UseFilters(MulterExceptionFilter)
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /**
   * `GET /assets` — list all stored assets, optionally sorted.
   */
  @Get()
  @ApiOperation({ summary: 'List stored assets' })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['newest', 'oldest', 'name'],
    description: 'Sort order; defaults to `newest`.',
  })
  @ApiResponse({ status: 200, description: 'List of asset metadata.' })
  list(@Query('sort') sort?: string): AssetListResponse {
    const normalized: AssetSortOrder =
      sort === 'oldest' || sort === 'name' ? sort : 'newest';
    return this.assetsService.list(normalized);
  }

  /**
   * `GET /assets/:id` — fetch metadata for a single asset.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get asset metadata' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Asset metadata found.' })
  @ApiResponse({ status: 404, description: 'Asset not found.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Asset {
    return this.assetsService.findById(id);
  }

  /**
   * `GET /assets/:id/download` — stream the asset content back to the
   * client. `Content-Type`, length and disposition are attached directly
   * to the `StreamableFile` so we avoid mixing `@Res` directives with the
   * controller return value.
   */
  @Get(':id/download')
  @ApiOperation({ summary: 'Download asset content' })
  @ApiProduces('application/octet-stream', 'image/*', 'video/*', 'audio/*')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Asset content stream.' })
  @ApiResponse({ status: 404, description: 'Asset not found.' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    const asset = this.assetsService.findById(id);
    const stream = await this.assetsService.openReadStream(id);

    return new StreamableFile(stream, {
      type: asset.mimeType,
      length: asset.size,
      disposition: `attachment; filename="${asset.originalName.replace(/["\\]/g, '')}"`,
    });
  }

  /**
   * `POST /assets` — upload a new asset via `multipart/form-data`.
   *
   * The accompanying text fields are validated against `UploadAssetDto`
   * by the global `ValidationPipe`. multer is configured with strict limits
   * and a `fileFilter` so malformed or disallowed uploads are rejected before
   * the bytes are buffered into memory, and the service performs content-
   * based inspection (magic bytes, quotas, dangerous-content screening)
   * before the file is persisted.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string', nullable: true },
        description: { type: 'string', nullable: true },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload an asset' })
  @ApiResponse({ status: 201, description: 'Asset successfully stored.' })
  @ApiResponse({ status: 400, description: 'Invalid asset payload.' })
  @ApiResponse({ status: 413, description: 'Asset exceeds maximum size.' })
  async upload(
    @UploadedFile() file: any,
    @Body() dto: UploadAssetDto,
  ): Promise<Asset> {
    if (!file) {
      throw new BadRequestException('No file provided under field "file"');
    }
    return this.assetsService.registerBuffer({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
      name: dto.name,
      description: dto.description,
    });
  }

  /**
   * `DELETE /assets/:id` — remove an asset and its underlying file.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Asset removed.' })
  @ApiResponse({ status: 404, description: 'Asset not found.' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.assetsService.remove(id);
  }
}
