#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::Metadata;
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const TERMINAL_OUTPUT_EVENT: &str = "terminal:output";
const TERMINAL_EXIT_EVENT: &str = "terminal:exit";
const TASKS_FILE_NAME: &str = "tasks.json";
const WORKSPACE_FILE_NAME: &str = "workspace.json";

#[derive(Clone)]
struct TerminalSession {
  master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
  writer: Arc<Mutex<Box<dyn Write + Send>>>,
  child: Arc<Mutex<Box<dyn portable_pty::Child + Send>>>
}

#[derive(Clone, Default)]
struct AppState {
  sessions: Arc<Mutex<HashMap<String, TerminalSession>>>
}

#[derive(Clone, Default)]
struct StartupContext {
  root_path: Option<String>
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateRequest {
  cwd: Option<String>,
  cols: Option<u16>,
  rows: Option<u16>,
  shell: Option<String>,
  args: Option<Vec<String>>
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResponse {
  session_id: String,
  pid: u32
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalWriteRequest {
  session_id: String,
  data: String
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalResizeRequest {
  session_id: String,
  cols: u16,
  rows: u16
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalKillRequest {
  session_id: String,
  signal: Option<String>
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
  session_id: String,
  data: String
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
  session_id: String,
  exit_code: i32,
  signal: Option<u32>
}

#[derive(Debug, Deserialize)]
struct FsListRequest {
  path: String
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FilesystemEntry {
  name: String,
  path: String,
  is_directory: bool,
  size: u64,
  mtime_ms: u64
}

#[derive(Debug, Deserialize)]
struct FsReadRequest {
  path: String
}

#[derive(Debug, Serialize)]
struct FsReadResponse {
  path: String,
  content: String
}

#[derive(Debug, Deserialize)]
struct FsWriteRequest {
  path: String,
  content: String
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskState {
  tasks: Vec<serde_json::Value>,
  updated_at: String
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceState {
  root_path: Option<String>,
  recent_paths: Vec<String>,
  updated_at: String
}

fn ensure_linux_runtime() -> Result<(), String> {
  if std::env::consts::OS != "linux" {
    return Err(format!(
      "OpenSpace currently supports Linux only. Detected platform: {}.",
      std::env::consts::OS
    ));
  }
  Ok(())
}

fn lock_error(name: &str) -> String {
  format!("failed to lock {name}")
}

fn io_error(message: &str, error: std::io::Error) -> String {
  format!("{message}: {error}")
}

fn resolve_path(input: &str) -> Result<PathBuf, String> {
  let candidate = PathBuf::from(input);
  if candidate.is_absolute() {
    return Ok(candidate);
  }
  std::env::current_dir()
    .map(|cwd| cwd.join(candidate))
    .map_err(|error| io_error("failed to resolve relative path", error))
}

fn normalize_workspace_root(path: PathBuf) -> Result<PathBuf, String> {
  if path.is_dir() {
    return Ok(path);
  }

  if path.is_file() {
    return path.parent().map(Path::to_path_buf).ok_or_else(|| {
      format!(
        "failed to determine workspace root for file path {}",
        path.display()
      )
    });
  }

  Err(format!(
    "startup path must be a file or directory: {}",
    path.display()
  ))
}

fn resolve_startup_root_from_args() -> Result<Option<String>, String> {
  let argument = match std::env::args().nth(1) {
    Some(value) if !value.trim().is_empty() => value,
    _ => return Ok(None)
  };

  let resolved = resolve_path(&argument)?;
  if !resolved.exists() {
    return Err(format!(
      "startup path does not exist: {}",
      resolved.display()
    ));
  }

  let root = normalize_workspace_root(resolved)?;
  let canonical_root = fs::canonicalize(&root)
    .map_err(|error| io_error("failed to canonicalize startup path", error))?;

  Ok(Some(canonical_root.to_string_lossy().into_owned()))
}

fn modified_time_ms(metadata: &Metadata) -> u64 {
  metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .and_then(|duration| u64::try_from(duration.as_millis()).ok())
    .unwrap_or_default()
}

fn default_task_state() -> TaskState {
  TaskState {
    tasks: Vec::new(),
    updated_at: Utc::now().to_rfc3339()
  }
}

fn default_workspace_state() -> WorkspaceState {
  WorkspaceState {
    root_path: None,
    recent_paths: Vec::new(),
    updated_at: Utc::now().to_rfc3339()
  }
}

fn persistence_file_path(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
  let mut path = app.path().app_data_dir().map_err(|error| error.to_string())?;
  path.push("state");
  fs::create_dir_all(&path).map_err(|error| io_error("failed to create app state directory", error))?;
  path.push(file_name);
  Ok(path)
}

fn read_json_or_default<T>(file_path: &Path, fallback: T) -> Result<T, String>
where
  T: for<'de> Deserialize<'de>
{
  match fs::read_to_string(file_path) {
    Ok(raw) => serde_json::from_str(&raw)
      .map_err(|error| format!("failed to parse JSON at {}: {error}", file_path.display())),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(fallback),
    Err(error) => Err(io_error(
      &format!("failed to read {}", file_path.display()),
      error
    ))
  }
}

fn write_json<T>(file_path: &Path, value: &T) -> Result<(), String>
where
  T: Serialize
{
  let serialized = serde_json::to_string_pretty(value).map_err(|error| {
    format!(
      "failed to serialize JSON for {}: {error}",
      file_path.display()
    )
  })?;

  if let Some(parent) = file_path.parent() {
    fs::create_dir_all(parent).map_err(|error| io_error("failed to create parent directory", error))?;
  }

  fs::write(file_path, serialized)
    .map_err(|error| io_error(&format!("failed to write {}", file_path.display()), error))
}

fn get_terminal_session(state: &State<'_, AppState>, session_id: &str) -> Result<TerminalSession, String> {
  let sessions = state
    .sessions
    .lock()
    .map_err(|_| lock_error("terminal sessions"))?;

  sessions
    .get(session_id)
    .cloned()
    .ok_or_else(|| format!("Terminal session \"{session_id}\" was not found."))
}

#[tauri::command]
fn terminal_create(
  app: AppHandle,
  state: State<'_, AppState>,
  request: TerminalCreateRequest
) -> Result<TerminalCreateResponse, String> {
  let session_id = Uuid::new_v4().to_string();
  let shell = request
    .shell
    .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| String::from("/bin/bash")));
  let args = request.args.unwrap_or_else(|| {
    if shell.ends_with("bash") {
      vec![String::from("--login")]
    } else {
      Vec::new()
    }
  });
  let cwd = request
    .cwd
    .as_deref()
    .map(resolve_path)
    .transpose()?
    .unwrap_or(std::env::current_dir().map_err(|error| io_error("failed to resolve cwd", error))?);

  let cols = request.cols.unwrap_or(120).max(1);
  let rows = request.rows.unwrap_or(40).max(1);

  let pty_system = native_pty_system();
  let pty_pair = pty_system
    .openpty(PtySize {
      rows,
      cols,
      pixel_width: 0,
      pixel_height: 0
    })
    .map_err(|error| format!("failed to open PTY: {error}"))?;

  let mut command = CommandBuilder::new(shell.clone());
  command.args(args);
  command.cwd(cwd);

  for (key, value) in std::env::vars() {
    command.env(key, value);
  }

  let master = pty_pair.master;
  let mut reader = master
    .try_clone_reader()
    .map_err(|error| format!("failed to clone PTY reader: {error}"))?;
  let writer = master
    .take_writer()
    .map_err(|error| format!("failed to take PTY writer: {error}"))?;
  let child = pty_pair
    .slave
    .spawn_command(command)
    .map_err(|error| format!("failed to spawn terminal process: {error}"))?;
  let pid = child.process_id().unwrap_or_default();

  let session = TerminalSession {
    master: Arc::new(Mutex::new(master)),
    writer: Arc::new(Mutex::new(writer)),
    child: Arc::new(Mutex::new(child))
  };

  {
    let mut sessions = state
      .sessions
      .lock()
      .map_err(|_| lock_error("terminal sessions"))?;
    sessions.insert(session_id.clone(), session);
  }

  let sessions_for_thread = state.sessions.clone();
  let app_for_thread = app.clone();
  let session_id_for_thread = session_id.clone();

  std::thread::spawn(move || {
    let mut buffer = [0_u8; 8192];
    let mut exit_code = 0_i32;

    loop {
      match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(bytes_read) => {
          let payload = TerminalOutputEvent {
            session_id: session_id_for_thread.clone(),
            data: String::from_utf8_lossy(&buffer[..bytes_read]).into_owned()
          };
          let _ = app_for_thread.emit(TERMINAL_OUTPUT_EVENT, payload);
        }
        Err(error) => {
          if error.kind() == ErrorKind::Interrupted {
            continue;
          }
          exit_code = -1;
          break;
        }
      }
    }

    if let Ok(mut sessions) = sessions_for_thread.lock() {
      sessions.remove(&session_id_for_thread);
    }

    let _ = app_for_thread.emit(
      TERMINAL_EXIT_EVENT,
      TerminalExitEvent {
        session_id: session_id_for_thread,
        exit_code,
        signal: None
      }
    );
  });

  Ok(TerminalCreateResponse { session_id, pid })
}

#[tauri::command]
fn terminal_write(state: State<'_, AppState>, request: TerminalWriteRequest) -> Result<(), String> {
  let session = get_terminal_session(&state, &request.session_id)?;
  let mut writer = session
    .writer
    .lock()
    .map_err(|_| lock_error("terminal writer"))?;

  writer
    .write_all(request.data.as_bytes())
    .map_err(|error| io_error("failed to write to PTY", error))?;
  writer
    .flush()
    .map_err(|error| io_error("failed to flush PTY writer", error))
}

#[tauri::command]
fn terminal_resize(state: State<'_, AppState>, request: TerminalResizeRequest) -> Result<(), String> {
  let session = get_terminal_session(&state, &request.session_id)?;
  let master = session
    .master
    .lock()
    .map_err(|_| lock_error("terminal master"))?;

  let cols = request.cols.max(1);
  let rows = request.rows.max(1);

  master
    .resize(PtySize {
      rows,
      cols,
      pixel_width: 0,
      pixel_height: 0
    })
    .map_err(|error| format!("failed to resize PTY: {error}"))
}

#[tauri::command]
fn terminal_kill(state: State<'_, AppState>, request: TerminalKillRequest) -> Result<(), String> {
  let _signal = request.signal;
  let session = {
    let mut sessions = state
      .sessions
      .lock()
      .map_err(|_| lock_error("terminal sessions"))?;
    sessions.remove(&request.session_id)
  }
  .ok_or_else(|| format!("Terminal session \"{}\" was not found.", request.session_id))?;

  let mut child = session
    .child
    .lock()
    .map_err(|_| lock_error("terminal child process"))?;

  child
    .kill()
    .map_err(|error| format!("failed to kill terminal process: {error}"))
}

#[tauri::command]
fn terminal_list(state: State<'_, AppState>) -> Result<Vec<String>, String> {
  let sessions = state
    .sessions
    .lock()
    .map_err(|_| lock_error("terminal sessions"))?;
  Ok(sessions.keys().cloned().collect())
}

#[tauri::command]
fn filesystem_list(request: FsListRequest) -> Result<Vec<FilesystemEntry>, String> {
  let target_path = resolve_path(&request.path)?;
  let entries = fs::read_dir(&target_path)
    .map_err(|error| io_error(&format!("failed to list {}", target_path.display()), error))?;

  let mut list: Vec<FilesystemEntry> = entries
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let entry_path = entry.path();
      let metadata = entry.metadata().ok()?;

      Some(FilesystemEntry {
        name: entry.file_name().to_string_lossy().into_owned(),
        path: entry_path.to_string_lossy().into_owned(),
        is_directory: metadata.is_dir(),
        size: metadata.len(),
        mtime_ms: modified_time_ms(&metadata)
      })
    })
    .collect();

  list.sort_by(|left, right| {
    if left.is_directory != right.is_directory {
      return right.is_directory.cmp(&left.is_directory);
    }

    left
      .name
      .to_ascii_lowercase()
      .cmp(&right.name.to_ascii_lowercase())
  });

  Ok(list)
}

#[tauri::command]
fn filesystem_read(request: FsReadRequest) -> Result<FsReadResponse, String> {
  let target_path = resolve_path(&request.path)?;
  let content = fs::read_to_string(&target_path)
    .map_err(|error| io_error(&format!("failed to read {}", target_path.display()), error))?;

  Ok(FsReadResponse {
    path: target_path.to_string_lossy().into_owned(),
    content
  })
}

#[tauri::command]
fn filesystem_write(request: FsWriteRequest) -> Result<FsReadResponse, String> {
  let target_path = resolve_path(&request.path)?;

  if let Some(parent) = target_path.parent() {
    fs::create_dir_all(parent).map_err(|error| io_error("failed to create parent directory", error))?;
  }

  fs::write(&target_path, &request.content)
    .map_err(|error| io_error(&format!("failed to write {}", target_path.display()), error))?;

  Ok(FsReadResponse {
    path: target_path.to_string_lossy().into_owned(),
    content: request.content
  })
}

#[tauri::command]
fn tasks_load(app: AppHandle) -> Result<TaskState, String> {
  let path = persistence_file_path(&app, TASKS_FILE_NAME)?;
  read_json_or_default(&path, default_task_state())
}

#[tauri::command]
fn tasks_save(app: AppHandle, mut state: TaskState) -> Result<TaskState, String> {
  state.updated_at = Utc::now().to_rfc3339();
  let path = persistence_file_path(&app, TASKS_FILE_NAME)?;
  write_json(&path, &state)?;
  Ok(state)
}

#[tauri::command]
fn workspace_load(app: AppHandle, startup_context: State<'_, StartupContext>) -> Result<WorkspaceState, String> {
  let path = persistence_file_path(&app, WORKSPACE_FILE_NAME)?;
  let mut state = read_json_or_default(&path, default_workspace_state())?;

  if let Some(startup_root) = startup_context.root_path.as_ref() {
    let mut next_recent_paths = vec![startup_root.clone()];
    for recent_path in &state.recent_paths {
      if recent_path != startup_root && !next_recent_paths.contains(recent_path) {
        next_recent_paths.push(recent_path.clone());
      }

      if next_recent_paths.len() >= 6 {
        break;
      }
    }

    let should_update = state.root_path.as_deref() != Some(startup_root)
      || state.recent_paths != next_recent_paths;

    if should_update {
      state.root_path = Some(startup_root.clone());
      state.recent_paths = next_recent_paths;
      state.updated_at = Utc::now().to_rfc3339();
      write_json(&path, &state)?;
    }
  }

  Ok(state)
}

#[tauri::command]
fn workspace_save(app: AppHandle, mut state: WorkspaceState) -> Result<WorkspaceState, String> {
  state.updated_at = Utc::now().to_rfc3339();
  let path = persistence_file_path(&app, WORKSPACE_FILE_NAME)?;
  write_json(&path, &state)?;
  Ok(state)
}

fn main() {
  if let Err(message) = ensure_linux_runtime() {
    eprintln!("{message}");
    std::process::exit(1);
  }

  let startup_root_path = match resolve_startup_root_from_args() {
    Ok(path) => path,
    Err(message) => {
      eprintln!("{message}");
      None
    }
  };

  tauri::Builder::default()
    .manage(AppState::default())
    .manage(StartupContext {
      root_path: startup_root_path
    })
    .invoke_handler(tauri::generate_handler![
      terminal_create,
      terminal_write,
      terminal_resize,
      terminal_kill,
      terminal_list,
      filesystem_list,
      filesystem_read,
      filesystem_write,
      tasks_load,
      tasks_save,
      workspace_load,
      workspace_save
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
