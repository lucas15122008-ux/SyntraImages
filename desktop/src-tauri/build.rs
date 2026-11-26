fn main() {
    // Recompila quando o endereço do Syntra (SYNTRA_URL) mudar.
    println!("cargo:rerun-if-env-changed=SYNTRA_URL");
    tauri_build::build()
}
