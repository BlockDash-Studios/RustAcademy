import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs, createReadStream, type ReadStream } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Asset,
  AssetListResponse,
  AssetSortOrder,
} from './interfaces/asset.interface';

/**
 * Default cap (in bytes) on the size of a single uploaded asset when the
 * operator does not set `ASSETS_MAX_SIZE_MB` (10 MB).
 */
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum number of characters permitted in a stored filename before it is
 * truncated. Keeps `route` and `fs` operations inside reasonable bounds.
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Default directory (relative to the process working directory) where
 * uploaded assets are persisted when `ASSETS_UPLOAD_DIR` is unset.
 */
const DEFAULT_UPLOAD_DIR = './data/uploads';

/**
 * Set of MIME types accepted by the upload endpoint by default. Operators
 * may override the cap via `ASSETS_MAX_SIZE_MB`; the allow-list itself is
 * intentionally fixed for the placeholder backend.
 */
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'application/pdf', 'text/'];

/**
 * Service responsible for persisting uploaded assets, maintaining their
 * metadata, and resolving them for download.
 *
 * NOTE: for the placeholder backend we keep the metadata in-memory in a
 * `Map`. This means metadata is reset on every process restart. The
 * physical files on disk survive restarts because they are evicted via
 * `cleanupOrphanedFiles` on module shutdown.
 */
