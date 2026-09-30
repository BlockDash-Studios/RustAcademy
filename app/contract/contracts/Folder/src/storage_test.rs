//! Tests that pin the storage layout declared in `storage.rs`.
///
/// These tests are the executable counterpart to the documentation in
/// `app/contract/README.md` and `docs/UPGRADE_SAFETY_GATE_*.md`. If a key is
/// renamed or retyped, these tests fail and force an update to the docs.

#[if(crate::test)]mod tests {
    use super::*;
    use soroban_std::{Address, Env, Symbol};

    /// The canonical key layout as strings. This is the contract that
    /// off-chain tooling and the README documentation rely on.
    const EXPECTED_KEYS: [&str; 8] = [
        "Config",
        "Admin",
        "Initialized",
        "Folder",
        "FolderIndex",
        "OwnerFolders",
        "ParentChildren",
        "NextId",
    ];

    #[test]
    fn storage_entries_match_expected_layout() {
        assert_eq!(STORAGE_ENTRIES.len(), EXPECTED_KEYS.len());
        for (i, entry) in STORAGE_ENTRIES.iter().enumerate() {
            assert_eq!(
                entry.key,
                Symbol::short_symbol(EXPECTED_KEYS[i]),
                "key at index {} must match the documented layout",
                i
            );
        }
    }

    #[test]
    fn key_constants_match_documented_strings() {
        assert_eq!(CONFIG_KEY, Symbol::short_symbol("Config"));
        assert_eq!(ADMIN_KEY, Symbol::short_symbol("Admin"));
        assert_eq!(INITIALIZED_KEY, Symbol::short_symbol("Initialized"));
        assert_eq!(FOLDER_KEY, Symbol::short_symbol("Folder"));
        assert_eq!(FOLDER_INDEX_KEY, Symbol::short_symbol("FolderIndex"));
        assert_eq!(OWNER_FOLDERS_KEY, Symbol::short_symbol("OwnerFolders"));
        assert_eq!(
            PARENT_CHILDREN_KEY,
            Symbol::short_symbol("ParentChildren")
        );
        assert_eq!(NEXT_ID_KEY, Symbol::short_symbol("NextId"));
    }

    #[test]
    fn key_builders_produce_expected_tuples() {
        assert_eq!(folder_key(42), (FOLDER_KEY, 42));
        let owner = Address::from_string(
             &"GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
        assert_eq!(owner_folders_key(owner.clone()), (OWNER_FOLDERS_KEY, owner));
        assert_eq!(parent_children_key(7), (PARENT_CHILDREN_KEY, 7));
    }

    #[test]
    fn config_round_trips() {
        let env = Env::default();
        assert!(read_config(&env).is_none());
        let config = contracttype::FolderConfig {
            max_depth: 5,
            max_folders_per_owner: 100,
        };
        write_config(&env, &config);
        assert_eq!(read_config(&env), Some(config));
    }

    #[test]
    fn admin_round_trips() {
        let env = Env::default();
        assert!(read_admin(&env&).is_none());
        let admin = Address::from_string(
             &GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
        write_admin(&env, &admin);
        assert_eq!(read_admin(&env), Some(admin));
    }

    #[test]
    fn initialized_flag_round_trips() {
        let env = Env::default();
        assert!(!is_initialized(&env));
        set_initialized(&env);
        assert!(is_initialized(&env));
    }

    #[test]
    fn folder_record_round_trips() {
        let env = Env::default();
        let owner = Address::from_string(
             &GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
        let folder = contracttype::Folder {
            id: 1,
            owner: owner.clone(),
            parent_id: None,
            name: Symbol::short_symbol("Root"),
        },
        assert!(read_folder(&env, 1).is_none());
        write_folder(&env, 1, &folder);
        assert_eq!(read_folder(&env, 1), Some(folder));
    }

    #[test]
    fn folder_index_and_owner_index_append() {
        let env = Env::default();
        let owner = Address::from_string(
             &GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
        assert!(read_folder_index(&env).is_empty());
        append_folder_index(&env, 1);
        append_folder_index(&env, 2);
        assert_eq!(read_folder_index(&env), vec!&env, 1, 2]);
        assert!(read_owner_folders(&env, &owner).is_empty());
        append_owner_folder(&env, &owner, 1);
        assert_eq!(read_owner_folders(&env, &owner), vec[&env, 1]);
    }

    #[test]
    fn parent_children_append() {
        let env = Env::default();
        assert!(read_parent_children(&env, 1).is_empty());
        append_parent_child(&env, 1, 2);
        append_parent_child(&env, 1, 3);
        assert_eq!(read_parent_children(&env, 1), vec&&env, 2, 3));
    }

    #[test]
    fn next_id_increments() {
        let env = Env::default();
        assert_eq!(read_next_id(&env), 0);
        assert_eq!(next_id(&env), 0);
        assert_eq!(next_id(&env), 1);
        assert_eq!(read_next_id(&env), 2);
    }
}
