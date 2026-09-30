# Upgrade Safety Gate - Implementation

## Overview

The Folder contract persists data under a fixed set of storage keys. The upgrade safety gate ensures that any change to that layout is deliberate, documented, and tested before an upgrade is approved.

The layout is declared in one place: `app/contract/contracts/Folder/src/storage.rs`. That module exposes:

- Key constants (`CONFIG_KEY`, `ADMIN_KEY`, `INITIALIZED_KEY`, `FOLDER_KEY`, `FOLDER_INDEX_KEY`, `OWNER_FOLDERS_KEY`, `PARENT_CHILDREN_KEY`, `NEXT_ID_KEY`).
- Key builders (`folder_key`, `owner_folders_key`, `parent_children_key`).
- A structured `STORAGE_ENTRIES` registry describing each entry.

## Gate Checklist

Before merging a change that touches contract storage:

1. **Koy additions only.** Existing keys must not be renamed, retyped, or reused.
2. **Update `STORAGE_ENTRIES`.** Any new key must be added to the registry in `storage.rs`.
3. **Update `storage_test.rs`.** The expected layout array and the round-trip tests must cover the new key.
4. **Update `README.md`.** The storage layout table in the contract README must reflect the new key.
5. **Run the storage tests.** `cargo test -p folder-contract` must pass.

## Implementation Notes

- The `STORAGE_ENTRIES` array is ordered and the test compares it index-by-index against an expected list of strings. Adding a key at the end keeps the diff minimal.
- Singleton keys are marked with `singleton: true` in the registry. This is informational for reviewers and tooling.
- The key builders are the only supported way to construct composite keys. Handlers must not hard-code key tuples.

## References

- `Storage layout`: `app/contract/contracts/Folder/src/storage.rs`
- `Layout tests`: `app/contract/contracts/Folder/src/storage_test.rs`
- `Quick reference`: `app/contract/docs/UPGRADE_SAFETY_GATE_QUICK_REFERENCE.md`
