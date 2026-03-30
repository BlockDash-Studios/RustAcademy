import * as crypto from 'crypto';
import * as nacl from 'tweetnacl';

/**
 * Secure Key Derivation Utilities
 *
 * Provides non-custodial, server-side key derivation helpers for privacy-enhanced
 * payment flows. All operations are deterministic and do not store private keys.
 *
 * Based on:
 * - HKDF (HMAC-based Key Derivation Function) per RFC 5869
 * - ChaCha20-Poly1305 for authenticated encryption
 * - Ed25519 for signature verification
 */

/**
 * Configuration for key derivation
 */
export interface KeyDerivationConfig {
  hashAlgorithm: string; // 'sha256' | 'sha512'
  saltLength: number; // bytes
  keyLength: number; // bytes
}

/**
 * Default configuration for HKDF
 */
export const DEFAULT_KDF_CONFIG: KeyDerivationConfig = {
  hashAlgorithm: 'sha256',
  saltLength: 32,
  keyLength: 32,
};

/**
 * Derive a shared secret using HKDF per RFC 5869
 *
 * @param ikm Input key material (e.g., ECDH shared secret or password)
 * @param salt Optional salt (defaults to zeros if not provided)
 * @param info Context/application-specific binding info
 * @param config Configuration for the derivation
 * @returns 32-byte derived key
 *
 * @example
 * const sharedSecret = deriveSharedSecret(
 *   Buffer.from(ecdhResult),
 *   Buffer.from('salt123'),
 *   Buffer.from('quickex-stealth-payment'),
 * );
 */
