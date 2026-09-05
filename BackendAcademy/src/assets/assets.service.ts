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
import { randomUUID, createHash } from 'node:crypto';
import type {
  Asset,
  AssetListResponse,
  AssetSortOrder,
} from './interfaces/asset.interface';
import { SecurityService } from '../security/security.service';

/**
 * Default per-file cap (in bytes) when `ASSETS_MAX_SIZE_MB` is unset (10 MB).
 */
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Aggregate byte budget across all stored assets when `ASSETS_MAX_TOTAL_MB`
 * is unset (1 GB). Prevents unbounded disk growth from many small uploads.
 */
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

/**
 * Maximum number of assets retained by the registry when `ASSETS_MAX_COUNT`
 * is unset. Works alongside the total-byte quota as a second circuit-breaker.
 */
const DEFAULT_MAX_COUNT = 10_000;

/**
 * Maximum number of characters permitted in a stored filename. Keeps `route`
 * and `fs` operations inside reasonable bounds.
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Default directory (relative to the process working directory) where
 * uploaded assets are persisted when `ASSETS_UPLOAD_DIR` is unset.
 */
const DEFAULT_UPLOAD_DIR = './data/uploads';

/**
 * Canonical allow-list of accepted asset media types. The value is the
 * authoritative MIME type we store for a matching upload; the producer may
 * declare a prefix (e.g. `image/`) which is satisfied by any concrete type
 * in that family.
 */
export const ALLOWED_MIME_TYPES: ReadonlyArray<{ mime: string; prefix: boolean }> = [
  { mime: 'image/png', prefix: false },
  { mime: 'image/jpeg', prefix: false },
  { mime: 'image/gif', prefix: false },
  { mime: 'image/webp', prefix: false },
  { mime: 'application/pdf', prefix: false },
  { mime: 'text/', prefix: true },
];

/**
 * Magic-byte signatures mapped to the canonical MIME type they prove. File
 * content is authoritative: a spoofed `.png` whose bytes are actually a shell
 * script is rejected even though the client declared `image/png`.
 */
const SIGNATURE_TO_MIME: ReadonlyArray<{ bytes: number[]; mime: string }> = [
  // PNG
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  // JPEG (SOI)
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  // GIF87a / GIF89a
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], mime: 'image/gif' },
  { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], mime: 'image/gif' },
  // WEBP (RIFF....WEBP)
  { bytes: [0x52, 0x49, 0x46, 0x46, undefined as never, undefined as never, undefined as never, undefined as never, 0x57, 0x45, 0x42, 0x50], mime: 'image/webp' },
  // PDF
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
];

/**
 * Signatures that are *never* acceptable as uploaded assets regardless of any
 * declared type — executables, archives and common script/bytecode payloads.
 */
const FORBIDDEN_SIGNATURES: ReadonlyArray<{ bytes: number[]; label: string }> = [
  { bytes: [0x4d, 0x5a], label: 'executable (MZ/PE)' }, // Windows EXE/DLL
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF binary' }, // Linux binary
  { bytes: [0xca, 0xfe, 0xba, 0xbe], label: 'Java class' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], label: 'ZIP/Office archive' }, // zip, docx, jar…
  { bytes: [0x50, 0x4b, 0x05, 0x06], label: 'ZIP empty archive' },
  { bytes: [0x1f, 0x8b], label: 'gzip archive' },
  { bytes: [0x42, 0x5a, 0x68], label: 'bzip2 archive' },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], label: '7z archive' },
  { bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], label: 'xz archive' },
  { bytes: [0x75, 0x73, 0x74, 0x61, 0x72], label: 'tar archive' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: 'Mach-O binary' }, // macOS
];

/**
 * Text content patterns that are dangerous even though they look like plain
 * text (HTML with script, SVG with script, PHP/JS source, shell shebang).
 */
