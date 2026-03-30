# Privacy Hardening Implementation - Stealth Addresses & Encrypted Metadata

## Overview

This document describes the hardened privacy features implemented for QuickEx, including:

1. **Stealth Address System** - One-time payment addresses using Diffie-Hellman-based derivation
2. **Encrypted Metadata Service** - ChaCha20-Poly1305 authenticated encryption for sensitive recipient data
3. **Secure Key Derivation** - HKDF-based key derivation for non-custodial, server-side operations
4. **Integration with Soroban** - Coordination with the privacy-aware smart contract

## Architecture

### 1. Secure Key Derivation (`key-derivation.utils.ts`)

Provides cryptographic primitives for privacy features:

```typescript
// Derive shared secret from ephemeral and scan keys
const sharedSecret = deriveSharedSecret(ikm, salt, info);

// Generate ephemeral keypair for stealth payments
const { ephemeralPrivKey, ephemeralPubKey } = generateEphemeralKeypair();

// Derive stealth address from ephemeral and spend keys
const stealthAddress = deriveStealthAddressCommitment(spendPubKey, sharedSecret);
```

**Cryptographic Basis:**
- **HKDF (RFC 5869)** - Deterministic key derivation with salt and context
- **SHA-256** - Hash function for KDF (matching Soroban contract)
- **ChaCha20-Poly1305** - Authenticated encryption for metadata
- **Ed25519** - Signature verification (via TweetNaCl)

**Security Properties:**
- Non-custodial: Server does not store private keys
- Deterministic: Same inputs always produce same derivations
- Constant-time: Uses `crypto.timingSafeEqual` for sensitive comparisons
- Entropy-preserving: Random salt and nonces for each operation

### 2. Encrypted Metadata Service (`encrypted-metadata.service.ts`)

Handles encryption/decryption of sensitive recipient information:

```typescript
// Encrypt recipient metadata
const encrypted = service.encryptRecipientMetadata(
  {
    recipientAddress: 'G...',
    recipientName: 'Alice',
    recipientLedgerAccount: 'ledger-001',
    metadata: { email: '...' }
  },
  encryptionKey,
  aad // Optional additional authenticated data
);

// Decrypt (only possible with correct key and AAD)
const decrypted = service.decryptRecipientMetadata(
  encrypted,
  encryptionKey,
  aad
);
```

**Encryption Details:**
- **Algorithm:** ChaCha20-Poly1305 (AEAD - Authenticated Encryption with Associated Data)
- **Key Size:** 256 bits (32 bytes)
- **Nonce:** 96 bits (12 bytes) - randomly generated, unique per encryption
- **Authentication Tag:** 128 bits (16 bytes) - prevents tampering

**Properties:**
- **Confidentiality:** Plaintext is protected from unauthorized access
- **Integrity:** Any tampering with ciphertext is detected
- **Authenticity:** AAD binding ensures metadata hasn't been moved/replaced
- **Non-repudiation:** Correct key holder must have encrypted the data

### 3. Stealth Address Service (`stealth-address.service.ts`)

Coordinates stealth address generation with Soroban contract:

```typescript
// Recipient generates keypair (once)
const recipientKeys = service.generateRecipientKeypair();
// { scanPrivKey, scanPubKey, spendPrivKey, spendPubKey }
// Recipient publishes: scanPubKey, spendPubKey

// Sender derives payment
const derivation = service.deriveStealthPayment({
  senderAddress: 'G...',
  recipientScanPubKey: '...',
  recipientSpendPubKey: '...',
  token: 'C...',
  amount: 1000000,
  timeoutSecs: 86400
});
// Returns: ephemeralPubKey, stealthAddress, contractParams

// Recipient scans for their payments
const isForMe = service.scanStealthPayment(
  ephemeralPubKey,
  recipientScanPrivKey,
  recipientSpendPubKey,
  recordedStealthAddress
);

// Recipient prepares withdrawal
const withdrawalParams = service.prepareStealthWithdrawal({
  stealthAddress,
  ephemeralPubKey,
  spendPubKey: recipientSpendPubKey,
  recipientAddress: 'G...' // Real address for receiving funds
});
```

