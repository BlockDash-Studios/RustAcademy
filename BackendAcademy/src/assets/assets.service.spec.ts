import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  let service: AssetsService;
  let tmpDir: string;
  let originalUploadDir: string | undefined;
  let originalBaseUrl: string | undefined;
  let originalMaxMb: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'assets-spec-'));
    originalUploadDir = process.env.ASSETS_UPLOAD_DIR;
    originalBaseUrl = process.env.ASSETS_BASE_URL;
    originalMaxMb = process.env.ASSETS_MAX_SIZE_MB;
    process.env.ASSETS_UPLOAD_DIR = tmpDir;
    process.env.ASSETS_MAX_SIZE_MB = '5';
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
              if (key === 'ASSETS_BASE_URL') return '/api/v1/assets';
              return undefined;
            },
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

  it('produces a sanitized filename that contains the asset id', async () => {
    const asset = await service.registerBuffer({
      buffer: Buffer.from('x'),
      originalName: '../etc/passwd',
      mimeType: 'text/plain',
      size: 1,
    });
    expect(asset.filename).not.toContain('..');
    expect(asset.filename).not.toContain('/');
    expect(asset.filename).toContain(asset.id);
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
              if (key === 'ASSETS_BASE_URL') return '/api/v1/assets';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    const altService = module.get<AssetsService>(AssetsService);
    expect(altService.getMaxSizeBytes()).toBe(10 * 1024 * 1024);
    await fs.rm(altTmp, { recursive: true, force: true });
  });
});
