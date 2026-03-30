import * as crypto from 'crypto';
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { deriveSharedSecret, generateSalt, hashValue } from './key-derivation.utils';

/**
 * Encrypted Metadata Service
 *
 * Handles encryption and decryption of sensitive recipient data for privacy-enhanced
 * payment flows. Uses ChaCha20-Poly1305 (authenticated encryption) with HKDF-derived
 * keys for non-custodial, server-side key management.
 *
 * All operations are deterministic and non-custodial – the server does not store
 * encryption keys, only the encrypted metadata and associated IVs/nonces.
 */

export interface EncryptedMetadataPayload {
  ciphertext: string; // Hex-encoded encrypted data
  nonce: string; // Hex-encoded nonce/IV
  tag: string; // Hex-encoded authentication tag
  salt?: string; // Hex-encoded salt (optional, for HKDF derivation)
}

export interface RecipientMetadata {
  recipientAddress: string;
  recipientName?: string;
  recipientLedgerAccount?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class EncryptedMetadataService {
  /**
   * Encrypt recipient metadata using ChaCha20-Poly1305
   *
   * @param metadata Recipient metadata to encrypt
   * @param encryptionKey 32-byte encryption key (derived from stealth context)
   * @param additionalData Optional additional authenticated data (AAD)
   * @returns Encrypted payload with nonce, ciphertext, and tag
   */
  encryptRecipientMetadata(
    metadata: RecipientMetadata,
    encryptionKey: Buffer,
    additionalData?: Buffer,
  ): EncryptedMetadataPayload {
    if (encryptionKey.length !== 32) {
      throw new BadRequestException('Encryption key must be 32 bytes');
    }

    const plaintext = JSON.stringify(metadata);
    const nonce = crypto.randomBytes(12); // ChaCha20-Poly1305 nonce is 12 bytes
    const aad = additionalData || Buffer.alloc(0);

    try {
      const cipher = crypto.createCipheriv('chacha20-poly1305', encryptionKey, nonce, {
        authTagLength: 16,
      });

      cipher.setAAD(aad);
      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        nonce: nonce.toString('hex'),
        tag: authTag.toString('hex'),
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to encrypt metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Decrypt recipient metadata using ChaCha20-Poly1305
   *
   * @param encrypted Encrypted payload
   * @param encryptionKey 32-byte encryption key (must match encryption key)
   * @param additionalData Optional additional authenticated data (must match encryption AAD)
   * @returns Decrypted recipient metadata
   * @throws BadRequestException if decryption or authentication fails
   */
  decryptRecipientMetadata(
    encrypted: EncryptedMetadataPayload,
    encryptionKey: Buffer,
    additionalData?: Buffer,
  ): RecipientMetadata {
    if (encryptionKey.length !== 32) {
      throw new BadRequestException('Encryption key must be 32 bytes');
    }

    const nonce = Buffer.from(encrypted.nonce, 'hex');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');
    const aad = additionalData || Buffer.alloc(0);

    if (nonce.length !== 12) {
      throw new BadRequestException('Nonce must be 12 bytes');
    }

    try {
      const decipher = crypto.createDecipheriv('chacha20-poly1305', encryptionKey, nonce, {
        authTagLength: 16,
      });

      decipher.setAuthTag(tag);
      decipher.setAAD(aad);

      let plaintext = decipher.update(ciphertext, undefined, 'utf8');
      plaintext += decipher.final('utf8');

      const metadata = JSON.parse(plaintext) as RecipientMetadata;
      return metadata;
    } catch (error) {
      throw new BadRequestException(
        `Failed to decrypt metadata or authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Encrypt arbitrary metadata with a shared secret (e.g., from stealth address derivation)
   *
   * @param data Data to encrypt (will be JSON stringified if object)
   * @param sharedSecret Shared secret for encryption key derivation
   * @param context Context/binding info for HKDF (default: 'quickex-metadata')
   * @returns Encrypted payload
   */
  encryptWithSharedSecret(
    data: unknown,
    sharedSecret: Buffer,
    context = 'quickex-metadata',
  ): EncryptedMetadataPayload {
    if (sharedSecret.length !== 32) {
      throw new BadRequestException('Shared secret must be 32 bytes');
    }

    const encryptionKey = deriveSharedSecret(
      sharedSecret,
      null,
      Buffer.from(context),
    );

    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const nonce = crypto.randomBytes(12);

    try {
      const cipher = crypto.createCipheriv('chacha20-poly1305', encryptionKey, nonce, {
        authTagLength: 16,
      });

      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        ciphertext,
        nonce: nonce.toString('hex'),
        tag: authTag.toString('hex'),
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to encrypt data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Decrypt arbitrary metadata with a shared secret
   *
   * @param encrypted Encrypted payload
   * @param sharedSecret Shared secret for decryption key derivation (must match encryption)
   * @param context Context/binding info for HKDF (must match encryption)
   * @returns Decrypted data
   */
  decryptWithSharedSecret<T = unknown>(
    encrypted: EncryptedMetadataPayload,
    sharedSecret: Buffer,
    context = 'quickex-metadata',
  ): T {
    if (sharedSecret.length !== 32) {
      throw new BadRequestException('Shared secret must be 32 bytes');
    }

    const encryptionKey = deriveSharedSecret(
      sharedSecret,
      null,
      Buffer.from(context),
    );

    const nonce = Buffer.from(encrypted.nonce, 'hex');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');

    if (nonce.length !== 12) {
      throw new BadRequestException('Nonce must be 12 bytes');
    }

    try {
      const decipher = crypto.createDecipheriv('chacha20-poly1305', encryptionKey, nonce, {
        authTagLength: 16,
      });

      decipher.setAuthTag(tag);

      let plaintext = decipher.update(ciphertext, undefined, 'utf8');
      plaintext += decipher.final('utf8');

      try {
        return JSON.parse(plaintext) as T;
      } catch {
        return plaintext as unknown as T;
      }
    } catch (error) {
      throw new BadRequestException(
        `Failed to decrypt data or authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Create a deterministic encryption key from a password/master key and context
   *
   * @param masterKey Master key or password
   * @param context Context for differentiation (e.g., stealth address)
   * @returns 32-byte encryption key
   */
  deriveKeyFromMaster(
    masterKey: Buffer,
    context: string,
  ): Buffer {
    const salt = hashValue(Buffer.from(context));
    return deriveSharedSecret(
      masterKey,
      salt.slice(0, 16),
      Buffer.from(context),
    );
  }

  /**
   * Verify metadata integrity (check AAD)
   *
   * @param encrypted Encrypted payload
   * @param encryptionKey Encryption key
   * @param additionalData AAD to verify
   * @returns true if authentication succeeds
   */
  verifyMetadataIntegrity(
    encrypted: EncryptedMetadataPayload,
    encryptionKey: Buffer,
    additionalData?: Buffer,
  ): boolean {
    try {
      this.decryptRecipientMetadata(encrypted, encryptionKey, additionalData);
      return true;
    } catch {
      return false;
    }
  }
}