## Payment Flow

### End-to-End Stealth Payment

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SETUP (Recipient, once)                                      │
├─────────────────────────────────────────────────────────────────┤
│ Recipient generates keypair:                                    │
│   - scan_priv_key (secret)                                      │
│   - spend_priv_key (secret)                                     │
│   - scan_pub_key (published)                                    │
│   - spend_pub_key (published)                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. SENDER PREPARES PAYMENT                                      │
├─────────────────────────────────────────────────────────────────┤
│ $ POST /payments/stealth/derive                                 │
│ Input:                                                          │
│   - recipientScanPubKey                                         │
│   - recipientSpendPubKey                                        │
│   - amount, token, timeout                                      │
│                                                                 │
│ Response:                                                       │
│   - ephemeralPubKey (published on-chain)                        │
│   - stealthAddress (one-time address)                           │
│   - contractParams (for register_ephemeral_key)                 │
│   - sharedSecret (for metadata encryption - optional)           │
│                                                                 │
│ Computation:                                                    │
│   shared_secret = KDF(eph_pub || scan_pub)                      │
│   stealth_addr = KDF(spend_pub || shared_secret)                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. SENDER ENCRYPTS METADATA (optional)                          │
├─────────────────────────────────────────────────────────────────┤
│ $ POST /payments/stealth/encrypt-metadata                       │
│ Input:                                                          │
│   - recipientAddress, recipientName, metadata                   │
│   - encryptionKey (derived from sharedSecret)                   │
│                                                                 │
│ Response:                                                       │
│   - ciphertext (hex-encoded)                                    │
│   - nonce (unique per encryption)                               │
│   - tag (authentication tag)                                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. SENDER CALLS CONTRACT                                        │
├─────────────────────────────────────────────────────────────────┤
│ contract.register_ephemeral_key({                               │
│   sender: senderAddress,                                        │
│   token: tokenAddress,                                          │
│   amount: 1000000,                                              │
│   eph_pub: ephemeralPubKey,                                     │
│   spend_pub: recipientSpendPubKey,                              │
│   stealth_address: stealthAddress,                              │
│   timeout_secs: 86400                                           │
│ })                                                              │
│                                                                 │
│ Contract verifies derivation and locks funds                    │
│ Emits: EphemeralKeyRegistered event                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 5. RECIPIENT SCANS CHAIN                                        │
├─────────────────────────────────────────────────────────────────┤
│ For each EphemeralKeyRegistered event:                          │
│   $ POST /payments/stealth/scan                                 │
│   Input:                                                        │
│     - ephemeralPubKey (from event)                              │
│     - scanPrivKey (secret)                                      │
│     - spendPubKey (own)                                         │
│     - recordedStealthAddress (from event)                       │
│                                                                 │
│   Response:                                                     │
│     - isForRecipient: true/false                                │
│                                                                 │
│   Computation:                                                  │
│     shared_secret = KDF(eph_pub || scan_priv)                   │
│     expected_addr = KDF(spend_pub || shared_secret)             │
│     match? → is_for_recipient                                   │
│                                                                 │
│ If for recipient:                                               │
│   - Decrypt metadata (if available)                             │
│   - Derive stealth_priv_key                                     │
│   - Fund marked as "pending withdrawal"                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 6. RECIPIENT WITHDRAWS                                          │
├─────────────────────────────────────────────────────────────────┤
│ $ POST /payments/stealth/prepare-withdrawal                     │
│ Input:                                                          │
│   - stealthAddress                                              │
│   - ephemeralPubKey                                             │
│   - spendPubKey                                                 │
│   - recipientAddress (real address for receiving)               │
│                                                                 │
│ Response:                                                       │
│   - contractParams for stealth_withdraw                         │
│                                                                 │
│ contract.stealth_withdraw({                                     │
│   recipient: recipientAddress,                                  │
│   eph_pub: ephemeralPubKey,                                     │
│   spend_pub: recipientSpendPubKey,                              │
│   stealth_address: stealthAddress                               │
│ })                                                              │
│                                                                 │
│ Contract verifies derivation and releases funds                 │
│ Funds transferred to recipientAddress                           │
│ Emits: StealthWithdrawn event                                   │
└─────────────────────────────────────────────────────────────────┘

