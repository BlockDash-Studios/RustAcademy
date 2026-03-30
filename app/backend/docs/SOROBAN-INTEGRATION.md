# Soroban Integration Guide - Backend Coordination

## Quick Reference

### Contract Functions

The backend must coordinate with these Soroban contract functions:

```rust
// Register ephemeral key and lock funds for stealth recipient
pub fn register_ephemeral_key(
    env: Env,
    params: StealthDepositParams,
) -> Result<BytesN<32>, QuickexError>

// Withdraw funds locked under stealth address
pub fn stealth_withdraw(
    env: &Env,
    recipient: Address,
    eph_pub: BytesN<32>,
    spend_pub: BytesN<32>,
    stealth_address: BytesN<32>,
) -> Result<bool, QuickexError>

// Get current privacy status for an account
pub fn get_privacy(env: Env, owner: Address) -> bool

// Enable/disable privacy for an account
pub fn set_privacy(env: Env, owner: Address, enabled: bool) -> Result<(), QuickexError>
```

## Backend API to Contract Flow

### 1. Sender Initiates Stealth Payment

**Backend Step 1:** Derive stealth payment
```bash
$ curl -X POST http://backend:3000/payments/stealth/derive \
  -H 'Content-Type: application/json' \
  -d '{
    "senderAddress": "GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT",
    "recipientScanPubKey": "a1a2a3...a1a2a3",
    "recipientSpendPubKey": "b1b2b3...b1b2b3",
    "token": "CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS",
    "amount": 1000000,
    "timeoutSecs": 86400
  }'

HTTP/1.1 200 OK
{
  "ephemeralPubKey": "c1c2c3...c1c2c3",
  "stealthAddress": "d1d2d3...d1d2d3",
  "sharedSecret": "e1e2e3...e1e2e3",
  "contractParams": {
    "sender": "GBUQWP3...",
    "token": "CCZST5X3...",
    "amount": 1000000,
    "eph_pub": "c1c2c3...c1c2c3",
    "spend_pub": "b1b2b3...b1b2b3",
    "stealth_address": "d1d2d3...d1d2d3",
    "timeout_secs": 86400
  }
}
```

**Backend Step 2:** Optional - Encrypt recipient metadata
```bash
$ curl -X POST http://backend:3000/payments/stealth/encrypt-metadata \
  -H 'Content-Type: application/json' \
  -d '{
    "recipientAddress": "GBUQWP3...",
    "recipientName": "Alice",
    "metadata": { "memo": "Payment for services" },
    "encryptionKey": "e1e2e3...e1e2e3"
  }'

HTTP/1.1 200 OK
{
  "ciphertext": "f1f2f3...",
  "nonce": "g1g2g3...g1g2g3",
  "tag": "h1h2h3...h1h2h3"
}
```

**Contract Call:** Register ephemeral key
```javascript
// Sender client code
const contract = new Contract(contractAddress);

const result = await contract.register_ephemeral_key({
  sender: contractParams.sender,
  token: contractParams.token,
  amount: contractParams.amount,
  eph_pub: contractParams.eph_pub,
  spend_pub: contractParams.spend_pub,
  stealth_address: contractParams.stealth_address,
  timeout_secs: contractParams.timeout_secs
});

// Contract emits: EphemeralKeyRegistered {
//   stealth_address: "d1d2d3...d1d2d3",
//   eph_pub: "c1c2c3...c1c2c3",
//   token: "CCZST5X3...",
//   amount: 1000000,
//   expires_at: <timestamp>
// }
```

### 2. Recipient Scans for Payments

**Backend Step 3:** Scan for stealth payment (recipient-side)
```bash
# Recipient listens for contract events
# For each EphemeralKeyRegistered event:

$ curl -X POST http://backend:3000/payments/stealth/scan \
  -H 'Content-Type: application/json' \
  -d '{
    "ephemeralPubKey": "c1c2c3...c1c2c3",
    "scanPrivKey": "s1s2s3...s1s2s3",
    "spendPubKey": "b1b2b3...b1b2b3",
    "recordedStealthAddress": "d1d2d3...d1d2d3"
  }'

HTTP/1.1 200 OK
{
  "isForRecipient": true,
  "details": {
    "stealthAddress": "d1d2d3...d1d2d3",
    "isPending": true
  }
}
```

