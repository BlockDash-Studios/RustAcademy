# Upgrade Safety Gate - Quick Reference

Storage layout is declared in `app/contract/contracts/Folder/src/storage.rs`.

## Keys at a glance

| Key             | Type            | Singleton |
|-----------------|-----------------|----------|
| `Config`        | `FolderConfig`   | yes      |
| `Admin`         | `Address`       | yes      |
| `Initialized`   | `boolean`        | yes      |
| `Folder(id)`    | `Folder`         | no       |
| `FolderIndex`   | `Vec<u64>`       | yes      |
| `OwnerFolders(a)` | `Vec<u64>`      | no       |
| `ParentChildren(i)` | `Vec<u64>`       | no       |
| `NextId`        | u64             | yes      |

## Rules of the gate

1. Add new keys at the end of `STORAGE_ENTRIES`.
2. Never rename, retype, or reuse an existing key.
3. Every new key gets a round-trip test in `storage_test.rs`.
4. Every new key gets a row in the table above and in `README.md`.
5. Run `cargo test -p folder-contract` before approving.

## File map

| Purpose            | Path                                                   |
|--------------------|----------------------------------------------------------|
| Layout + metadata  | `app/contract/contracts/Folder/src/storage.rs`              |
| Layout tests       | `app/contract/contracts/Folder/src/storage_test.rs`         |
| Persisted types    | `app/contract/contracts/Folder/src/types.rs`               |
| Overview           | `app/contract/README.md`                                   |
| Implementation guide | `app/contract/docs/UPGRADE_SAFETY_GATE_IMPLEMENTATION.md` |