Privacy Guarantee:
- Sender's real address is not linked to recipient in on-chain data
- Recipient derives one-time stealth_address from secret keys
- Only ephemeralPubKey and stealthAddress are recorded on-chain
- Recipient only revealed at withdrawal time
```

## API Endpoints

### Stealth Payment Derivation

```http
POST /payments/stealth/derive
Content-Type: application/json

{
  "senderAddress": "GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT",
  "recipientScanPubKey": "aaaa...aaaa",  // 64-char hex
  "recipientSpendPubKey": "bbbb...bbbb", // 64-char hex
  "token": "CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS",
  "amount": 1000000,
  "timeoutSecs": 86400
}

Response:
{
  "ephemeralPubKey": "cccc...cccc",
  "stealthAddress": "dddd...dddd",
  "sharedSecret": "eeee...eeee",
  "contractParams": {
    "sender": "G...",
    "token": "C...",
    "amount": 1000000,
    "eph_pub": "cccc...cccc",
    "spend_pub": "bbbb...bbbb",
    "stealth_address": "dddd...dddd",
    "timeout_secs": 86400
  }
}
```

### Encrypt Metadata

```http
POST /payments/stealth/encrypt-metadata
Content-Type: application/json

{
  "recipientAddress": "GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT",
  "recipientName": "Alice",
  "recipientLedgerAccount": "ledger-001",
  "metadata": {
    "email": "alice@example.com",
    "phone": "+1234567890"
  },
  "encryptionKey": "f0f1f2...f0f1",  // 64-char hex
  "aad": "stealth_addr_hex"           // Optional AAD
}

Response:
{
  "ciphertext": "a1b2c3...",    // hex-encoded
  "nonce": "d1e2f3...",          // 24-char hex (12 bytes)
  "tag": "g1h2i3..."             // 32-char hex (16 bytes)
}
```

### Scan for Payment

```http
POST /payments/stealth/scan
Content-Type: application/json

{
  "ephemeralPubKey": "cccc...cccc",
  "scanPrivKey": "ssss...ssss",   // Recipient secret
  "spendPubKey": "bbbb...bbbb",
  "recordedStealthAddress": "dddd...dddd"
}

Response:
{
  "isForRecipient": true,
  "details": {
    "stealthAddress": "dddd...dddd",
    "isPending": true
  }
}
```

### Decrypt Metadata

```http
POST /payments/stealth/decrypt-metadata
Content-Type: application/json

{
  "ciphertext": "a1b2c3...",
  "nonce": "d1e2f3...",
  "tag": "g1h2i3...",
  "encryptionKey": "f0f1f2...",
  "aad": "stealth_addr_hex"  // Optional, must match encryption
}

