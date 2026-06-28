# Feat: Add Stable Event Type IDs

This PR introduces a stable `event_type_id` to all contract events, addressing the need for reliable event identification across contract upgrades.

## Changes

-   Added `event_type_id: u32` to all event structs in `events.rs`.
-   Updated all `publish_*` functions to initialize the `event_type_id`.

## Reasoning

By providing a stable identifier for each event, we can ensure that off-chain services can reliably track and process events, even if the event names or payload structures change in the future. This is a crucial step towards improving the long-term maintainability and interoperability of the contract.