**Backend Step 4:** Optional - Decrypt metadata (if sender encrypted)
```bash
$ curl -X POST http://backend:3000/payments/stealth/decrypt-metadata \
  -H 'Content-Type: application/json' \
  -d '{
    "ciphertext": "f1f2f3...",
    "nonce": "g1g2g3...g1g2g3",
    "tag": "h1h2h3...h1h2h3",
    "encryptionKey": "e1e2e3...e1e2e3"
  }'

HTTP/1.1 200 OK
{
  "recipientAddress": "GBUQWP3...",
  "recipientName": "Alice",
  "metadata": { "memo": "Payment for services" }
}
```

### 3. Recipient Withdraws Funds

**Backend Step 5:** Prepare withdrawal
```bash
$ curl -X POST http://backend:3000/payments/stealth/prepare-withdrawal \
  -H 'Content-Type: application/json' \
  -d '{
    "stealthAddress": "d1d2d3...d1d2d3",
    "ephemeralPubKey": "c1c2c3...c1c2c3",
    "spendPubKey": "b1b2b3...b1b2b3",
    "recipientAddress": "GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT"
  }'

HTTP/1.1 200 OK
{
  "contractParams": {
    "recipient": "GBUQWP3...",
    "eph_pub": "c1c2c3...c1c2c3",
    "spend_pub": "b1b2b3...b1b2b3",
    "stealth_address": "d1d2d3...d1d2d3"
  }
}
```

**Contract Call:** Withdraw funds
```javascript
// Recipient client code
const contract = new Contract(contractAddress);

const result = await contract.stealth_withdraw(
  contractParams.recipient,
  contractParams.eph_pub,
  contractParams.spend_pub,
  contractParams.stealth_address
);

// Contract verifies:
// 1. Derivation matches recorded stealth address
// 2. Funds not already withdrawn
// 3. Timeout not expired
// 4. Transfers funds to recipient address
//
// Emits: StealthWithdrawn {
//   stealth_address: "d1d2d3...d1d2d3",
//   recipient: "GBUQWP3...",
//   token: "CCZST5X3...",
//   amount: 1000000
// }
```

## Data Type Conversions

### Hex String ← → Buffer Conversions

```typescript
// Backend uses hex strings for API (64 chars = 32 bytes)
const hexKey = "a1a2a3a4b1b2b3b4c1c2c3c4d1d2d3d4e1e2e3e4f1f2f3f404050607080910";

// Convert to Buffer for cryptographic operations
const bufferKey = Buffer.from(hexKey, 'hex');

// Convert back to hex for API response
const hexKey2 = bufferKey.toString('hex');
```

### Contract Type Mapping

| Contract Type | Rust | Backend Type | Notes |
|---------------|------|------|-------|
| `Address` | Soroban Address | `string` | Stellar address (G... or C...) |
| `BytesN<32>` | 32-byte fixed array | `string` (hex) | 64-character hex string |
| `i128` | 128-bit integer | `number` or `BigInt` | Token amounts in stroops |
| `u64` | 64-bit unsigned | `number` | Timestamp, timeout in seconds |
| `bool` | Boolean | `boolean` | True/false |

## Error Handling

### Backend Errors → Contract Errors

```typescript
// Backend validation failures
BadRequestException(400)
  → Sender passes to frontend validation
  → Prevent invalid contract call

// Successful backend response
→ Contract call proceeds
→ Contract performs additional validation

// Contract Errors (QuickexError enum)
InvalidAmount
  → Amount ≤ 0
  
StealthAddressMismatch
  → Derived address doesn't match expected
  
StealthAddressAlreadyUsed
  → Stealth address already has pending escrow
  
StealthEscrowNotFound
  → No escrow for given stealth address
  
AlreadySpent
  → Escrow already withdrawn/refunded
  
EscrowExpired
  → Timeout passed
  
OperationPaused
  → Contract temporarily paused
```

## Verification Endpoints

### Audit/Testing: Verify Stealth Address Derivation

```bash
$ curl -X POST http://backend:3000/payments/stealth/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "ephemeralPubKey": "c1c2c3...c1c2c3",
    "scanPubKey": "a1a2a3...a1a2a3",
    "spendPubKey": "b1b2b3...b1b2b3",
    "stealthAddress": "d1d2d3...d1d2d3"
  }'

HTTP/1.1 200 OK
{
  "isValid": true,
  "details": "Stealth address derivation is valid"
}
```

This can be used:
- To verify on-chain recorded addresses match expected derivation
- For audit trails
- For debugging derivation chains

## Soroban Contract Events

The backend should listen for and process contract events:

### EphemeralKeyRegistered

