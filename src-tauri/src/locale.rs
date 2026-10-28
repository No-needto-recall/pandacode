//! Local-only UI language preference. Never affects harness prompts or wire protocols.
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) enum Locale {
    #[default]
    #[serde(rename = "zh-CN")]
    Chinese,
    #[serde(rename = "en")]
    English,
}

impl Locale {
    pub(crate) fn text(self, chinese: &'static str, english: &'static str) -> &'static str {
        match self {
            Self::Chinese => chinese,
            Self::English => english,
        }
    }

    pub(crate) fn launcher_title(self) -> &'static str {
        self.text("PandaCode 快速启动器", "PandaCode launcher")
    }

    pub(crate) fn dock_title(self) -> &'static str {
        self.text("运行中的智能体", "Running agents")
    }
}

struct LocaleState {
    path: PathBuf,
    value: Mutex<Locale>,
}

fn load(path: &Path) -> Locale {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(path: &Path, locale: Locale) -> crate::Result<()> {
    let bytes = serde_json::to_vec(&locale).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, bytes)
        .map_err(|e| format!("Could not save language settings: {e}"))?;
    std::fs::rename(&temporary, path).map_err(|e| format!("Could not save language settings: {e}"))
}

pub(crate) fn setup(app: &AppHandle, dir: &Path) {
    let path = dir.join("locale.json");
    let value = Mutex::new(load(&path));
    app.manage(LocaleState { path, value });
}

pub(crate) fn current(app: &AppHandle) -> Locale {
    let state = app.state::<LocaleState>();
    let value = *state.value.lock().unwrap_or_else(|e| e.into_inner());
    value
}

#[tauri::command]
pub(crate) fn locale_get(app: AppHandle) -> Locale {
    current(&app)
}

/// Serialize persistence, native UI updates and events on the UI thread. Only the
/// main webview may invoke this command (lib.rs); auxiliary views are read-only.
#[tauri::command]
pub(crate) async fn locale_set(app: AppHandle, locale: Locale) -> crate::Result<Locale> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            let state = handle.state::<LocaleState>();
            let mut value = state.value.lock().map_err(|e| e.to_string())?;
            save(&state.path, locale)?;
            *value = locale;
            drop(value);
            if let Err(error) = crate::tray::localize(&handle, locale) {
                eprintln!("Could not update menu bar language: {error}");
            }
            for (label, title) in [
                ("launcher", locale.launcher_title()),
                ("agents-dock", locale.dock_title()),
            ] {
                if let Some(window) = handle.get_webview_window(label) {
                    if let Err(error) = window.set_title(title) {
                        eprintln!("Could not update window language: {error}");
                    }
                }
            }
            handle
                .emit("locale-changed", locale)
                .map_err(|e| e.to_string())?;
            Ok(locale)
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locale_is_a_closed_wire_enum() {
        assert_eq!(
            serde_json::to_string(&Locale::default()).unwrap(),
            "\"zh-CN\""
        );
        assert_eq!(
            serde_json::from_str::<Locale>("\"en\"").unwrap(),
            Locale::English
        );
        for unsupported in ["\"zh\"", "\"fr\"", "\"EN\"", "null", "{}"] {
            assert!(serde_json::from_str::<Locale>(unsupported).is_err());
        }
    }

    #[test]
    fn preferences_default_and_round_trip_without_database() {
        let dir = std::env::temp_dir().join(format!("pandacode-locale-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("locale.json");
        assert_eq!(load(&path), Locale::Chinese);
        save(&path, Locale::English).unwrap();
        assert_eq!(load(&path), Locale::English);
        save(&path, Locale::Chinese).unwrap();
        assert_eq!(load(&path), Locale::Chinese);
        for invalid in ["not json", "\"fr\""] {
            std::fs::write(&path, invalid).unwrap();
            assert_eq!(load(&path), Locale::Chinese);
        }
        assert!(!path.with_extension("tmp").exists());
        assert!(save(&dir.join("missing/locale.json"), Locale::English).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn auxiliary_webviews_can_read_but_not_change_language() {
        let source = include_str!("lib.rs");
        for label in ["launcher", "tray", "agents-dock"] {
            let branch = source
                .split(&format!(
                    "if invoke.message.webview_ref().label() == \"{label}\" {{"
                ))
                .nth(1)
                .unwrap()
                .split("return handler(invoke);")
                .next()
                .unwrap();
            assert!(branch.contains("locale::locale_get,"), "{label}");
            assert!(!branch.contains("locale::locale_set,"), "{label}");
        }
        let main = source
            .split("if invoke.message.webview_ref().label() != \"main\"")
            .nth(1)
            .unwrap();
        assert!(main.contains("locale::locale_get,"));
        assert!(main.contains("locale::locale_set,"));
        assert_eq!(source.matches("locale::locale_set,").count(), 1);
    }

    #[test]
    fn native_titles_follow_language() {
        assert_eq!(Locale::Chinese.launcher_title(), "PandaCode 快速启动器");
        assert_eq!(Locale::English.launcher_title(), "PandaCode launcher");
        assert_eq!(Locale::Chinese.dock_title(), "运行中的智能体");
        assert_eq!(Locale::English.dock_title(), "Running agents");
    }
}
