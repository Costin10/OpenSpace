import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  IPC_CHANNELS,
  TAURI_COMMANDS,
  type FsListRequest,
  type FsReadRequest,
  type FsWriteRequest,
  type OpenSpaceApi,
  type TaskState,
  type TerminalCreateRequest,
  type TerminalExitEvent,
  type TerminalKillRequest,
  type TerminalOutputEvent,
  type TerminalResizeRequest,
  type TerminalWriteRequest,
  type Unsubscribe,
  type WorkspaceState
} from "@shared/ipc";

const hasTauriRuntime = (): boolean =>
  typeof window !== "undefined" &&
  (Object.prototype.hasOwnProperty.call(window, "__TAURI_INTERNALS__") ||
    Object.prototype.hasOwnProperty.call(window, "__TAURI__"));

const invokeCommand = <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  if (payload) {
    return invoke<T>(command, payload);
  }
  return invoke<T>(command);
};

const subscribe = <T>(eventName: string, listener: (payload: T) => void): Unsubscribe => {
  let unsubscribed = false;
  let unlisten: Unsubscribe | null = null;

  void listen<T>(eventName, (event) => {
    listener(event.payload);
  })
    .then((dispose) => {
      if (unsubscribed) {
        dispose();
        return;
      }
      unlisten = dispose;
    })
    .catch((error) => {
      console.error(`[openspace tauri bridge] failed to subscribe to ${eventName}`, error);
    });

  return () => {
    unsubscribed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
};

const installOpenSpaceBridge = (): void => {
  if (typeof window === "undefined" || window.openspace || !hasTauriRuntime()) {
    return;
  }

  const api: OpenSpaceApi = {
    terminal: {
      create: (request: TerminalCreateRequest) =>
        invokeCommand(TAURI_COMMANDS.terminalCreate, {
          request
        }),
      write: (request: TerminalWriteRequest) =>
        invokeCommand<void>(TAURI_COMMANDS.terminalWrite, {
          request
        }),
      resize: (request: TerminalResizeRequest) =>
        invokeCommand<void>(TAURI_COMMANDS.terminalResize, {
          request
        }),
      kill: (request: TerminalKillRequest) =>
        invokeCommand<void>(TAURI_COMMANDS.terminalKill, {
          request
        }),
      list: () => invokeCommand<string[]>(TAURI_COMMANDS.terminalList),
      onOutput: (listener: (event: TerminalOutputEvent) => void) =>
        subscribe<TerminalOutputEvent>(IPC_CHANNELS.terminalOutput, listener),
      onExit: (listener: (event: TerminalExitEvent) => void) =>
        subscribe<TerminalExitEvent>(IPC_CHANNELS.terminalExit, listener)
    },
    filesystem: {
      list: (request: FsListRequest) =>
        invokeCommand(TAURI_COMMANDS.fsList, {
          request
        }),
      read: (request: FsReadRequest) =>
        invokeCommand(TAURI_COMMANDS.fsRead, {
          request
        }),
      write: (request: FsWriteRequest) =>
        invokeCommand(TAURI_COMMANDS.fsWrite, {
          request
        })
    },
    tasks: {
      load: () => invokeCommand(TAURI_COMMANDS.tasksLoad),
      save: (state: TaskState) =>
        invokeCommand(TAURI_COMMANDS.tasksSave, {
          state
        })
    },
    workspace: {
      load: () => invokeCommand(TAURI_COMMANDS.workspaceLoad),
      save: (state: WorkspaceState) =>
        invokeCommand(TAURI_COMMANDS.workspaceSave, {
          state
        })
    }
  };

  window.openspace = api;
};

installOpenSpaceBridge();
