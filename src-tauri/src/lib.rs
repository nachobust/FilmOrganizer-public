// Desktop shell for FilmOrganizer. The app itself is the same web code as the browser
// version; the dialog and fs plugins give exports a native "Save as" window.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running FilmOrganizer");
}
