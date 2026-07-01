import { Test, TestingModule } from '@nestjs/testing';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { NotFoundException } from '@nestjs/common';
import type { Asset, AssetListResponse } from './interfaces/asset.interface';

describe('AssetsController', () => {
  let controller: AssetsController;
  let service: jest.Mocked<AssetsService>;

  const sampleAsset: Asset = {
    id: '11111111-1111-4111-8111-111111111111',
    filename: 'asset-11111111-1111-4111-8111-111111111111.txt',
    originalName: 'sample.txt',
    mimeType: 'text/plain',
    size: 12,
    uploadedAt: '2025-01-01T00:00:00.000Z',
    url: '/api/v1/assets/11111111-1111-4111-8111-111111111111/download',
    name: 'Sample',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [
        {
          provide: AssetsService,
          useValue: {
            list: jest.fn(),
            findById: jest.fn(),
            openReadStream: jest.fn(),
            registerBuffer: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AssetsController>(AssetsController);
    service = module.get(AssetsService) as jest.Mocked<AssetsService>;
  });

  it('lists assets with newest sort by default', () => {
    const response: AssetListResponse = { total: 1, assets: [sampleAsset] };
    service.list.mockReturnValue(response);

    expect(controller.list(undefined)).toEqual(response);
    expect(service.list).toHaveBeenCalledWith('newest');
  });

  it('passes through explicit sort orders', () => {
    service.list.mockReturnValue({ total: 0, assets: [] });

    controller.list('oldest');
    expect(service.list).toHaveBeenLastCalledWith('oldest');

    controller.list('name');
    expect(service.list).toHaveBeenLastCalledWith('name');

    controller.list('bogus');
    expect(service.list).toHaveBeenLastCalledWith('newest');
  });

  it('looks up an asset by id', () => {
    service.findById.mockReturnValue(sampleAsset);
    expect(controller.findOne(sampleAsset.id)).toEqual(sampleAsset);
  });

  it('returns an open stream when downloading an asset', async () => {
    service.findById.mockReturnValue(sampleAsset);

    const stream = { on: jest.fn(), pipe: jest.fn() } as unknown as NodeJS.ReadableStream & {
      on: jest.Mock;
      pipe: jest.Mock;
    };
    service.openReadStream.mockResolvedValue(stream as never);

    const result = await controller.download(sampleAsset.id);

    expect(result).toBeDefined();
    expect(service.openReadStream).toHaveBeenCalledWith(sampleAsset.id);
  });

  it('propagates NotFoundException on download for missing assets', async () => {
    service.findById.mockImplementation(() => {
      throw new NotFoundException(`Asset 'missing' not found`);
    });

    await expect(
      controller.download('22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow(NotFoundException);
  });

  it('registers an upload through the service', async () => {
    const file = {
      buffer: Buffer.from('hello'),
      originalname: 'hello.txt',
      mimetype: 'text/plain',
      size: 5,
    } as unknown as Express.Multer.File;
    const dto = { name: 'Hello', description: 'A greeting' };

    service.registerBuffer.mockResolvedValue(sampleAsset);

    const result = await controller.upload(file, dto);

    expect(result).toEqual(sampleAsset);
    expect(service.registerBuffer).toHaveBeenCalledWith({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      name: dto.name,
      description: dto.description,
    });
  });

  it('removes an asset via the service', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove(sampleAsset.id);
    expect(service.remove).toHaveBeenCalledWith(sampleAsset.id);
  });
});
