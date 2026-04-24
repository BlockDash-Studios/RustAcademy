import * as crypto from 'crypto';

/**
 * Secure key-derivation helpers for X-Ray Privacy v2 (Stealth Addresses).
 * Non-custodial implementation: server only assists in derivation, never stores private keys.
 */
export class CryptoUtils {
  /**
   * Derive a 32-byte shared secret from an ephemeral public key and a scan public key.
   * KDF(eph_pub || scan_pub) = SHA-256(eph_pub || scan_pub)
   * 
   * @param ephPub Ephemeral public key (32 bytes hex)
   * @param scanPub Recipient's scan public key (32 bytes hex)
   * @returns Shared secret (32 bytes hex)
   */
  static deriveSharedSecret(ephPub: string, scanPub: string): string {
    const payload = Buffer.concat([
      Buffer.from(ephPub, 'hex'),
      Buffer.from(scanPub, 'hex'),
    ]);
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Derive a one-time stealth address from a spend public key and a shared secret.
   * stealth = SHA-256(spend_pub || shared_secret)
   * 
   * @param spendPub Recipient's spend public key (32 bytes hex)
   * @param sharedSecret Derived shared secret (32 bytes hex)
   * @returns Stealth address (32 bytes hex)
   */
  static deriveStealthAddress(spendPub: string, sharedSecret: string): string {
    const payload = Buffer.concat([
      Buffer.from(spendPub, 'hex'),
      Buffer.from(sharedSecret, 'hex'),
    ]);
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Encrypt recipient data (e.g., Stellar address) using a shared secret.
   * Uses AES-256-GCM for authenticated encryption.
   * 
   * @param data Data to encrypt (e.g., "G...")
   * @param sharedSecret 32-byte shared secret hex
   * @returns Encrypted data in format: iv:authTag:ciphertext (hex)
   */
  static encryptRecipientData(data: string, sharedSecret: string): string {
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(sharedSecret, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt recipient data using a shared secret.
   * 
   * @param encryptedData Encrypted data in format: iv:authTag:ciphertext (hex)
   * @param sharedSecret 32-byte shared secret hex
   * @returns Decrypted data string
   */
  static decryptRecipientData(encryptedData: string, sharedSecret: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encryptedData.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(sharedSecret, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate a random ephemeral keypair for stealth address generation.
   * (Simulation: returns random 32-byte buffers as hex)
   */
  static generateEphemeralKeypair(): { privateKey: string; publicKey: string } {
    const privateKey = crypto.randomBytes(32).toString('hex');
    const publicKey = crypto.randomBytes(32).toString('hex'); // In real ECDH, this would be priv * G
    return { privateKey, publicKey };
  }
}
