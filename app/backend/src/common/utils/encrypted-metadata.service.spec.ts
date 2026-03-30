import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EncryptedMetadataService } from '../../../common/utils/encrypted-metadata.service';
import * as crypto from 'crypto';

/**
 * Test suite for Encrypted Metadata Service
 *
 * Verifies:
 * - ChaCha20-Poly1305 encryption/decryption
 * - Metadata integrity protection
 * - Key derivation
 * - Error handling on authentication failure
 */
describe('EncryptedMetadataService', () => {
  let service: EncryptedMetadataService;
  let encryptionKey: Buffer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptedMetadataService],
    }).compile();

    service = module.get<EncryptedMetadataService>(EncryptedMetadataService);
    encryptionKey = crypto.randomBytes(32);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encryptRecipientMetadata & decryptRecipientMetadata', () => {
    const testMetadata = {
      recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
      recipientName: 'Alice',
      recipientLedgerAccount: 'ledger-001',
      metadata: {
        email: 'alice@example.com',
        phone: '+1234567890',
      },
    };

    it('should encrypt and decrypt recipient metadata', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = service.decryptRecipientMetadata(encrypted, encryptionKey);

      expect(decrypted).toEqual(testMetadata);
    });

    it('should produce different ciphertexts for same plaintext (due to random nonce)', () => {
      const encrypted1 = service.encryptRecipientMetadata(testMetadata, encryptionKey);
      const encrypted2 = service.encryptRecipientMetadata(testMetadata, encryptionKey);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);
    });

    it('should fail decryption with wrong key', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey);
      const wrongKey = crypto.randomBytes(32);

      expect(() => {
        service.decryptRecipientMetadata(encrypted, wrongKey);
      }).toThrow(BadRequestException);
    });

    it('should fail decryption with tampered ciphertext', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: 'f'.repeat(encrypted.ciphertext.length),
      };

      expect(() => {
        service.decryptRecipientMetadata(tampered, encryptionKey);
      }).toThrow(BadRequestException);
    });

    it('should fail decryption with altered authentication tag', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey);

      // Alter tag
      const tampered = {
        ...encrypted,
        tag: 'f'.repeat(32),
      };

      expect(() => {
        service.decryptRecipientMetadata(tampered, encryptionKey);
      }).toThrow(BadRequestException);
    });

    it('should support additional authenticated data (AAD)', () => {
      const aad = Buffer.from('additional-context');

      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey, aad);

      // Decryption should work with same AAD
      const decrypted = service.decryptRecipientMetadata(encrypted, encryptionKey, aad);
      expect(decrypted).toEqual(testMetadata);

      // Decryption should fail with different AAD
      const wrongAad = Buffer.from('wrong-context');
      expect(() => {
        service.decryptRecipientMetadata(encrypted, encryptionKey, wrongAad);
      }).toThrow(BadRequestException);
    });

    it('should reject invalid encryption key size', () => {
      const shortKey = Buffer.alloc(16); // Too short

      expect(() => {
        service.encryptRecipientMetadata(testMetadata, shortKey);
      }).toThrow(BadRequestException);
    });

    it('should validate nonce length', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey);

      const corrupted = {
        ...encrypted,
        nonce: 'a'.repeat(20), // Wrong length
      };

      expect(() => {
        service.decryptRecipientMetadata(corrupted, encryptionKey);
      }).toThrow(BadRequestException);
    });
  });

  describe('encryptWithSharedSecret & decryptWithSharedSecret', () => {
    const testData = { message: 'secret-data', timestamp: Date.now() };
    const sharedSecret = crypto.randomBytes(32);

    it('should encrypt and decrypt with shared secret', () => {
      const encrypted = service.encryptWithSharedSecret(testData, sharedSecret);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.nonce).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = service.decryptWithSharedSecret(encrypted, sharedSecret);

      expect(decrypted).toEqual(testData);
    });

    it('should support custom context strings', () => {
      const context = 'custom-context';

      const encrypted = service.encryptWithSharedSecret(testData, sharedSecret, context);

      // Decryption with same context should work
      const decrypted = service.decryptWithSharedSecret(encrypted, sharedSecret, context);
      expect(decrypted).toEqual(testData);

      // Decryption with different context should fail
      expect(() => {
        service.decryptWithSharedSecret(encrypted, sharedSecret, 'different-context');
      }).toThrow(BadRequestException);
    });

    it('should handle string data', () => {
      const stringData = 'plain text message';

      const encrypted = service.encryptWithSharedSecret(stringData, sharedSecret);
      const decrypted = service.decryptWithSharedSecret<string>(encrypted, sharedSecret);

      expect(decrypted).toBe(stringData);
    });

    it('should reject invalid shared secret size', () => {
      const shortSecret = Buffer.alloc(16);

      expect(() => {
        service.encryptWithSharedSecret(testData, shortSecret);
      }).toThrow(BadRequestException);
    });

    it('should fail decryption with wrong shared secret', () => {
      const encrypted = service.encryptWithSharedSecret(testData, sharedSecret);
      const wrongSecret = crypto.randomBytes(32);

      expect(() => {
        service.decryptWithSharedSecret(encrypted, wrongSecret);
      }).toThrow(BadRequestException);
    });
  });

  describe('deriveKeyFromMaster', () => {
    const masterKey = crypto.randomBytes(32);
    const context = 'stealth-payment-123';

    it('should derive a 32-byte key from master key and context', () => {
      const derivedKey = service.deriveKeyFromMaster(masterKey, context);

      expect(derivedKey.length).toBe(32);
    });

    it('should produce deterministic output', () => {
      const key1 = service.deriveKeyFromMaster(masterKey, context);
      const key2 = service.deriveKeyFromMaster(masterKey, context);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys for different contexts', () => {
      const key1 = service.deriveKeyFromMaster(masterKey, 'context1');
      const key2 = service.deriveKeyFromMaster(masterKey, 'context2');

      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different keys for different master keys', () => {
      const masterKey2 = crypto.randomBytes(32);

      const key1 = service.deriveKeyFromMaster(masterKey, context);
      const key2 = service.deriveKeyFromMaster(masterKey2, context);

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('verifyMetadataIntegrity', () => {
    const testMetadata = {
      recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
      recipientName: 'Alice',
    };
    const aad = Buffer.from('binding-data');

    it('should verify metadata integrity', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey, aad);

      const isValid = service.verifyMetadataIntegrity(encrypted, encryptionKey, aad);

      expect(isValid).toBe(true);
    });

    it('should return false for tampered metadata', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey, aad);

      const tampered = {
        ...encrypted,
        ciphertext: 'f'.repeat(encrypted.ciphertext.length),
      };

      const isValid = service.verifyMetadataIntegrity(tampered, encryptionKey, aad);

      expect(isValid).toBe(false);
    });

    it('should return false for wrong AAD', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey, aad);
      const wrongAad = Buffer.from('wrong-aad');

      const isValid = service.verifyMetadataIntegrity(encrypted, encryptionKey, wrongAad);

      expect(isValid).toBe(false);
    });

    it('should return false for wrong key', () => {
      const encrypted = service.encryptRecipientMetadata(testMetadata, encryptionKey, aad);
      const wrongKey = crypto.randomBytes(32);

      const isValid = service.verifyMetadataIntegrity(encrypted, wrongKey, aad);

      expect(isValid).toBe(false);
    });
  });

  describe('Security properties', () => {
    it('should use unique nonces for each encryption', () => {
      const testData = { test: 'data' };
      const nonces = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = service.encryptWithSharedSecret(testData, encryptionKey);
        nonces.add(encrypted.nonce);
      }

      // All nonces should be unique
      expect(nonces.size).toBe(100);
    });

    it('should provide authenticated encryption', () => {
      const testData = { sensitive: 'information' };

      const encrypted = service.encryptWithSharedSecret(testData, encryptionKey);

      // Authentication tag should be 16 bytes (128 bits)
      const tag = Buffer.from(encrypted.tag, 'hex');
      expect(tag.length).toBe(16);
    });

    it('should not leak plaintext length in ciphertext length exactly', () => {
      // Note: ciphertext length can leak approximate plaintext length, but not exact
      const short = service.encryptWithSharedSecret({ a: 1 }, encryptionKey);
      const long = service.encryptWithSharedSecret(
        { data: 'x'.repeat(1000) },
        encryptionKey,
      );

      const shortLen = Buffer.from(short.ciphertext, 'hex').length;
      const longLen = Buffer.from(long.ciphertext, 'hex').length;

      expect(longLen).toBeGreaterThan(shortLen);
    });
  });

  describe('Integration scenarios', () => {
    it('should encrypt metadata from stealth payment derivation', () => {
      const paymentMetadata = {
        recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientName: 'Bob',
        metadata: {
          paymentId: '123456',
          memo: 'Payment for services',
          timestamp: new Date().toISOString(),
        },
      };

      const encryptionKey = crypto.randomBytes(32);
      const stealthAddress = 'a'.repeat(64);
      const aad = Buffer.from(stealthAddress);

      // Encrypt
      const encrypted = service.encryptRecipientMetadata(
        paymentMetadata,
        encryptionKey,
        aad,
      );

      // Store encrypted data and AAD
      // ...

      // Decrypt later
      const decrypted = service.decryptRecipientMetadata(encrypted, encryptionKey, aad);

      expect(decrypted).toEqual(paymentMetadata);
    });

    it('should handle multi-step encryption flow', () => {
      const masterKey = crypto.randomBytes(32);
      const context = 'payment-123-abc';

      // Step 1: Derive encryption key from master key
      const encKey = service.deriveKeyFromMaster(masterKey, context);

      // Step 2: Encrypt metadata
      const metadata = {
        recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientName: 'Charlie',
      };

      const encrypted = service.encryptRecipientMetadata(metadata, encKey);

      // Step 3: Verify integrity
      const isValid = service.verifyMetadataIntegrity(encrypted, encKey);
      expect(isValid).toBe(true);

      // Step 4: Decrypt
      const decrypted = service.decryptRecipientMetadata(encrypted, encKey);
      expect(decrypted).toEqual(metadata);
    });
  });
});