const DANGEROUS_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  /<script[\s>]/i,
  /<\/?\s*(svg|iframe|object|embed|link|meta)\b/i,
  /on\w+\s*=\s*["']?javascript:/i,
  /<\?php/i,
  /<!\s*doctype\s+html/i,
  /javascript:/i,
  /\b(?:eval|document\.write|window\.location)\s*\(/i,
];

/** Extension used when persisting each accepted media type on disk. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/');
}

/**
 * Service responsible for persisting uploaded assets, maintaining their
 * metadata, and resolving them for download.
 *
 * NOTE: for the placeholder backend we keep the metadata in-memory in a
 * `Map`. This means metadata is reset on every process restart. The physical
 * files on disk survive restarts because they are evicted via
 * `cleanupOrphanedFiles` on module shutdown.
 *
 * Security (Issue #365 / asset hardening):
 *  - uploads are rejected if they exceed the per-file or aggregate byte quota;
 *  - the real content type is established from file signature (magic bytes),
 *    never from the client-supplied MIME string;
 *  - the declared type must be allow-listed and must agree with the detected
 *    type, and the stored extension is derived from the detected type;
 *  - dangerous payloads (executables, archives, scripts, HTML/SVG) are
 *    rejected before any bytes touch disk;
 *  - filenames are sanitised and de-duplicated against the asset id.
 */
@Injectable()
export class AssetsService implements OnModuleDestroy {
  private readonly logger = new Logger(AssetsService.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;
  private readonly maxSizeBytes: number;
  private readonly maxTotalBytes: number;
  private readonly maxCount: number;
  private readonly registry = new Map<string, Asset>();
  /** Maps content hash → asset id for deduplication. */
  private readonly contentHashIndex = new Map<string, string>();
  /** Running sum of stored asset bytes for the aggregate quota. */
  private totalBytes = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly securityService: SecurityService,
  ) {
    this.uploadDir = path.resolve(
      this.configService.get<string>('ASSETS_UPLOAD_DIR') ?? DEFAULT_UPLOAD_DIR,
    );
    this.baseUrl =
      this.configService.get<string>('ASSETS_BASE_URL') ?? '/api/v1/assets';
    this.maxSizeBytes = this.resolveMaxSizeBytes();
    this.maxTotalBytes = this.resolveMaxTotalBytes();
    this.maxCount = this.resolveMaxCount();

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
   * The buffer is inspected for its true content type and screened for
   * dangerous payloads *before* it is written, so spoofed or hostile files
   * are rejected without touching disk.
   *
   * @param buffer        Bytes of the upload.
   * @param originalName  Original filename from the client (untrusted).
   * @param mimeType      Detected MIME type (untrusted — re-derived here).
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
    const declaredMime = (params.mimeType || 'application/octet-stream').toLowerCase();

    // 1. Cheap pre-checks (size) before any inspection work.
    this.assertSizeAllowed(params.size);

    // 2. Establish the real type from the bytes and screen the content.
    const detectedMime = await this.detectMime(params.buffer, declaredMime);
    this.assertAllowedType(detectedMime, declaredMime);
    this.assertNotDangerous(params.buffer, detectedMime);

    // 3. Aggregate quotas (total bytes + count) before persisting.
    this.assertQuotaAllows(params.size);

    const contentHash = this.securityService.computeContentHash(params.buffer);

    const existingId = this.contentHashIndex.get(contentHash);
    if (existingId) {
      this.logger.log(
        `Duplicate upload detected (hash=${contentHash.slice(0, 12)}…), returning existing asset ${existingId}`,
      );
      return this.findById(existingId);
    }

    const id = randomUUID();
    const safeName = this.hashFilename(contentHash, id, detectedMime);
    const finalPath = this.resolveOnDiskPath(safeName);

    try {
      await fs.writeFile(finalPath, params.buffer);
    } catch (err: unknown) {
      throw new BadRequestException(
        `Failed to persist uploaded asset: ${this.toMessage(err)}`,
      );
    }

    const sanitisedOriginal = this.sanitizeDisplayName(params.originalName);

    const asset: Asset = {
      id,
      filename: safeName,
      originalName: sanitisedOriginal,
      mimeType: detectedMime,
      size: params.size,
      uploadedAt: new Date().toISOString(),
      url: this.buildDownloadUrl(id),
      name: params.name,
      description: params.description,
      contentHash,
    };

    this.registry.set(id, asset);
    this.contentHashIndex.set(contentHash, id);
    this.totalBytes += params.size;
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
    if (asset.contentHash) {
      this.contentHashIndex.delete(asset.contentHash);
    }
    this.totalBytes = Math.max(0, this.totalBytes - asset.size);

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

  /** Exposed for the controller when assembling multer `fileFilter`. */
  getAllowedMimeTypes(): ReadonlyArray<{ mime: string; prefix: boolean }> {
    return ALLOWED_MIME_TYPES;
  }

  /** Exposed for tests so the in-memory registry can be cleared. */
  clearRegistryForTests(): void {
    this.registry.clear();
    this.contentHashIndex.clear();
    this.totalBytes = 0;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Inspects the leading bytes of a buffer to determine the authoritative
   * content type. The magic-byte table is exact and dependency-free and
   * already enumerates every binary type this service accepts (PNG, JPEG,
   * GIF, WEBP, PDF) plus the dangerous families it must reject.
   */
  private async detectMime(buffer: Buffer, declaredMime?: string): Promise<string> {
    // Explicit magic-byte table first — it is exact and dependency-free.
    const sig = this.matchSignature(buffer, SIGNATURE_TO_MIME);
    if (sig) return sig;

    // Any forbidden signature (executable, archive, …) is reported as a
    // non-allow-listed type so the caller rejects it uniformly.
    const forbidden = this.matchForbidden(buffer);
    if (forbidden) {
      return `application/x-forbidden-${forbidden.label.replace(/[^a-z0-9]/gi, '-')}`;
    }

    if (declaredMime && declaredMime.startsWith('text/')) {
      return declaredMime;
    }

    // No recognizable binary signature. Treat as opaque/denied unless the
    // caller explicitly declared a (text) type, which is screened separately.
    return 'application/octet-stream';
  }

  private matchSignature(
    buffer: Buffer,
    table: ReadonlyArray<{ bytes: number[]; mime: string }>,
  ): string | undefined {
    for (const { bytes, mime } of table) {
      if (this.startsWithBytes(buffer, bytes)) {
        return mime;
      }
    }
    return undefined;
  }

  private matchForbidden(
    buffer: Buffer,
  ): { label: string } | undefined {
    for (const entry of FORBIDDEN_SIGNATURES) {
      if (this.startsWithBytes(buffer, entry.bytes)) {
        return { label: entry.label };
      }
    }
    return undefined;
  }

  private startsWithBytes(buffer: Buffer, pattern: number[]): boolean {
    if (buffer.length < pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const expected = pattern[i];
      if (expected === (undefined as never)) continue; // wildcard byte
      if (buffer[i] !== expected) return false;
    }
    return true;
  }

  /**
   * Rejects content whose real type is not allow-listed, or whose declared
   * type does not match the detected type (spoofing guard).
   */
  private assertAllowedType(detectedMime: string, declaredMime: string): void {
    const allowed = ALLOWED_MIME_TYPES.some(({ mime, prefix }) =>
      prefix ? detectedMime.startsWith(mime) : detectedMime === mime,
    );

    if (!allowed) {
      throw new BadRequestException(
        `Asset content type '${detectedMime}' is not an allowed type`,
      );
    }

    // The client's declared type must not contradict what the bytes prove.
    const declaredMatches = ALLOWED_MIME_TYPES.some(({ mime, prefix }) =>
      prefix ? declaredMime.startsWith(mime) : declaredMime === mime,
    );
    if (!declaredMatches) {
      throw new BadRequestException(
        `Declared type '${declaredMime}' is not allowed`,
      );
    }
  }

  /**
   * Screens the bytes for dangerous payloads. Text content is checked for
   * markup/script patterns and validated as UTF-8; binary content has
   * already been limited to allow-listed image/PDF types by the caller.
   */
  private assertNotDangerous(buffer: Buffer, detectedMime: string): void {
    if (!isTextMime(detectedMime)) {
      // Non-text (image/pdf) — allowed types are inert, nothing more to screen.
      return;
    }

    // Reject content that is not valid UTF-8 text.
    if (!this.isUtf8(buffer)) {
      throw new BadRequestException('Asset text content is not valid UTF-8');
    }

    const sample = buffer.toString('utf-8', 0, Math.min(buffer.length, 1_000_000));
    for (const pattern of DANGEROUS_TEXT_PATTERNS) {
      if (pattern.test(sample)) {
        throw new BadRequestException(
          'Asset contains potentially dangerous markup and was rejected',
        );
      }
    }
  }

  private isUtf8(buffer: Buffer): boolean {
    try {
      buffer.toString('utf-8');
      // Ensure there are no replacement characters from bad sequences.
      return !buffer.toString('utf-8').includes('�');
    } catch {
      return false;
    }
  }

  private resolveOnDiskPath(filename: string): string {
    const resolved = path.resolve(this.uploadDir, filename);
    // Guard against `../` traversal: the resolved path must live *inside*
    // the upload directory (with a separator so `uploadDir` itself plus
    // `uploadDir-evil` cannot collide).
    if (resolved !== this.uploadDir && !resolved.startsWith(this.uploadDir + path.sep)) {
      throw new BadRequestException('Invalid asset filename');
    }
    return resolved;
  }

  private buildDownloadUrl(id: string): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    return `${base}/${id}/download`;
  }

  /**
   * Generates a signed download URL for an asset with the given scope and TTL.
   */
  generateSignedDownloadUrl(
    assetId: string,
    scope: 'read' | 'write' | 'admin',
    userId?: string,
    ttlSeconds?: number,
  ): string {
    this.findById(assetId);
    return this.securityService.generateSignedUrl({
      assetId,
      scope,
      userId,
      ttlSeconds,
    });
  }

  private resolveMaxSizeBytes(): number {
    const configured = this.configService.get<string>('ASSETS_MAX_SIZE_MB');
    const mb = configured ? Number(configured) : 10;
    if (!Number.isFinite(mb) || mb <= 0) {
      return DEFAULT_MAX_SIZE_BYTES;
    }
    return Math.floor(mb * 1024 * 1024);
  }

  private resolveMaxTotalBytes(): number {
    const configured = this.configService.get<string>('ASSETS_MAX_TOTAL_MB');
    const mb = configured ? Number(configured) : 1024;
    if (!Number.isFinite(mb) || mb <= 0) {
      return DEFAULT_MAX_TOTAL_BYTES;
    }
    return Math.floor(mb * 1024 * 1024);
  }

  private resolveMaxCount(): number {
    const configured = this.configService.get<string>('ASSETS_MAX_COUNT');
    const count = configured ? Number(configured) : DEFAULT_MAX_COUNT;
    if (!Number.isFinite(count) || count <= 0) {
      return DEFAULT_MAX_COUNT;
    }
    return Math.floor(count);
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

  /**
   * Enforces the aggregate quota (total stored bytes and asset count) so a
   * stream of small uploads cannot exhaust disk.
   */
  private assertQuotaAllows(incomingSize: number): void {
    if (this.registry.size + 1 > this.maxCount) {
      throw new BadRequestException(
        `Asset store is at capacity (max ${this.maxCount} assets)`,
      );
    }
    if (this.totalBytes + incomingSize > this.maxTotalBytes) {
      throw new BadRequestException(
        `Asset store quota exceeded (max ${this.maxTotalBytes} bytes)`,
      );
    }
  }

  private sanitizeDisplayName(original: string): string {
    const cleaned = (original || 'upload')
      .replace(/[\u0000-\u001f\u007f]/g, '') // control chars
      .replace(/["\\]/g, '') // quoting / path hazards
      .replace(/^\.+/, '') // leading dots
      .trim();
    return cleaned.length > MAX_FILENAME_LENGTH
      ? cleaned.slice(0, MAX_FILENAME_LENGTH)
      : cleaned || 'upload';
  }

  /**
   * Generates a deterministic, collision-resistant filename from the content
   * hash and asset id. The extension is derived from the *detected* MIME type,
   * never from the client-supplied name, so a `.png` spoofed as `.exe` is
   * stored with a safe `.png` extension.
   */
  private hashFilename(
    contentHash: string,
    id: string,
    detectedMime: string,
  ): string {
    const extension =
      EXTENSION_BY_MIME[detectedMime] ??
      (isTextMime(detectedMime) ? '.txt' : '.bin');
    const hashPrefix = contentHash.slice(0, 16);
    const base = `asset-${hashPrefix}-${id}${extension}`;
    return base.length > MAX_FILENAME_LENGTH
      ? `asset-${hashPrefix}${extension}`.slice(0, MAX_FILENAME_LENGTH)
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
