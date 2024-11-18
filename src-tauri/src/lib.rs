mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let builder = tauri::Builder::default();

    builder
        .invoke_handler(tauri::generate_handler![commands::show_main_window])
        .run(context)
        .expect("error while running tauri application");
}
