import {
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
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { memoryStorage } from 'multer';

import { AssetsService } from './assets.service';
import { UploadAssetDto } from './dto/upload-asset.dto';
import type { Asset, AssetListResponse, AssetSortOrder } from './interfaces/asset.interface';

/**
 * REST surface for stored (uploaded) assets. Static, prebuilt assets are
 * served separately via `app.useStaticAssets()` mounted in `main.ts` so
 * that read-only directory does not flow through this controller.
 */
@ApiTags('assets')
@Controller('assets')
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
      disposition: `attachment; filename="${asset.originalName.replace(/"/g, '')}"`,
    });
  }

  /**
   * `POST /assets` — upload a new asset via `multipart/form-data`.
   *
   * The accompanying text fields are validated against `UploadAssetDto`
   * by the global `ValidationPipe`.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      // Buffer the upload in memory; the service persists the buffer to
      // disk. This keeps the controller-bound storage configuration free
      // of synchronous filesystem calls and is easier to test.
      storage: memoryStorage(),
      limits: {
        fileSize:
          Number(process.env.ASSETS_MAX_SIZE_MB ?? 10) * 1024 * 1024,
      },
    }),
  )
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
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadAssetDto,
  ): Promise<Asset> {
    if (!file) {
      throw new Error('No file provided under field "file"');
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
