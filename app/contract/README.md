# Folder Contract

A Soroban smart contract that manages hierarchical folders for owners.

## Layout

```
app/contract/
├── Cargo.toml
├── README.md                          # this file
├── docs/
    ├── UPGRADE_SAFETY_GATE_IMPLEMENTATION.md
    └── UPGRADE_SAFETY_GATE_QUICK_REFERENCE.md
├── contracts/
    └── Folder/
        ├── src/
        │   ├── lib.rs
        │   ├── storage.rs          # storage layout + metadata
        │   ├── storage_test.rs     # tests pinning the layout
        │   └── types.rs            # persisted types
        └── Cargo.toml
```

## Storage Layout

The contract storage layout is declared in contracts/Folder/src/storage.rs`. That module is the single source of truth for key names, types, and the machine-readable `STORAGE_ENTRIES` registry.

| Key             | Type                         | Purpose                                         |
 |-----------------|------------------------------|------------------------------------------------------|
| `Config`        | `FolderConfig`                 | Global contract configuration (singleton).          |
| `Admin`         | `Address`                      | Administrator address (singleton).                       |
| `Initialized`   | `boolean`                      | One-time initialization guard (singleton).             |
| `Folder(id)`    | `Folder`                        | Per-folder record.                                     |
| `FolderIndex`   | `Vec<u64>`                      | Global index of all folder ids.                      |
| `OwnerFolders(a)` | `Vec<u64>`                     | Folder ids owned by address `a`.                       |
| `ParentChildren(i)` | `Vec<u64>`                   | Child folder ids for parent `i`.                       |
| `NextId`       | u64                             | Monotonically increasing folder id counter.           |

Every key is exercised by `contracts/Folder/src/storage_test.rs`. The test file asserts the exact string layout and round-trips each entry, so any layout change must be accompanied by an update to this document and to the test.

## Upgrade Safety

The key layout is append-only: new keys may be added, but existing keys must not be renamed, retyped, or reused. See:

- [`docs/UPGRADE_SAFETY_GATE_IMPLEMENTATION.md`](docs/UPGRADE_SAFETY_GATE_IMPLEMENTATION.md)
- [`docs/UPGRADE_SAFETY_GATE_QUICK_REFERENCE.md`](docs/UPGRADE_SAFETY_GATE_QUICK_REFERENCE.md)

## Testing

```bash
cargo test -p folder-contract
```

The storage layout tests live in `contracts/Folder/src/storage_test.rs`.