@Injectable()
export class AssetsService implements OnModuleDestroy {
  private readonly logger = new Logger(AssetsService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;
  private readonly maxSizeBytes: number;
  private readonly registry = new Map<string, Asset>();

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = path.resolve(
      this.configService.get<string>('ASSETS_UPLOAD_DIR') ?? DEFAULT_UPLOAD_DIR,
    );
    this.baseUrl =
      this.configService.get<string>('ASSETS_BASE_URL') ?? '/api/v1/assets';
    this.maxSizeBytes = this.resolveMaxSizeBytes();

    // Eagerly create the upload directory so first uploads do not race.
    void fs
      .mkdir(this.uploadDir, { recursive: true })
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to prepare upload directory ${this.uploadDir}: ${this.toMessage(err)}`,
        ),
      );
  }

  /**
   * Returns the list of all stored assets, optionally sorted.
   *
   * @param sort Sorting order; defaults to `newest`.
   */
  list(sort: AssetSortOrder = 'newest'): AssetListResponse {
    const assets = Array.from(this.registry.values());

    const sorted = [...assets].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.uploadedAt.localeCompare(b.uploadedAt);
        case 'name':
          return a.originalName.localeCompare(b.originalName);
        case 'newest':
        default:
          return b.uploadedAt.localeCompare(a.uploadedAt);
      }
    });

    return { total: sorted.length, assets: sorted };
  }

  /**
   * Returns the metadata of a single asset.
   *
   * @throws NotFoundException when no asset with the given id exists.
   */
  findById(id: string): Asset {
    const asset = this.registry.get(id);
    if (!asset) {
      throw new NotFoundException(`Asset '${id}' not found`);
    }
    return asset;
  }

  /**
   * Returns a read stream for the given asset. Used by the controller to
   * implement the download endpoint.
   *
   * @throws NotFoundException when the asset's metadata is missing or the
   *         physical file is missing on disk.
   */
  async openReadStream(id: string): Promise<ReadStream> {
    const asset = this.findById(id);
    const fullPath = this.resolveOnDiskPath(asset.filename);
    try {
      await fs.access(fullPath);
    } catch (err: unknown) {
      throw new NotFoundException(
        `Asset '${id}' file is missing on disk: ${this.toMessage(err)}`,
      );
    }
    return createReadStream(fullPath);
  }

  /**
   * Registers a freshly-uploaded file (already buffered in memory by
   * multer's `memoryStorage`) in the metadata registry, persisting the
   * buffer to the managed upload directory.
   *
   * @param buffer        Bytes of the upload.
   * @param originalName  Original filename from the client.
   * @param mimeType      Detected MIME type.
   * @param size          Size in bytes uploaded.
   * @param name          Optional human-friendly name.
   * @param description   Optional description.
   */
  async registerBuffer(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
    name?: string;
    description?: string;
  }): Promise<Asset> {
    this.assertMimeAllowed(params.mimeType);
    this.assertSizeAllowed(params.size);

    const id = randomUUID();
    const safeName = this.sanitizeFilename(params.originalName, id);
    const finalPath = this.resolveOnDiskPath(safeName);

    try {
      await fs.writeFile(finalPath, params.buffer);
    } catch (err: unknown) {
      throw new BadRequestException(
        `Failed to persist uploaded asset: ${this.toMessage(err)}`,
      );
    }

    const asset: Asset = {
      id,
      filename: safeName,
      originalName: params.originalName,
      mimeType: params.mimeType,
      size: params.size,
      uploadedAt: new Date().toISOString(),
      url: this.buildDownloadUrl(id),
      name: params.name,
      description: params.description,
    };

    this.registry.set(id, asset);
    return asset;
  }

  /**
   * Removes an asset's metadata and (best-effort) its file from disk.
   *
   * @throws NotFoundException when the asset cannot be found.
   */
  async remove(id: string): Promise<void> {
    const asset = this.findById(id);
    this.registry.delete(id);

    const fullPath = this.resolveOnDiskPath(asset.filename);
    try {
      await fs.unlink(fullPath);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error?.code !== 'ENOENT') {
        this.logger.warn(
          `Failed to unlink asset file ${fullPath}: ${this.toMessage(err)}`,
        );
      }
      // swallow ENOENT — file already missing is harmless.
    }
  }

  /**
   * On graceful shutdown, prune any files left in the upload directory
   * which are not referenced by the registry. This protects against
   * orphaned tmp files from aborted uploads between restarts.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      const entries = await fs.readdir(this.uploadDir);
      await Promise.all(
        entries.map(async (entry) => {
          if (this.isManagedFilename(entry)) return;
          const target = path.join(this.uploadDir, entry);
          try {
            await fs.unlink(target);
          } catch (err: unknown) {
            this.logger.warn(
              `Failed to remove orphaned asset ${target}: ${this.toMessage(err)}`,
            );
          }
        }),
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Asset cleanup on shutdown failed: ${this.toMessage(err)}`,
      );
    }
  }

  /** Exposed for the controller when constructing multer storage options. */
  getUploadDir(): string {
    return this.uploadDir;
  }

  /** Exposed for the controller when announcing upload limits. */
  getMaxSizeBytes(): number {
    return this.maxSizeBytes;
  }

  /** Exposed for tests so the in-memory registry can be cleared. */
  clearRegistryForTests(): void {
    this.registry.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private resolveOnDiskPath(filename: string): string {
    const resolved = path.resolve(this.uploadDir, filename);
    if (!resolved.startsWith(this.uploadDir)) {
      throw new BadRequestException('Invalid asset filename');
    }
    return resolved;
  }

  private buildDownloadUrl(id: string): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    return `${base}/${id}/download`;
  }

  private resolveMaxSizeBytes(): number {
    const configured = this.configService.get<string>('ASSETS_MAX_SIZE_MB');
    const mb = configured ? Number(configured) : 10;
    if (!Number.isFinite(mb) || mb <= 0) {
      return DEFAULT_MAX_SIZE_BYTES;
    }
    return Math.floor(mb * 1024 * 1024);
  }

  private assertSizeAllowed(size: number): void {
    if (size <= 0) {
      throw new BadRequestException('Uploaded asset is empty');
    }
    if (size > this.maxSizeBytes) {
      throw new BadRequestException(
        `Asset exceeds maximum size of ${this.maxSizeBytes} bytes`,
      );
    }
  }

  private assertMimeAllowed(mime: string): void {
    const allowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      mime.toLowerCase().startsWith(prefix),
    );
    if (!allowed) {
      throw new BadRequestException(
        `Asset MIME type '${mime}' is not allowed`,
      );
    }
  }

  private sanitizeFilename(original: string, id: string): string {
    const ext = path.extname(original).toLowerCase().slice(0, 16) || '';
    const stem = path
      .basename(original, path.extname(original))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, MAX_FILENAME_LENGTH - id.length - ext.length - 1);
    const base = `${stem || 'asset'}-${id}${ext}`;
    return base.length > MAX_FILENAME_LENGTH
      ? base.slice(0, MAX_FILENAME_LENGTH)
      : base;
  }

  private isManagedFilename(entry: string): boolean {
    for (const asset of this.registry.values()) {
      if (asset.filename === entry) return true;
    }
    return false;
  }

  private toMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
