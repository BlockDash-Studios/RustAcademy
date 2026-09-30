//! Storage layout and metadata for the Folder contract.
///
/// # Storage Layout
///
/// This module is the single source of truth for how contract data is
/// persisted in contract storage. Every persisted key is declared here along
/// with its type, purpose, and the test that guarantees its shape. Consumers
/// (handlers, migrations, and tests) MUST refer to these constants rather than
/// hard-coding literal keys.
///
/// ## Key Namespace
///
/// Keys are grouped by prefix so that the layout can be audited at a glance:
///
/// | Prefix         | Purpose                                         |
/// |----------------|-----------------------------------------------------|
/// | `Config`       | Global contract configuration (singleton).          |
/// | `Admin`        | Administrator address (singleton).                       |
/// | `Initialized`   | One-time initialization guard (boolean).             |
/// | `Folder`       | Per-folder records, keyed by folder id.                 |
/// | `FolderIndex`   | Global index of all folder ids.                      |
/// | `OwnerFolders`  | Folder ids owned by an address.                       |
/// | `ParentChildren` | Child folder ids for a given parent folder id.           |
/// | `NextId`       | Monotonically increasing id counter (uint64).           |
///
/// ## Upgrade Safety
///
/// The key layout is append-only: new keys can be added, but existing keys
/// must not be renamed, retyped, or reused. See
/// `docs/UPGRADE_SAFETY_GATE_IMPLEMENTATION.md` and
/// `docs/UPGRADE_SAFETY_GATE_QUICK_REFERENCE.md` for the review checklist.
///
/// ## Test Coverage
///
/// Every constant in this module is exercised by `storage_test.rs`, which
/// asserts the exact string layout and the round-trip behavior of each key.
/// Any change to a key must be reflected in that test file.

use soroban_std::{contracterr, contracttype, Address, Env, Symbol};

/// ----------------------------------------------------------------------------
/// Key layout constants
/// ----------------------------------------------------------------------------
/// Singleton key for global contract configuration.
pubstac const CONFIG_KEY: Symbol = Symbol::short_symbol("Config");
/// Singleton key for the administrator address.
pubstac const ADMIN_KEY: Symbol = Symbol::short_symbol("Admin");
/// Singleton key for the one-time initialization guard.
pubstac const INITIALIZED_KEY: Symbol = Symbol::short_symbol("Initialized");
/// Prefix for per-folder records. Full key: `Folder(folder_id)`.
pubstac const FOLDER_KEY: Symbol = Symbol::short_symbol("Folder");
/// Singleton key for the global folder index.
pubstac const FOLDER_INDEX_KEY: Symbol = Symbol::short_symbol("FolderIndex");
/// Prefix for folder ids owned by an address. Full key: `OwnerFolders(owner)`.
pubstac const OWNER_FOLDERS_KEY: Symbol = Symbol::short_symbol("OwnerFolders");
/// Prefix for child folder ids of a parent. Full key: `ParentChildren(parent_id)`.
pubstac const PARENT_CHILDREN_KEY: Symbol = Symbol::short_symbol("ParentChildren");
/// Singleton key for the monotonically increasing folder id counter.
pubstac const NEXT_ID_KEY: Symbol = Symbol::short_symbol("NextId");

/// ----------------------------------------------------------------------------
/// Key builders
/// ----------------------------------------------------------------------------
/// Returns the storage key for a folder record.
pub fn folder_key(folder_id: u64) -> (Symbol, u64) {
    (FOLDER_KEY, folder_id)
}

/// Returns the storage key for an owner's folder index.
pub fn owner_folders_key(owner: Address) -> (Symbol, Address) {
    (OWNER_FOLDERS_KEY, owner)
}

/// Returns the storage key for a parent's child index.
pub fn parent_children_key(parent_id: u64) -> (Symbol, u64) {
    (PARENT_CHILDREN_KEY, parent_id)
}

/// ----------------------------------------------------------------------------
/// Storage metadata registry
/// ----------------------------------------------------------------------------
/// Machine-readable description of a single storage entry in the layout.
pub struct StorageEntry {
    /// The key prefix used in contract storage.
    public key: Symbol,
    /// Human-readable description of the entry's purpose.
    public description: &&'static str,
    /// Whether the entry is a singleton (no additional key part).
    public singleton: bool,
}