export function deriveSharedSecret(
  ikm: Buffer,
  salt: Buffer | null,
  info: Buffer,
  config: KeyDerivationConfig = DEFAULT_KDF_CONFIG,
): Buffer {
  const { hashAlgorithm, keyLength } = config;

  // Step 1: Extract (HMAC with salt)
  const actualSalt = salt && salt.length > 0 ? salt : Buffer.alloc(32, 0);
  const prk = crypto.createHmac(hashAlgorithm, actualSalt).update(ikm).digest();

  // Step 2: Expand (HMAC iterations)
  const hash = crypto.createHash(hashAlgorithm);
  const hashLen = hash.digest().length;
  const n = Math.ceil(keyLength / hashLen);

  let okm = Buffer.alloc(0);
  let t = Buffer.alloc(0);

  for (let i = 1; i <= n; i++) {
    t = crypto.createHmac(hashAlgorithm, prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
    okm = Buffer.concat([okm, t]);
  }

  return okm.slice(0, keyLength);
}

/**
 * Derive a stealth address using ephemeral public key and recipient scan key
 *
 * This is the server-side equivalent of the Soroban stealth address derivation.
 * Uses SHA-256 as the KDF (matching the contract implementation).
 *
 * @param ephemeralPubKey Ephemeral public key (32 bytes)
 * @param scanPubKey Recipient's scan public key (32 bytes)
 * @returns 32-byte stealth address
 *
 * @example
 * const stealthAddr = deriveStealthAddress(
 *   Buffer.from(ephPubKeyHex, 'hex'),
 *   Buffer.from(scanKeyHex, 'hex'),
 * );
 */
export function deriveStealthAddress(
  ephemeralPubKey: Buffer,
  scanPubKey: Buffer,
): Buffer {
  if (ephemeralPubKey.length !== 32) {
    throw new Error('Ephemeral public key must be 32 bytes');
  }
  if (scanPubKey.length !== 32) {
    throw new Error('Scan public key must be 32 bytes');
  }

  const payload = Buffer.concat([ephemeralPubKey, scanPubKey]);
  return crypto.createHash('sha256').update(payload).digest();
}

/**
 * Derive the final stealth address commitment
 *
 * @param spendPubKey Recipient's spend public key (32 bytes)
 * @param sharedSecret Shared secret derived from ephemeral + scan keys (32 bytes)
 * @returns 32-byte stealth address
 */
export function deriveStealthAddressCommitment(
  spendPubKey: Buffer,
  sharedSecret: Buffer,
): Buffer {
  if (spendPubKey.length !== 32) {
    throw new Error('Spend public key must be 32 bytes');
  }
  if (sharedSecret.length !== 32) {
    throw new Error('Shared secret must be 32 bytes');
  }

  const payload = Buffer.concat([spendPubKey, sharedSecret]);
  return crypto.createHash('sha256').update(payload).digest();
}

/**
 * Derive a recipient-specific stealth private key (off-chain, non-custodial)
 *
 * Used by the recipient to prove ownership of a stealth address.
 * The recipient provides their spend_priv_key, and this computes:
 * stealth_priv = HKDF(spend_priv_key || shared_secret)
 *
 * @param spendPrivKey Recipient's spend private key (32 bytes)
 * @param sharedSecret Shared secret derived from ephemeral + scan keys (32 bytes)
 * @returns 32-byte stealth private key
 */
export function deriveStealthPrivateKey(
  spendPrivKey: Buffer,
  sharedSecret: Buffer,
): Buffer {
  if (spendPrivKey.length !== 32) {
    throw new Error('Spend private key must be 32 bytes');
  }
  if (sharedSecret.length !== 32) {
    throw new Error('Shared secret must be 32 bytes');
  }

  const ikm = Buffer.concat([spendPrivKey, sharedSecret]);
  return deriveSharedSecret(
    ikm,
    null,
    Buffer.from('quickex-stealth-priv-key'),
    DEFAULT_KDF_CONFIG,
  );
}

/**
 * Verify a stealth address derivation (for audit/debug purposes)
 *
 * Re-derives the stealth address given the components and validates
 * it matches the expected value.
 *
 * @param ephemeralPubKey Ephemeral public key
 * @param spendPubKey Recipient's spend public key
 * @param expectedStealthAddr Expected stealth address
 * @returns true if derivation is valid
 */
export function verifyStealthAddressDerivation(
  ephemeralPubKey: Buffer,
  spendPubKey: Buffer,
  expectedStealthAddr: Buffer,
): boolean {
  const sharedSecret = deriveStealthAddress(ephemeralPubKey, spendPubKey);
  const derived = deriveStealthAddressCommitment(spendPubKey, sharedSecret);
  return derived.equals(expectedStealthAddr);
}

/**
 * Generate an ephemeral keypair for stealth payments
 *
 * @returns Object with ephemeralPrivKey and ephemeralPubKey (both 32 bytes)
 */
export function generateEphemeralKeypair(): {
  ephemeralPrivKey: Buffer;
  ephemeralPubKey: Buffer;
} {
  const ephemeralPrivKey = crypto.randomBytes(32);
  // For practical implementation, using Ed25519 (TweetNaCl)
  const ephemeralKeyPair = nacl.sign.keyPair.fromSecretKey(ephemeralPrivKey);
  const ephemeralPubKey = Buffer.from(ephemeralKeyPair.publicKey);

  return {
    ephemeralPrivKey,
    ephemeralPubKey,
  };
}

/**
 * Hash a value for commitment/proof purposes
 *
 * @param data Buffer to hash
 * @param algorithm Hash algorithm (default: sha256)
 * @returns Hash digest
 */
export function hashValue(data: Buffer, algorithm = 'sha256'): Buffer {
  return crypto.createHash(algorithm).update(data).digest();
}

/**
 * Generate a random salt for cryptographic operations
 *
 * @param length Length of salt in bytes (default: 32)
 * @returns Random buffer
 */
export function generateSalt(length = 32): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Constant-time buffer comparison
 *
 * @param a First buffer
 * @param b Second buffer
 * @returns true if buffers are equal
 */
export function secureCompare(a: Buffer, b: Buffer): boolean {
  return crypto.timingSafeEqual(a, b);
}
