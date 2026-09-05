import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

import { AssetsService, ALLOWED_MIME_TYPES } from './assets.service';
import { SecurityService } from '../security/security.service';
import type { Asset } from './interfaces/asset.interface';

function pngBuffer(): Buffer {
  // Minimal valid 1x1 PNG magic header (content inspection will accept it).
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082',
    'hex',
  );
}

function textBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('AssetsService', () => {
  let service: AssetsService;
  let tmpDir: string;
  let originalUploadDir: string | undefined;
  let originalBaseUrl: string | undefined;
  let originalMaxMb: string | undefined;
  let originalTotalMb: string | undefined;
  let originalMaxCount: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assets-spec-'));
    originalUploadDir = process.env.ASSETS_UPLOAD_DIR;
    originalBaseUrl = process.env.ASSETS_BASE_URL;
    originalMaxMb = process.env.ASSETS_MAX_SIZE_MB;
    originalTotalMb = process.env.ASSETS_MAX_TOTAL_MB;
    originalMaxCount = process.env.ASSETS_MAX_COUNT;
    process.env.ASSETS_UPLOAD_DIR = tmpDir;
    process.env.ASSETS_MAX_SIZE_MB = '5';
    process.env.ASSETS_MAX_TOTAL_MB = '1';
    process.env.ASSETS_MAX_COUNT = '3';
    process.env.ASSETS_BASE_URL = '/api/v1/assets';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'ASSETS_UPLOAD_DIR') return tmpDir;
              if (key === 'ASSETS_MAX_SIZE_MB') return '5';
              if (key === 'ASSETS_MAX_TOTAL_MB') return '1';
              if (key === 'ASSETS_MAX_COUNT') return '3';
              if (key === 'ASSETS_BASE_URL') return '/api/v1/assets';
              return undefined;
            },
          },
        },
        {
          provide: SecurityService,
          useValue: {
            computeContentHash: (b: Buffer) =>
              crypto.createHash('sha256').update(b).digest('hex'),
          },
        },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
    // Allow the eager mkdir inside the service constructor to settle.
    await new Promise((resolve) => setImmediate(resolve));
  });

  afterEach(async () => {
    process.env.ASSETS_UPLOAD_DIR = originalUploadDir;
    process.env.ASSETS_BASE_URL = originalBaseUrl;
    process.env.ASSETS_MAX_SIZE_MB = originalMaxMb;
    process.env.ASSETS_MAX_TOTAL_MB = originalTotalMb;
    process.env.ASSETS_MAX_COUNT = originalMaxCount;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('persists a buffered upload and exposes metadata', async () => {
    const asset = await service.registerBuffer({
      buffer: Buffer.from('hello world'),
      originalName: 'greeting.txt',
      mimeType: 'text/plain',
      size: 11,
      name: 'Greeting',
      description: 'A small text greeting',
    });

    expect(asset.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(asset.size).toBe(11);
    expect(asset.originalName).toBe('greeting.txt');
    expect(asset.url).toBe(`/api/v1/assets/${asset.id}/download`);
    expect(asset.name).toBe('Greeting');
    expect(asset.description).toBe('A small text greeting');

    const onDisk = path.join(tmpDir, asset.filename);
    const written = await fs.readFile(onDisk, 'utf-8');
    expect(written).toBe('hello world');
  });

  it('rejects uploads with disallowed MIME types', async () => {
    await expect(
      service.registerBuffer({
        buffer: Buffer.from('???'),
        originalName: 'script.bin',
        mimeType: 'application/x-msdos-program',
        size: 3,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects zero-byte and over-limit uploads', async () => {
    await expect(
      service.registerBuffer({
        buffer: Buffer.alloc(0),
        originalName: 'empty.bin',
        mimeType: 'image/png',
        size: 0,
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.registerBuffer({
        buffer: Buffer.alloc(6 * 1024 * 1024),
        originalName: 'big.png',
        mimeType: 'image/png',
        size: 6 * 1024 * 1024,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lists assets newest first by default', async () => {
    const first = await service.registerBuffer({
      buffer: Buffer.from('1'),
      originalName: 'a.txt',
      mimeType: 'text/plain',
      size: 1,
    });
    // Force the second upload to have a strictly newer timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await service.registerBuffer({
      buffer: Buffer.from('2'),
      originalName: 'b.txt',
      mimeType: 'text/plain',
      size: 1,
    });

    const newest = service.list();
    expect(newest.total).toBe(2);
    expect(newest.assets[0].id).toBe(second.id);
    expect(newest.assets[1].id).toBe(first.id);

    const oldest = service.list('oldest');
    expect(oldest.assets[0].id).toBe(first.id);

    const byName = service.list('name');
    expect(byName.assets[0].originalName).toBe('a.txt');
    expect(byName.assets[1].originalName).toBe('b.txt');
  });

  it('throws NotFoundException for lookups of unknown assets', () => {
    expect(() => service.findById('11111111-1111-4111-8111-111111111111')).toThrow(
      NotFoundException,
    );
  });

  it('deletes an asset and removes its file from disk', async () => {
    const asset = await service.registerBuffer({
      buffer: Buffer.from('bye'),
      originalName: 'bye.txt',
      mimeType: 'text/plain',
      size: 3,
    });

    const onDisk = path.join(tmpDir, asset.filename);
    await expect(fs.access(onDisk)).resolves.toBeUndefined();

    await service.remove(asset.id);
    await expect(fs.access(onDisk)).rejects.toThrow();

    expect(() => service.findById(asset.id)).toThrow(NotFoundException);
  });

  it('produces a sanitized filename that contains the asset id and a safe extension', async () => {
    const asset = await service.registerBuffer({
      buffer: textBuffer('x'),
      originalName: '../etc/passwd',
      mimeType: 'text/plain',
      size: 1,
    });
    expect(asset.filename).not.toContain('..');
    expect(asset.filename).not.toContain('/');
    expect(asset.filename).toContain(asset.id);
    expect(asset.filename.endsWith('.txt')).toBe(true);
  });

  it('uses the default size limit when ASSETS_MAX_SIZE_MB is invalid', async () => {
    const altTmp = await fs.mkdtemp(path.join(os.tmpdir(), 'assets-spec-alt-'));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'ASSETS_UPLOAD_DIR') return altTmp;
              if (key === 'ASSETS_MAX_SIZE_MB') return 'not-a-number';
              if (key === 'ASSETS_MAX_TOTAL_MB') return undefined;
              if (key === 'ASSETS_MAX_COUNT') return undefined;
              if (key === 'ASSETS_BASE_URL') return '/api/v1/assets';
              return undefined;
            },
          },
        },
        {
          provide: SecurityService,
          useValue: {
            computeContentHash: (b: Buffer) =>
              crypto.createHash('sha256').update(b).digest('hex'),
          },
        },
      ],
    }).compile();

    const altService = module.get<AssetsService>(AssetsService);
    expect(altService.getMaxSizeBytes()).toBe(10 * 1024 * 1024);
    await fs.rm(altTmp, { recursive: true, force: true });
  });

  describe('content inspection', () => {
    it('stores image files based on their real signature, not the declared type', async () => {
      const asset = await service.registerBuffer({
        buffer: pngBuffer(),
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: pngBuffer().length,
      });

      expect(asset.mimeType).toBe('image/png');
      expect(asset.filename.endsWith('.png')).toBe(true);
    });

    it('rejects a spoofed image whose bytes are actually an executable', async () => {
      const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(64, 0)]);
      await expect(
        service.registerBuffer({
          buffer: exe,
          originalName: 'trojan.png',
          mimeType: 'image/png',
          size: exe.length,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects HTML / SVG disguised as text', async () => {
      await expect(
        service.registerBuffer({
          buffer: textBuffer('<script>alert(1)</script>'),
          originalName: 'note.txt',
          mimeType: 'text/plain',
          size: 25,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-UTF-8 binary content declared as text', async () => {
      await expect(
        service.registerBuffer({
          buffer: Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]),
          originalName: 'blob.txt',
          mimeType: 'text/plain',
          size: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('quotas', () => {
    it('enforces the aggregate byte quota', async () => {
      // 1 MB total budget -> a 600 KB file fits, a second one is rejected.
      const big = Buffer.alloc(600 * 1024, 0x41);
      await service.registerBuffer({
        buffer: big,
        originalName: 'a.txt',
        mimeType: 'text/plain',
        size: big.length,
      });

      await expect(
        service.registerBuffer({
          buffer: big,
          originalName: 'b.txt',
          mimeType: 'text/plain',
          size: big.length,
        }),
      ).rejects.toThrow(/quota/);
    });

    it('enforces the maximum asset count', async () => {
      for (let i = 0; i < 3; i++) {
        await service.registerBuffer({
          buffer: textBuffer(`item-${i}`),
          originalName: `item-${i}.txt`,
          mimeType: 'text/plain',
          size: `item-${i}`.length,
        });
      }

      await expect(
        service.registerBuffer({
          buffer: textBuffer('overflow'),
          originalName: 'overflow.txt',
          mimeType: 'text/plain',
          size: 8,
        }),
      ).rejects.toThrow(/capacity/);
    });

    it('releases quota on delete', async () => {
      const asset = await service.registerBuffer({
        buffer: Buffer.alloc(600 * 1024, 0x41),
        originalName: 'a.txt',
        mimeType: 'text/plain',
        size: 600 * 1024,
      });
      await service.remove(asset.id);

      // Budget freed up, a new file can be stored again.
      const next = await service.registerBuffer({
        buffer: textBuffer('freed'),
        originalName: 'freed.txt',
        mimeType: 'text/plain',
        size: 5,
      });
      expect(next.id).toBeDefined();
    });
  });

  it('exposes the canonical allow-list for the controller fileFilter', () => {
    expect(ALLOWED_MIME_TYPES.some((t) => t.mime === 'image/png')).toBe(true);
    expect(ALLOWED_MIME_TYPES.some((t) => t.mime === 'text/' && t.prefix)).toBe(true);
  });
});
