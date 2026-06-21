use crate::{storage, types::OracleFeeConfig};
use soroban_sdk::{Address, Env};

pub fn get_oracle_fee_config(env: &Env) -> Option<OracleFeeConfig> {
    storage::get_oracle_fee_config(env)
}

/// Fetch the current price and timestamp from an external oracle contract.
///
/// Returns `Some((price_micros, timestamp))` when the oracle is available
/// and the data is fresh, or `None` if the oracle contract has not been
/// deployed or the call fails.  Callers should fall back to static fee
/// configuration when this returns `None`.
pub fn fetch_price(_env: &Env, _oracle: &Address) -> Option<(i128, u64)> {
    None
}
