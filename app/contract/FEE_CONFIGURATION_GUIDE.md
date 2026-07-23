# Fee Configuration Guide

> Comprehensive guide for configuring fees in the RustAcademy Soroban contract.

## Table of Contents

1. [Overview](#overview)
2. [Fee Resolution Priority](#fee-resolution-priority)
3. [Global Fee Configuration](#global-fee-configuration)
4. [Per-Asset Fee Overrides](#per-asset-fee-overrides)
5. [Arbiter Splits](#arbiter-splits)
6. [Collector Rotation](#collector-rotation)
7. [Fee Breakdown](#fee-breakdown)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The RustAcademy contract provides flexible fee configuration supporting:

- **Global fees** — Default fee applied to all tokens
- **Per-asset overrides** — Token-specific fee rates (XLM, USDC, custom tokens)
- **Oracle dynamic pricing** — USD-based fees from external price feeds
- **Arbiter splits** — Distribute fees among arbiter, platform, and collector
- **Collector rotation** — Update fee recipient without affecting existing escrows

All fees are expressed in **basis points** (bps): 1 = 0.01%, 100 = 1%, 10000 = 100%.

---

## Fee Resolution Priority

When calculating fees, the contract checks in this order:

### 1. Per-Asset Override (Highest Priority)

```
If token has per-asset config set → use it (ignore oracle and global)
```

**Example**: XLM configured for 1% when global is 2% → XLM uses 1%.

### 2. Oracle Dynamic Pricing

```
If oracle is configured AND price is fresh → calculate USD-based fee
```

**Example**: Global 2%, but oracle price says fee should be $5 USD worth.

### 3. Global Static Fee (Lowest Priority)

```
Otherwise → use global fee config
```

---

## Global Fee Configuration

The global fee is the simplest starting point. It applies to all tokens unless overridden.

### Set Global Fee

```rust
use soroban_sdk::Address;
use soroban_sdk::token;

// Setup
let client = RustAcademyContractClient::new(&env, &contract_id);
let admin = Address::generate(&env);
client.initialize(&admin)?;

// Set global fee to 2% (200 basis points)
client.set_fee_config(
    &admin,
    &FeeConfig {
        fee_bps: 200,
        schema_version: FEE_CONFIG_SCHEMA_VERSION,
    },
)?;
```

### Fee Calculation Example

| Amount | Global Fee | Calculation | Net Payout |
|--------|-----------|-------------|-----------|
| 10,000 | 200 bps   | 10,000 × 200 / 10000 | 9,800 |
| 1,000  | 200 bps   | 1,000 × 200 / 10000  | 980   |
| 100    | 200 bps   | 100 × 200 / 10000    | 98    |

---

## Per-Asset Fee Overrides

Override the global fee for specific tokens (e.g., lower fees for stablecoins, higher for volatile assets).

### Basic Per-Asset Override

```rust
// Create tokens
let xlm_token = create_token(&env);
let usdc_token = create_token(&env);

// Set different fees for different tokens
// XLM: 1%
client.set_per_asset_fee(
    &admin,
    &xlm_token,
    &PerAssetFeeConfig {
        fee_bps: 100,  // 1%
        arbiter_bps: 0,
        ..Default::default()
    },
)?;

// USDC (stablecoin): 0.5%
client.set_per_asset_fee(
    &admin,
    &usdc_token,
    &PerAssetFeeConfig {
        fee_bps: 50,   // 0.5%
        arbiter_bps: 0,
        ..Default::default()
    },
)?;
```

### Disable Fees for Specific Token

```rust
// Set fee_bps = 0 to disable fees for this token
client.set_per_asset_fee(
    &admin,
    &reward_token,
    &PerAssetFeeConfig {
        fee_bps: 0,  // No fee for reward token
        arbiter_bps: 0,
        ..Default::default()
    },
)?;
```

### Query Per-Asset Fee

```rust
// Check if a token has a per-asset override
if let Some(config) = client.get_per_asset_fee(&token) {
    println!("Per-asset fee: {}%", config.fee_bps / 100);
} else {
    println!("Uses global fee or oracle pricing");
}
```

---

## Arbiter Splits

Distribute collected fees between the arbiter, platform wallet, and fee collector.

### Simple Arbiter Split (Legacy)

Use `arbiter_bps` for a straightforward percentage split:

```rust
// 2% fee, 25% of fee goes to arbiter
client.set_per_asset_fee(
    &admin,
    &token,
    &PerAssetFeeConfig {
        fee_bps: 200,
        arbiter_bps: 2500,  // 25% of fee
        ..Default::default()
    },
)?;
```

**Example breakdown for 10,000 amount:**
- Total fee: 200 (2% of 10,000)
- Arbiter gets: 50 (25% of 200)
- Collector gets: 150 (75% of 200)
- Net to recipient: 9,800

### Explicit Fee Splits (Advanced)

Use `FeeRatio` for precise control over multiple fee recipients:

```rust
// Split 0.5% fee: 40% arbiter, 30% platform, 30% collector
client.set_per_asset_fee(
    &admin,
    &token,
    &PerAssetFeeConfig {
        fee_bps: 50,  // Total 0.5% fee
        arbiter_bps: 0,  // Ignored when explicit ratios are set
        arbiter_fee: FeeRatio {
            numerator: 2,
            denominator: 5,  // 40% of fee
        },
        platform_fee: FeeRatio {
            numerator: 3,
            denominator: 10,  // 30% of fee
        },
        collector_fee: FeeRatio {
            numerator: 3,
            denominator: 10,  // 30% of fee
        },
        schema_version: PER_ASSET_FEE_SCHEMA_VERSION,
    },
)?;
```

**Example breakdown for 10,000 amount:**
- Total fee: 50 (0.5% of 10,000)
- Arbiter gets: 20 (40% of 50)
- Platform gets: 15 (30% of 50)
- Collector gets: 15 (30% of 50)
- Net to recipient: 9,950

### FeeRatio Validation

```rust
// FeeRatio must be 0 (disabled) or a valid fraction <= 1.0
FeeRatio {
    numerator: 1,
    denominator: 2,  // Valid: 0.5
}

FeeRatio {
    numerator: 0,
    denominator: 1,  // Valid: 0 (disabled)
}

FeeRatio {
    numerator: 3,
    denominator: 2,  // INVALID: > 1.0
}
```

---

## Collector Rotation

Change the fee collector address without disrupting existing escrows.

### Rotate to New Collector

```rust
let new_collector = Address::generate(&env);

// Rotate to new collector
let new_index = client.rotate_collector(&admin, &new_collector)?;

println!("New collector index: {}", new_index);
```

### Behavior After Rotation

- **Old escrows**: When they're spent/refunded, fees go to the NEW collector (not the old one)
- **New escrows**: Immediately route fees to the new collector
- **No re-funding**: Existing escrow entries don't change; only routing changes at settlement

This is safe because the contract reads the current collector index at payout time, not at deposit time.

---

## Fee Breakdown

Each payout operation returns a detailed breakdown:

```rust
FeeBreakdown {
    net_payout: i128,      // Amount recipient receives
    total_fee: i128,       // Total collected
    arbiter_fee: i128,     // Arbiter's share
    platform_fee: i128,    // Platform wallet's share
    collector_fee: i128,   // Fee collector's share
}
```

### Example Breakdown

```
Amount: 10,000
Config: fee_bps=200, arbiter_bps=2500

Calculation:
- Total fee = 10,000 × 200 / 10000 = 200
- Arbiter = 200 × 2500 / 10000 = 50
- Collector = 200 - 50 = 150

Result:
FeeBreakdown {
    net_payout: 9800,
    total_fee: 200,
    arbiter_fee: 50,
    platform_fee: 0,
    collector_fee: 150,
}
```

---

## Common Patterns

### Pattern 1: Simple Tiered Fees

Different fee rates for different asset types:

```rust
// Stablecoins: 0.1%
client.set_per_asset_fee(&admin, &usdc, &PerAssetFeeConfig {
    fee_bps: 10,
    ..Default::default()
})?;

// Native XLM: 0.5%
client.set_per_asset_fee(&admin, &xlm, &PerAssetFeeConfig {
    fee_bps: 50,
    ..Default::default()
})?;

// Volatile tokens: 2%
client.set_per_asset_fee(&admin, &alt_token, &PerAssetFeeConfig {
    fee_bps: 200,
    ..Default::default()
})?;
```

### Pattern 2: Arbiter Incentivization

Give arbiters a share of dispute resolution fees:

```rust
// 1% fee, 20% of fee to arbiters
client.set_per_asset_fee(&admin, &token, &PerAssetFeeConfig {
    fee_bps: 100,
    arbiter_bps: 2000,  // 20%
    ..Default::default()
})?;
```

### Pattern 3: Multi-Recipient Fee Distribution

Split fees among platform, arbiters, and community:

```rust
client.set_per_asset_fee(&admin, &token, &PerAssetFeeConfig {
    fee_bps: 100,  // 1%
    arbiter_fee: FeeRatio { numerator: 2, denominator: 5 },    // 40%
    platform_fee: FeeRatio { numerator: 3, denominator: 10 },  // 30%
    collector_fee: FeeRatio { numerator: 3, denominator: 10 }, // 30%
    ..Default::default()
})?;
```

### Pattern 4: Fee-Free Reward Tokens

Incentivize usage by removing fees:

```rust
client.set_per_asset_fee(&admin, &reward_token, &PerAssetFeeConfig {
    fee_bps: 0,  // No fee
    ..Default::default()
})?;
```

---

## Troubleshooting

### Issue: Per-asset fee not applied

**Check the priority order:**

1. Is a per-asset override actually set? Call `get_per_asset_fee(&token)`.
2. Is oracle pricing configured and fresh? Check oracle age against `stale_threshold_secs`.
3. Is the global fee being used instead? Verify with `get_fee_config()`.

### Issue: Fee exceeds payout amount

**When fees are high relative to the amount:**

```
Amount: 100
Fee: 50 (50%)
Result: Net payout = 50, Fee = 50

Amount: 50
Fee: 50 (100%)
Result: Net payout = 0, Fee = 50
```

**Solution**: Ensure fees are reasonable relative to expected transaction sizes.

### Issue: Arbiter fee split not working

**Check these conditions:**

1. Is `arbiter_fee` explicitly set? If so, `arbiter_bps` is ignored.
2. Is an arbiter provided to `route_payout()`? Without arbiter, no arbiter share is sent.
3. Did you call `validate()` on the config? Invalid ratios fail at set time.

### Issue: Collector rotation not affecting payouts

**Remember:**

- Old escrows use the NEW collector address at settlement time (not creation time).
- Rotation just increments the index; it doesn't re-process existing escrows.
- If no collector is configured, fees stay in the contract.

---

## See Also

- [README.md](./README.md) — General contract overview
- [types.rs](./contracts/Folder/src/types.rs) — `PerAssetFeeConfig` and `FeeRatio` definitions
- [fee_router.rs](./contracts/Folder/src/fee_router.rs) — Fee routing logic
- [fee.rs](./contracts/Folder/src/fee.rs) — Fee calculation functions