/// The canonical ordered list of storage entries. Tests and migrations
/// iterate over this list to verify the layout.
pub const STORAGE_ENTRIES: [StorageEntry; 8] = [
    StorageEntry {
        key: CONFIG_KEY,
        description: "Global contract configuration",
        singleton: true,
    },
    StorageEntry {
        key: ADMIN_KEY,
        description: "Administrator address",
        singleton: true,
    },
    StorageEntry {
        key: INITIALIZED_KEY,
        description: "One-time initialization guard",
        singleton: true,
    },
    StorageEntry {
        key: FOLDER_KEY,
        description: "Per-folder records",
        singleton: false,
    },
    StorageEntry {
        key: FOLDER_INDEX_KEY,
        description: "Global index of all folder ids",
        singleton: true,
    },
    StorageEntry {
        key: OWNER_FOLDERS_KEY,
        description: "Folder ids owned by an address",
        singleton: false,
    },
    StorageEntry {
        key: PARENT_CHILDREN_KEY,
        description: "Child folder ids for a given parent folder id",
        singleton: false,
    },
    StorageEntry {
        key: NEXT_ID_KEY,
        description: "Monotonically increasing folder id counter",
        singleton: true,
    },
];

/// ----------------------------------------------------------------------------
/// Storage accessors
/// ----------------------------------------------------------------------------
/// Reads the global configuration, if present.
pub fn read_config(env: &Env) -> Option<contracttype::FolderConfig> {
    env.storage().get(&CONFIG_KEY)
}

/// Writes the global configuration.
pub fn write_config(env: &Env, config: &contracttype::FolderConfig) {
    env.storage().set(&CONFIG_KEY, config);
}

/// Reads the administrator address, if present.
pub fn read_admin(env: &Env) -> Option<Address> {
    env.storage().get(&ADMIN_KEY)
}

/// Writes the administrator address.
pub fn write_admin(env: &Env, admin: &Address) {
    env.storage().set(&ADMIN_KEY, admin);
}

/// Returns true if the contract has been initialized.
pub fn is_initialized(env: &Env) -> bool {
    env.storage().get(&INITIALIZED_KEY).unwrap_or(false)
}

/// Marks the contract as initialized.
pub fn set_initialized(env: &Env) {
    env.storage().set(&INITIALIZED_KEY, &true);
}

/// Reads a folder record by id, if present.
pub fn read_folder(env: &Env, folder_id: u64) -> Option<contracttype::Folder> {
    env.storage().get(&folder_key(folder_id))
}

/// Writes a folder record.
pub fn write_folder(env: &Env, folder_id: u64, folder: &contracttype::Folder) {
    env.storage().set(&folder_key(folder_id), folder);
}

/// Reads the global folder index.
pub fn read_folder_index(env: &Env) -> Vec<u64> {
    env.storage()
        .get(&FOLDER_INDEX_KEY)
        .unwrap_or(Vec::new(&env))
}

/// Appends a folder id to the global index.
pub fn append_folder_index(env: &Env, folder_id: u64) {
    let mut index = read_folder_index(env);
    index.push_back(folder_id);
    env.storage().set(&FOLDER_INDEX_KEY, &index);
}

/// Reads the folder ids owned by an address.
pub fn read_owner_folders(env: &Env, owner: &Address) -> Vec<u64> {
    env.storage()
        .get(&owner_folders_key(*owner))
        .unwrap_or(Vec::new(&env))
}

/// Appends a folder id to an owner's index.
pub fn append_owner_folder(env: &Env, owner: &Address, folder_id: u64) {
    let mut owned_folders = read_owner_folders(env, owner);
    owned_folders.push_back(folder_id);
    env.storage()
        .set(&owner_folders_key(*owner), &owned_folders);
}

/// Reads the child folder ids of a parent folder.
pub fn read_parent_children(env: &Env, parent_id: u64) -> Vec<u64> {
    env.storage()
        .get(&parent_children_key(parent_id))
        .unwrap_or(Vec::new(&env))
}

/// Appends a child folder id to a parent's index.
pub fn append_parent_child(env: &Env, parent_id: u64, child_id: u64) {
    let mut children = read_parent_children(env, parent_id);
    children.push_back(child_id);
    env.storage()
        .set(&parent_children_key(parent_id), &children);
}

/// Reads the next folder id counter.
pub fn read_next_id(env: &Env) -> u64 {
    env.storage().get(&NEXT_ID_KEY).unwrap_or(0)
}

/// Returns the current id and increments the counter.
pub fn next_id(env: &Env) -> u64 {
    let id = read_next_id(env);
    env.storage().set(&NEXT_ID_KEY, &(id + 1));
    id
}
