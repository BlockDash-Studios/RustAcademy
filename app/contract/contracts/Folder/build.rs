use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR environment variable must be set by cargo");
    let dest_path = Path::new(&out_dir).join("build_manifest.rs");

    let git_hash = get_git_hash();
    let build_timestamp = get_build_timestamp();
    let source_hash = get_source_hash();
    let schema_version = "1";

    let manifest_content = format!(
        r##"
/// Build-time manifest embedded in the WASM artifact.
///
/// This metadata is generated at compile time and provides deterministic
/// correlation between deployed WASM artifacts and their source code.
pub const BUILD_MANIFEST: &str = r#"{}"#;

/// Build timestamp in seconds since UNIX epoch.
pub const BUILD_TIMESTAMP: u64 = {};

/// Full git commit hash of the build source.
pub const GIT_HASH: &str = "{}";

/// Hash of the source files used to build this WASM (deterministic build verification).
pub const SOURCE_HASH: &str = "{}";

/// Schema version for the build manifest format.
pub const BUILD_MANIFEST_SCHEMA_VERSION: u32 = {};
"##,
        serde_json::json!({
            "git_hash": git_hash,
            "build_timestamp": build_timestamp,
            "source_hash": source_hash,
            "schema_version": schema_version,
        }),
        build_timestamp,
        git_hash,
        source_hash,
        schema_version
    );

    fs::write(&dest_path, manifest_content)
        .expect("Failed to write build manifest to OUT_DIR");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src/");
    println!("cargo:rerun-if-changed=Cargo.toml");
}

fn get_git_hash() -> String {
    let output = Command::new("git")
        .args(&["rev-parse", "HEAD"])
        .output()
        .expect("Failed to execute `git rev-parse HEAD` — is git installed and is this a git repository?");

    if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        "unknown".to_string()
    }
}

fn get_build_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn get_source_hash() -> String {
    let mut hasher = blake3::Hasher::new();
    hash_directory(&mut hasher, Path::new("src")).unwrap_or(());
    hasher.finalize().to_string()
}

fn hash_directory(hasher: &mut blake3::Hasher, path: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "rs") {
            let contents = fs::read(&path)?;
            hasher.update(path.to_string_lossy().as_bytes());
            hasher.update(&contents);
        } else if path.is_dir() {
            hash_directory(hasher, &path)?;
        }
    }
    Ok(())
}