```
Event: EphemeralKeyRegistered {
  stealth_address: BytesN<32>,
  eph_pub: BytesN<32>,
  token: Address,
  amount: i128,
  expires_at: u64
}

Mapping:
stealth_address → hex string (64 chars)
eph_pub → hex string (64 chars)
token → Stellar asset address
amount → Payment amount in stroops
expires_at → Unix timestamp (0 = no expiry)

Backend Action:
1. Index event with stealth_address as key
2. Notify recipient (if monitoring)
3. Store metadata if provided by sender
```

### StealthWithdrawn

```
Event: StealthWithdrawn {
  stealth_address: BytesN<32>,
  recipient: Address,
  token: Address,
  amount: i128
}

Mapping:
stealth_address → hex string (64 chars)
recipient → Stellar address
token → Stellar asset address
amount → Withdrawn amount in stroops

Backend Action:
1. Mark stealth_address as spent
2. Log transaction
3. Update recipient's pending balance
4. Emit notification to recipient
```

## Testing Contract Integration

### Test Setup

```typescript
// 1. Deploy contract to testnet
const contractId = "CCZST5X3..."; // Deployed Soroban contract

// 2. Initialize Soroban client
const server = new SorobanServer("https://soroban-testnet.stellar.org");
const contract = new Contract(contractId);

// 3. Fund test accounts
const sender = await generateViaSorobanFaucet();
const recipient = await generateViaSorobanFaucet();

// 4. Get recipient's stealth keys
const recipientKeys = {
  scanPubKey: "a1a2a3...",
  spendPubKey: "b1b2b3..."
};
```

### Integration Test Flow

```typescript
test('Full stealth payment flow', async () => {
  // 1. Sender derives payment
  const derivation = await fetch('/payments/stealth/derive', {
    senderAddress: sender.publicKey,
    recipientScanPubKey: recipientKeys.scanPubKey,
    recipientSpendPubKey: recipientKeys.spendPubKey,
    token: tokenAddress,
    amount: 1000000,
    timeoutSecs: 86400
  }).then(r => r.json());

  // 2. Sender calls contract
  const tx = await contract.register_ephemeral_key(
    derivation.contractParams
  );
  await tx.confirm();

  // 3. Recipient scans for payment
  const events = await contract.getEvents('EphemeralKeyRegistered');
  const lastEvent = events[events.length - 1];

  const isForMe = await fetch('/payments/stealth/scan', {
    ephemeralPubKey: lastEvent.eph_pub,
    scanPrivKey: recipientKeys.scanPrivKey,
    spendPubKey: recipientKeys.spendPubKey,
    recordedStealthAddress: lastEvent.stealth_address
  }).then(r => r.json());

  expect(isForMe.isForRecipient).toBe(true);

  // 4. Recipient withdraws
  const withdrawal = await fetch('/payments/stealth/prepare-withdrawal', {
    stealthAddress: lastEvent.stealth_address,
    ephemeralPubKey: lastEvent.eph_pub,
    spendPubKey: recipientKeys.spendPubKey,
    recipientAddress: recipient.publicKey
  }).then(r => r.json());

  const withdrawTx = await contract.stealth_withdraw(
    withdrawal.contractParams
  );
  await withdrawTx.confirm();

  // 5. Verify withdrawal
  const events2 = await contract.getEvents('StealthWithdrawn');
  const lastWithdrawal = events2[events2.length - 1];

  expect(lastWithdrawal.recipient).toBe(recipient.publicKey);
  expect(lastWithdrawal.amount).toBe(1000000);
});
```

## Migration Path

### Phase 1: Backend Implementation (Current)
- [x] Key derivation utilities
- [x] Encrypted metadata service
- [x] Stealth address service
- [x] REST API endpoints
- [x] Unit tests
- [x] Documentation

### Phase 2: Contract Integration
- [ ] Deploy updated Soroban contract
- [ ] Integration tests with contract
- [ ] Event listening setup
- [ ] Testnet deployment

### Phase 3: Client Implementation
- [ ] Frontend stealth payment UI
- [ ] Mobile wallet scanning
- [ ] Key management library
- [ ] QR code sharing for public keys

### Phase 4: Production
- [ ] Security audit completion
- [ ] Mainnet deployment
- [ ] User documentation
- [ ] Migration guide for existing users

## References

- **Backend Implementation:** See [PRIVACY-HARDENING.md](PRIVACY-HARDENING.md)
- **Security Details:** See [SECURITY-AUDIT.md](SECURITY-AUDIT.md)
- **Contract Source:** `app/contract/contracts/quickex/src/stealth.rs`
- **Soroban SDK:** https://developers.stellar.org/learn/smart-contracts
