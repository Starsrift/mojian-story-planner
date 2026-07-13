pub mod lifecycle;
pub mod storage;

use std::{thread, time::Duration};

use lifecycle::{CloseAction, LaunchMode, LifecycleState};
use serde_json::Value;
use storage::{StorageEngine, StorageStatus};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State, WindowEvent,
};
#[cfg(not(debug_assertions))]
use tauri_plugin_autostart::ManagerExt;
#[cfg(target_os = "macos")]
use tauri_plugin_autostart::MacosLauncher;

#[cfg(test)]
mod lifecycle_tests;
#[cfg(test)]
mod storage_tests;

#[tauri::command]
fn list_projects(storage: State<'_, StorageEngine>) -> Result<Vec<Value>, String> {
    storage.list_projects()
}

#[tauri::command]
fn put_project(storage: State<'_, StorageEngine>, project: Value) -> Result<(), String> {
    storage.put_project(&project)
}

#[tauri::command]
fn delete_project(storage: State<'_, StorageEngine>, project_id: String) -> Result<(), String> {
    storage.delete_project(&project_id)
}

#[tauri::command]
fn list_entities(
    storage: State<'_, StorageEngine>,
    kind: String,
    project_id: String,
) -> Result<Vec<Value>, String> {
    storage.list_entities(&kind, &project_id)
}

#[tauri::command]
fn put_entity(
    storage: State<'_, StorageEngine>,
    kind: String,
    entity: Value,
) -> Result<(), String> {
    storage.put_entity(&kind, &entity)
}

#[tauri::command]
fn delete_entity(
    storage: State<'_, StorageEngine>,
    kind: String,
    id: String,
) -> Result<(), String> {
    storage.delete_entity(&kind, &id)
}

#[tauri::command]
fn delete_story_card(storage: State<'_, StorageEngine>, id: String) -> Result<(), String> {
    storage.delete_story_card(&id)
}

#[tauri::command]
fn delete_character(storage: State<'_, StorageEngine>, id: String) -> Result<(), String> {
    storage.delete_character(&id)
}

#[tauri::command]
fn import_project_bundle(
    storage: State<'_, StorageEngine>,
    bundle: Value,
) -> Result<(), String> {
    storage.import_project_bundle(&bundle)
}

#[tauri::command]
fn storage_status(storage: State<'_, StorageEngine>) -> Result<StorageStatus, String> {
    storage.status()
}

#[tauri::command]
fn backup_now(storage: State<'_, StorageEngine>) -> Result<String, String> {
    storage
        .backup_now()
        .map(|path| path.to_string_lossy().into_owned())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &tauri::App, engine: StorageEngine) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示墨笺", true, None::<&str>)?;
    let backup_item = MenuItem::with_id(app, "backup", "立即备份", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &backup_item, &quit_item])?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("墨笺 · 小说策划台")
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "backup" => {
                let backup_engine = engine.clone();
                thread::spawn(move || match backup_engine.backup_now() {
                    Ok(path) => eprintln!("墨笺备份已生成：{}", path.display()),
                    Err(error) => eprintln!("墨笺手动备份失败：{error}"),
                });
            }
            "quit" => {
                app.state::<LifecycleState>().request_quit();
                app.exit(0);
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_mode = LaunchMode::from_args(std::env::args());
    let lifecycle = LifecycleState::default();

    let autostart_builder = tauri_plugin_autostart::Builder::new()
        .app_name("墨笺")
        .arg("--background");
    #[cfg(target_os = "macos")]
    let autostart_builder = autostart_builder.macos_launcher(MacosLauncher::LaunchAgent);

    tauri::Builder::default()
        .plugin(autostart_builder.build())
        .manage(lifecycle)
        .setup(move |app| {
            let data_root = app.path().home_dir()?.join(".mojian");
            let engine = StorageEngine::open(data_root).map_err(std::io::Error::other)?;

            match engine.migrate_legacy_snapshot() {
                Ok(true) => eprintln!("已将旧版墨笺本地镜像迁移到 SQLite"),
                Ok(false) => {}
                Err(error) => eprintln!("旧版墨笺数据迁移失败，原文件保持不变：{error}"),
            }
            if let Err(error) = engine.backup_if_due() {
                eprintln!("墨笺启动备份检查失败：{error}");
            }

            app.manage(engine.clone());
            setup_tray(app, engine.clone())?;

            #[cfg(not(debug_assertions))]
            if let Err(error) = app.autolaunch().enable() {
                eprintln!("无法启用墨笺开机自启动：{error}");
            }

            if launch_mode == LaunchMode::Background {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(60 * 60));
                if let Err(error) = engine.backup_if_due() {
                    eprintln!("墨笺后台备份检查失败：{error}");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let lifecycle = window.state::<LifecycleState>();
                if lifecycle.close_action() == CloseAction::HideWindow {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            put_project,
            delete_project,
            list_entities,
            put_entity,
            delete_entity,
            delete_story_card,
            delete_character,
            import_project_bundle,
            storage_status,
            backup_now,
        ])
        .run(tauri::generate_context!())
        .expect("无法启动墨笺桌面应用");
}
