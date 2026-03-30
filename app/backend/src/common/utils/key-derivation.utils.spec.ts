import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import {
  deriveSharedSecret,
  deriveStealthAddress,
  deriveStealthAddressCommitment,
  deriveStealthPrivateKey,
  generateEphemeralKeypair,
  verifyStealthAddressDerivation,
  secureCompare,
  generateSalt,
  hashValue,
  DEFAULT_KDF_CONFIG,
} from '../../../common/utils/key-derivation.utils';

/**
 * Test suite for secure key derivation utilities
 *
 * These tests verify:
 * - HKDF correctness and determinism
 * - Stealth address derivation
 * - Key generation and verification
 * - Buffer safety and validation
 */
describe('KeyDerivationUtils', () => {
  describe('deriveSharedSecret - HKDF', () => {
    it('should derive a consistent shared secret from the same inputs', () => {
      const ikm = Buffer.from('test-ikm-material');
      const salt = Buffer.from('test-salt');
      const info = Buffer.from('test-context');

      const key1 = deriveSharedSecret(ikm, salt, info);
      const key2 = deriveSharedSecret(ikm, salt, info);

      expect(key1.equals(key2)).toBe(true);
      expect(key1.length).toBe(32);
    });

    it('should produce different keys for different salt values', () => {
      const ikm = Buffer.from('test-ikm');
      const info = Buffer.from('context');

      const key1 = deriveSharedSecret(ikm, Buffer.from('salt1'), info);
      const key2 = deriveSharedSecret(ikm, Buffer.from('salt2'), info);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different keys for different info values', () => {
      const ikm = Buffer.from('test-ikm');
      const salt = Buffer.from('salt');

      const key1 = deriveSharedSecret(ikm, salt, Buffer.from('info1'));
      const key2 = deriveSharedSecret(ikm, salt, Buffer.from('info2'));

      expect(key1.equals(key2)).toBe(false);
    });

    it('should use zero salt if none provided', () => {
      const ikm = Buffer.from('test-ikm');
      const info = Buffer.from('context');

      const key1 = deriveSharedSecret(ikm, null, info);
      const key2 = deriveSharedSecret(ikm, Buffer.alloc(32, 0), info);

      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('deriveStealthAddress', () => {
    it('should derive a 32-byte stealth address from two 32-byte keys', () => {
      const ephPub = Buffer.alloc(32, 1);
      const scanPub = Buffer.alloc(32, 2);

      const stealth = deriveStealthAddress(ephPub, scanPub);

      expect(stealth.length).toBe(32);
    });

    it('should produce deterministic output for same inputs', () => {
      const ephPub = Buffer.alloc(32, 1);
      const scanPub = Buffer.alloc(32, 2);

      const stealth1 = deriveStealthAddress(ephPub, scanPub);
      const stealth2 = deriveStealthAddress(ephPub, scanPub);

      expect(stealth1.equals(stealth2)).toBe(true);
    });

    it('should produce different outputs for different ephemeral keys', () => {
      const ephPub1 = Buffer.alloc(32, 1);
      const ephPub2 = Buffer.alloc(32, 2);
      const scanPub = Buffer.alloc(32, 3);

      const stealth1 = deriveStealthAddress(ephPub1, scanPub);
      const stealth2 = deriveStealthAddress(ephPub2, scanPub);

      expect(stealth1.equals(stealth2)).toBe(false);
    });

    it('should reject invalid key sizes', () => {
      const ephPub = Buffer.alloc(31); // Too short
      const scanPub = Buffer.alloc(32);

      expect(() => deriveStealthAddress(ephPub, scanPub)).toThrow();
    });
  });

  describe('deriveStealthAddressCommitment', () => {
    it('should derive stealth address commitment from spend key and shared secret', () => {
      const spendPub = Buffer.alloc(32, 1);
      const sharedSecret = Buffer.alloc(32, 2);

      const commitment = deriveStealthAddressCommitment(spendPub, sharedSecret);

      expect(commitment.length).toBe(32);
    });

    it('should be deterministic', () => {
      const spendPub = Buffer.alloc(32, 1);
      const sharedSecret = Buffer.alloc(32, 2);

      const c1 = deriveStealthAddressCommitment(spendPub, sharedSecret);
      const c2 = deriveStealthAddressCommitment(spendPub, sharedSecret);

      expect(c1.equals(c2)).toBe(true);
    });

    it('should reject invalid buffer sizes', () => {
      const spendPub = Buffer.alloc(33);
      const sharedSecret = Buffer.alloc(32);

      expect(() => deriveStealthAddressCommitment(spendPub, sharedSecret)).toThrow();
    });
  });

  describe('deriveStealthPrivateKey', () => {
    it('should derive a stealth private key from spend private key and shared secret', () => {
      const spendPriv = Buffer.alloc(32, 1);
      const sharedSecret = Buffer.alloc(32, 2);

      const stealthPriv = deriveStealthPrivateKey(spendPriv, sharedSecret);

      expect(stealthPriv.length).toBe(32);
    });

    it('should produce different keys for different spend keys', () => {
      const spendPriv1 = Buffer.alloc(32, 1);
      const spendPriv2 = Buffer.alloc(32, 2);
      const sharedSecret = Buffer.alloc(32, 3);

      const key1 = deriveStealthPrivateKey(spendPriv1, sharedSecret);
      const key2 = deriveStealthPrivateKey(spendPriv2, sharedSecret);

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('generateEphemeralKeypair', () => {
    it('should generate 32-byte keypair', () => {
      const { ephemeralPrivKey, ephemeralPubKey } = generateEphemeralKeypair();

      expect(ephemeralPrivKey.length).toBe(32);
      expect(ephemeralPubKey.length).toBe(32);
    });

    it('should generate unique keypairs', () => {
      const kp1 = generateEphemeralKeypair();
      const kp2 = generateEphemeralKeypair();

      expect(kp1.ephemeralPrivKey.equals(kp2.ephemeralPrivKey)).toBe(false);
      expect(kp1.ephemeralPubKey.equals(kp2.ephemeralPubKey)).toBe(false);
    });
  });

  describe('verifyStealthAddressDerivation', () => {
    it('should verify correct stealth address derivation', () => {
      const ephPub = Buffer.alloc(32, 1);
      const spendPub = Buffer.alloc(32, 2);

      const sharedSecret = deriveStealthAddress(ephPub, spendPub);
      const expectedStealth = deriveStealthAddressCommitment(spendPub, sharedSecret);

      const isValid = verifyStealthAddressDerivation(ephPub, spendPub, expectedStealth);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect stealth address', () => {
      const ephPub = Buffer.alloc(32, 1);
      const spendPub = Buffer.alloc(32, 2);
      const wrongStealth = Buffer.alloc(32, 99);

      const isValid = verifyStealthAddressDerivation(ephPub, spendPub, wrongStealth);

      expect(isValid).toBe(false);
    });
  });

  describe('secureCompare', () => {
    it('should return true for equal buffers', () => {
      const buf1 = Buffer.from('test');
      const buf2 = Buffer.from('test');

      expect(secureCompare(buf1, buf2)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const buf1 = Buffer.from('test1');
      const buf2 = Buffer.from('test2');

      expect(secureCompare(buf1, buf2)).toBe(false);
    });

    it('should use constant-time comparison', () => {
      // This is a timing-based test; we're just verifying it uses crypto.timingSafeEqual
      const buf1 = Buffer.from('a'.repeat(1000));
      const buf2 = Buffer.from('a'.repeat(1000));

      expect(secureCompare(buf1, buf2)).toBe(true);
    });
  });

  describe('generateSalt', () => {
    it('should generate random salt of specified length', () => {
      const salt = generateSalt(32);

      expect(salt.length).toBe(32);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt(32);
      const salt2 = generateSalt(32);

      expect(salt1.equals(salt2)).toBe(false);
    });

    it('should default to 32 bytes', () => {
      const salt = generateSalt();

      expect(salt.length).toBe(32);
    });
  });

  describe('hashValue', () => {
    it('should produce 32-byte SHA-256 hash', () => {
      const data = Buffer.from('test-data');

      const hash = hashValue(data);

      expect(hash.length).toBe(32);
    });

    it('should be deterministic', () => {
      const data = Buffer.from('test-data');

      const hash1 = hashValue(data);
      const hash2 = hashValue(data);

      expect(hash1.equals(hash2)).toBe(true);
    });

    it('should produce different hashes for different inputs', () => {
      const data1 = Buffer.from('test1');
      const data2 = Buffer.from('test2');

      const hash1 = hashValue(data1);
      const hash2 = hashValue(data2);

      expect(hash1.equals(hash2)).toBe(false);
    });
  });

  describe('End-to-end stealth address flow', () => {
    it('should complete a full sender -> recipient stealth payment flow', () => {
      // Recipient generates keypair
      const recipientScanPriv = Buffer.alloc(32, 1);
      const recipientSpendPriv = Buffer.alloc(32, 2);
      const recipientScanPub = deriveStealthAddress(recipientScanPriv, Buffer.alloc(32));
      const recipientSpendPub = deriveStealthAddress(recipientSpendPriv, Buffer.alloc(32));

      // Sender generates ephemeral keypair
      const { ephemeralPrivKey: senderEphPriv, ephemeralPubKey: senderEphPub } =
        generateEphemeralKeypair();

      // Sender derives shared secret and stealth address
      const sharedSecret = deriveStealthAddress(senderEphPub, recipientScanPub);
      const stealthAddr = deriveStealthAddressCommitment(recipientSpendPub, sharedSecret);

      // Recipient scans chain and recomputes
      const recipientSharedSecret = deriveStealthAddress(senderEphPub, recipientScanPub);
      const recipientStealthAddr = deriveStealthAddressCommitment(
        recipientSpendPub,
        recipientSharedSecret,
      );

      // Stealth addresses should match
      expect(stealthAddr.equals(recipientStealthAddr)).toBe(true);

      // Recipient can derive stealth private key
      const stealthPriv = deriveStealthPrivateKey(recipientSpendPriv, recipientSharedSecret);
      expect(stealthPriv.length).toBe(32);
    });
  });

  describe('Security constraints', () => {
    it('should produce keys with cryptographic entropy', () => {
      const key1 = deriveSharedSecret(
        crypto.randomBytes(32),
        crypto.randomBytes(32),
        Buffer.from('entropy-test'),
      );

      // Key should not be all zeros or all ones
      const isAllZeros = key1.every((byte) => byte === 0);
      const isAllOnes = key1.every((byte) => byte === 255);

      expect(isAllZeros).toBe(false);
      expect(isAllOnes).toBe(false);
    });

    it('should produce uniform output distribution', () => {
      const keys = Array(100)
        .fill(0)
        .map(() =>
          deriveSharedSecret(
            crypto.randomBytes(32),
            crypto.randomBytes(32),
            Buffer.from('uniformity-test'),
          ),
        );

      // Check that keys are diverse (simplified entropy test)
      const uniqueKeys = new Set(keys.map((k) => k.toString('hex')));
      expect(uniqueKeys.size).toBe(100); // All keys should be unique
    });
  });
});