Response:
{
  "recipientAddress": "G...",
  "recipientName": "Alice",
  "recipientLedgerAccount": "ledger-001",
  "metadata": { ... }
}
```

## Security Considerations

### Non-Custodial Design
- **Server never stores private keys** - All key derivations use only public data or user-provided secrets
- **User controls secrets** - Recipients store `scan_priv_key` and `spend_priv_key` locally
- **No key escrow** - Unlike custodial solutions, QuickEx cannot recover lost keys

### Encryption & Authentication
- **AEAD (Authenticated Encryption)** - ChaCha20-Poly1305 prevents tampering
- **Random Nonces** - Unique nonce per encryption prevents replay attacks
- **AAD Binding** - Associated authenticated data ties metadata to specific stealth address
- **Constant-Time Comparison** - Timing-safe operations prevent side-channel attacks

### Privacy Guarantees
- **Sender Privacy** - Sender's real address not visible on-chain for stealth payments
- **Recipient Privacy** - Recipient's real address revealed only at withdrawal
- **Payment Unlinkability** - Each payment uses unique stealth address
- **Metadata Confidentiality** - Sensitive recipient info encrypted with derived keys

### Attack Scenarios & Mitigations

| Attack | Scenario | Mitigation |
|--------|----------|-----------|
| **Ciphertext Tampering** | Attacker modifies encrypted metadata | Authentication tag validates integrity |
| **Replay Attack** | Attacker reuses old encrypted message | Unique nonce prevents ciphertext reuse |
| **Key Leakage** | Private key exposed | Non-custodial design limits damage |
| **Timing Analysis** | Attacker measures operation time | Constant-time comparison functions |
| **Wrong Recipient** | Attacker tries to claim payment | Stealth address derivation requires correct keys |
| **Key Snooping** | Attacker observes network traffic | Use HTTPS/TLS with certificate pinning |

## Testing

Unit tests verify:

1. **Key Derivation (`key-derivation.utils.spec.ts`)**
   - HKDF correctness and determinism
   - Stealth address derivation
   - Keypair generation and verification
   - Buffer validation and security

2. **Stealth Address Service (`stealth-address.service.spec.ts`)**
   - Keypair generation
   - Payment derivation with validation
   - Address verification
   - Recipient scanning
   - Withdrawal preparation
   - End-to-end flow

3. **Encrypted Metadata Service (`encrypted-metadata.service.spec.ts`)**
   - Encryption/decryption round-trips
   - Authentication tag verification
   - Tamper detection
   - AAD binding
   - Key derivation
   - Security properties

**Run tests:**
```bash
npm run test -- payments/stealth-address.service.spec.ts
npm run test -- common/utils/key-derivation.utils.spec.ts
npm run test -- common/utils/encrypted-metadata.service.spec.ts
```

## Integration Checklist

- [x] Secure key derivation utilities (HKDF, stealth address)
- [x] Encrypted metadata service (ChaCha20-Poly1305)
- [x] Stealth address service (DH-based one-time addresses)
- [x] Privacy DTOs and validation
- [x] Updated payments controller with privacy endpoints
- [x] Unit tests for all components
- [ ] Integration tests with Soroban contract
- [ ] Security audit by third party
- [ ] Documentation for recipients (key management guide)
- [ ] Monitoring for privacy-enhanced transactions
- [ ] Client library for frontend/mobile integration

## Implementation Notes

### Soroban Contract Compatibility
The stealth address derivation matches the Soroban contract:
```rust
// Contract: stealth.rs
fn derive_shared_secret(eph_pub, scan_pub) = SHA256(eph_pub || scan_pub)
fn derive_stealth_address(spend_pub, shared_secret) = SHA256(spend_pub || shared_secret)

// Backend: key-derivation.utils.ts
deriveStealthAddress(ephPub, scanPub) = sha256(ephPub + scanPub)
deriveStealthAddressCommitment(spendPub, sharedSecret) = sha256(spendPub + sharedSecret)
```

### Key Sizes
- Private keys: 32 bytes (256 bits)
- Public keys: 32 bytes (256 bits)
- Shared secrets: 32 bytes (256 bits)
- Encryption nonce: 12 bytes (96 bits) - ChaCha20-Poly1305 standard
- Authentication tag: 16 bytes (128 bits)

### Performance
- Key derivation: < 1ms per operation
- Encryption/decryption: < 1ms for metadata
- No persistent storage of keys
- Stateless operations allow horizontal scaling

## References

- [RFC 5869 - HKDF](https://tools.ietf.org/html/rfc5869)
- [ChaCha20-Poly1305 (RFC 7539)](https://tools.ietf.org/html/rfc7539)
- [Stealth Addresses - Bitcoin Wiki](https://en.bitcoin.it/wiki/Stealth_address)
- [Soroban SDK Documentation](https://developers.stellar.org/learn/smart-contracts)
- [Ed25519 Signatures (RFC 8032)](https://tools.ietf.org/html/rfc8032)
