import { Test, TestingModule } from '@nestjs/testing';
import { LinksService } from './links.service';
import { LinkMetadataRequestDto } from '../dto';
import { CryptoUtils } from '../common/utils/crypto.utils';

describe('LinksService (X-Ray v2)', () => {
  let service: LinksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LinksService],
    }).compile();

    service = module.get<LinksService>(LinksService);
  });

  it('should generate stealth address and encrypt recipient when stealthEnabled is true', async () => {
    const spendPubKey = 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5';
    const destination = 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234';
    
    const request: LinkMetadataRequestDto = {
      amount: 10,
      asset: 'XLM',
      stealthEnabled: true,
      spendPubKey,
      destination,
    };

    const result = await service.generateMetadata(request);

    expect(result.stealthEnabled).toBe(true);
    expect(result.stealthAddress).toBeDefined();
    expect(result.stealthAddress).toHaveLength(64);
    expect(result.ephPub).toBeDefined();
    expect(result.ephPub).toHaveLength(64);
    expect(result.encryptedRecipient).toBeDefined();
    expect(result.encryptedRecipient).toContain(':');
    expect(result.destination).toBeNull(); // Should be hidden in response
    expect(result.canonical).toContain('stealth=');
    expect(result.canonical).toContain('eph=');
    expect(result.canonical).not.toContain('destination=');
  });

  it('should use provided ephPub if available', async () => {
    const spendPubKey = 'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5';
    const ephPub = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    
    const request: LinkMetadataRequestDto = {
      amount: 10,
      asset: 'XLM',
      stealthEnabled: true,
      spendPubKey,
      ephPub,
    };

    const result = await service.generateMetadata(request);

    expect(result.ephPub).toBe(ephPub);
    
    const sharedSecret = CryptoUtils.deriveSharedSecret(ephPub, spendPubKey);
    const expectedStealth = CryptoUtils.deriveStealthAddress(spendPubKey, sharedSecret);
    expect(result.stealthAddress).toBe(expectedStealth);
  });
});
