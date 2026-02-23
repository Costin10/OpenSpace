import type {
  FilesystemEntry,
  FsReadResponse,
  TaskRecord,
  TaskState,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalExitEvent,
  TerminalKillRequest,
  TerminalOutputEvent,
  TerminalResizeRequest,
  TerminalWriteRequest,
  WorkspaceState
} from "@shared/ipc";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { open as tauriDialogOpen } from "@tauri-apps/plugin-dialog";
import type { KanbanCard } from "../types/ui";

type InvokeArgs = Record<string, unknown> | undefined;
type InvokeFn = <T>(command: string, args?: InvokeArgs) => Promise<T>;
type UnlistenFn = () => void;
type ListenEvent<T> = {
  event: string;
  id: number;
  payload: T;
};
type ListenFn = <T>(event: string, handler: (event: ListenEvent<T>) => void) => Promise<UnlistenFn>;
type TerminalOutputListener = (payload: TerminalOutputEvent) => void;
type TerminalExitListener = (payload: TerminalExitEvent) => void;

/**
 * Expected Tauri backend contract (primary command names listed first):
 * - `workspace_load`, `workspace_save`
 * - `tasks_load`, `tasks_save`
 * - `filesystem_list`, `filesystem_read`, `filesystem_write`
 * - `terminal_create`, `terminal_write`, `terminal_resize`, `terminal_kill`, `terminal_list`
 * - events: `terminal:output`, `terminal:exit`
 *
 * Alias command/event names keep migration compatibility while backends converge.
 */
const TAURI_COMMANDS = {
  workspaceLoad: ["workspace_load", "workspace:load"],
  workspaceSave: ["workspace_save", "workspace:save"],
  tasksLoad: ["tasks_load", "tasks:load"],
  tasksSave: ["tasks_save", "tasks:save"],
  filesystemList: ["filesystem_list", "fs:list"],
  filesystemRead: ["filesystem_read", "fs:read"],
  filesystemWrite: ["filesystem_write", "fs:write"],
  terminalCreate: ["terminal_create", "terminal:create"],
  terminalWrite: ["terminal_write", "terminal:write"],
  terminalResize: ["terminal_resize", "terminal:resize"],
  terminalKill: ["terminal_kill", "terminal:kill"],
  terminalList: ["terminal_list", "terminal:list"]
} as const;

const TAURI_EVENTS = {
  terminalOutput: ["terminal:output", "terminal-output", "terminal_output"],
  terminalExit: ["terminal:exit", "terminal-exit", "terminal_exit"]
} as const;

const placeholderLog = (action: string, payload?: unknown): void => {
  console.info(`[openspace renderer placeholder] ${action}`, payload);
};

const defaultWorkspaceState = (): WorkspaceState => ({
  rootPath: null,
  recentPaths: [],
  updatedAt: new Date().toISOString()
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCardShape = (value: TaskRecord): value is KanbanCard => {
  if (!isObject(value)) {
    return false;
  }

  const lane = value.lane;
  const priority = value.priority;
  const tags = value.tags;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.owner === "string" &&
    (lane === "todo" || lane === "in-progress" || lane === "in-review" || lane === "complete") &&
    (priority === "p1" || priority === "p2" || priority === "p3") &&
    Array.isArray(tags) &&
    tags.every((tag) => typeof tag === "string")
  );
};

const toTaskRecord = (card: KanbanCard): TaskRecord => ({
  id: card.id,
  title: card.title,
  owner: card.owner,
  lane: card.lane,
  tags: card.tags,
  priority: card.priority
});

const hasTauriRuntime = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  const runtime = window as Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return typeof runtime.__TAURI_INTERNALS__ !== "undefined" || typeof runtime.__TAURI__ !== "undefined";
};

let invokePromise: Promise<InvokeFn | null> | null = null;
let listenPromise: Promise<ListenFn | null> | null = null;

const loadInvoke = async (): Promise<InvokeFn | null> => {
  if (!hasTauriRuntime()) {
    return null;
  }
  return tauriInvoke as unknown as InvokeFn;
};

const loadListen = async (): Promise<ListenFn | null> => {
  if (!hasTauriRuntime()) {
    return null;
  }
  return tauriListen as unknown as ListenFn;
};

const invokeCommand = async <T>(command: string, args?: InvokeArgs): Promise<T> => {
  const invoke = await loadInvoke();
  if (!invoke) {
    throw new Error("Tauri invoke unavailable");
  }
  return invoke<T>(command, args);
};

const invokeWithFallbacks = async <T>(
  action: string,
  commands: readonly string[],
  argsVariants: readonly InvokeArgs[]
): Promise<T> => {
  let lastError: unknown;

  for (const command of commands) {
    for (const args of argsVariants) {
      try {
        return await invokeCommand<T>(command, args);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError ?? new Error(`${action} failed`);
};

const toRecord = (value: object): Record<string, unknown> => value as Record<string, unknown>;

const terminalOutputBySession = new Map<string, string>();
const terminalOutputListeners = new Set<TerminalOutputListener>();
const terminalExitListeners = new Set<TerminalExitListener>();
let terminalEventUnlisteners: UnlistenFn[] = [];
let terminalEventsReady = false;
let terminalEventsSetupPromise: Promise<void> | null = null;

const replaceTerminalEventUnlisteners = (nextUnlisteners: UnlistenFn[]): void => {
  for (const unlisten of terminalEventUnlisteners) {
    try {
      unlisten();
    } catch (error) {
      console.warn("terminal event unlisten failed", error);
    }
  }
  terminalEventUnlisteners = nextUnlisteners;
};

const appendTerminalOutput = (payload: TerminalOutputEvent): void => {
  const current = terminalOutputBySession.get(payload.sessionId) ?? "";
  const combined = `${current}${payload.data}`;
  terminalOutputBySession.set(payload.sessionId, combined.slice(-8000));
  for (const listener of terminalOutputListeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error("terminal output listener failed", error);
    }
  }
};

const handleTerminalExit = (payload: TerminalExitEvent): void => {
  terminalOutputBySession.delete(payload.sessionId);
  for (const listener of terminalExitListeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error("terminal exit listener failed", error);
    }
  }
};

const ensureTerminalEvents = async (): Promise<void> => {
  if (!hasTauriRuntime() || terminalEventsReady) {
    return;
  }

  if (terminalEventsSetupPromise) {
    await terminalEventsSetupPromise;
    return;
  }

  terminalEventsSetupPromise = (async () => {
    const listen = await loadListen();
    if (!listen) {
      return;
    }

    try {
      const outputUnlisteners = await Promise.all(
        TAURI_EVENTS.terminalOutput.map((eventName) =>
          listen<TerminalOutputEvent>(eventName, (event) => {
            appendTerminalOutput(event.payload);
          })
        )
      );
      const exitUnlisteners = await Promise.all(
        TAURI_EVENTS.terminalExit.map((eventName) =>
          listen<TerminalExitEvent>(eventName, (event) => {
            handleTerminalExit(event.payload);
          })
        )
      );
      replaceTerminalEventUnlisteners([...outputUnlisteners, ...exitUnlisteners]);
      terminalEventsReady = true;
    } catch (error) {
      console.error("Unable to subscribe to terminal events", error);
    }
  })().finally(() => {
    terminalEventsSetupPromise = null;
  });

  await terminalEventsSetupPromise;
};

const readTasksFromState = (state: TaskState): KanbanCard[] =>
  state.tasks.filter(isCardShape).map((task) => ({
    id: task.id,
    title: task.title,
    owner: task.owner,
    lane: task.lane,
    tags: task.tags,
    priority: task.priority
  }));

export interface RendererBridge {
  hasBackend: () => boolean;
  pickFolder: () => Promise<string | null>;
  loadWorkspaceState: () => Promise<WorkspaceState>;
  saveWorkspaceState: (state: WorkspaceState) => Promise<WorkspaceState>;
  loadKanbanCards: () => Promise<KanbanCard[]>;
  persistKanbanCards: (cards: KanbanCard[]) => Promise<void>;
  listFiles: (path: string) => Promise<FilesystemEntry[]>;
  readFile: (path: string) => Promise<FsReadResponse | null>;
  writeFile: (path: string, content: string) => Promise<void>;
  createTerminal: (request?: TerminalCreateRequest) => Promise<string>;
  writeTerminal: (sessionId: string, data: string) => Promise<void>;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
  killTerminal: (sessionId: string, signal?: string) => Promise<void>;
  listTerminalSessions: () => Promise<string[]>;
  onTerminalOutput: (listener: TerminalOutputListener) => Promise<UnlistenFn>;
  onTerminalExit: (listener: TerminalExitListener) => Promise<UnlistenFn>;
  runCommand: (command: string, cwd?: string) => Promise<string>;
}

export const rendererBridge: RendererBridge = {
  hasBackend: hasTauriRuntime,

  pickFolder: async () => {
    if (!hasTauriRuntime()) {
      placeholderLog("dialog.pickFolder");
      return null;
    }

    try {
      const result = await tauriDialogOpen({
        directory: true,
        multiple: false,
        title: "Select workspace folder"
      });

      return typeof result === "string" ? result : null;
    } catch (error) {
      console.error("pickFolder failed", error);
      return null;
    }
  },

  loadWorkspaceState: async () => {
    if (!hasTauriRuntime()) {
      placeholderLog("workspace.load");
      return defaultWorkspaceState();
    }

    try {
      return await invokeWithFallbacks<WorkspaceState>("workspace.load", TAURI_COMMANDS.workspaceLoad, [undefined]);
    } catch (error) {
      console.error("workspace.load failed", error);
      return defaultWorkspaceState();
    }
  },

  saveWorkspaceState: async (state) => {
    if (!hasTauriRuntime()) {
      placeholderLog("workspace.save", state);
      return state;
    }

    try {
      return await invokeWithFallbacks<WorkspaceState>("workspace.save", TAURI_COMMANDS.workspaceSave, [
        { state },
        toRecord(state)
      ]);
    } catch (error) {
      console.error("workspace.save failed", error);
      return state;
    }
  },

  loadKanbanCards: async () => {
    if (!hasTauriRuntime()) {
      placeholderLog("tasks.load");
      return [];
    }

    try {
      const state = await invokeWithFallbacks<TaskState>("tasks.load", TAURI_COMMANDS.tasksLoad, [undefined]);
      return readTasksFromState(state);
    } catch (error) {
      console.error("tasks.load failed", error);
      return [];
    }
  },

  persistKanbanCards: async (cards) => {
    const payload: TaskState = {
      tasks: cards.map(toTaskRecord),
      updatedAt: new Date().toISOString()
    };

    if (!hasTauriRuntime()) {
      placeholderLog("tasks.save", payload);
      return;
    }

    try {
      await invokeWithFallbacks<TaskState>("tasks.save", TAURI_COMMANDS.tasksSave, [
        { state: payload },
        toRecord(payload)
      ]);
    } catch (error) {
      console.error("tasks.save failed", error);
    }
  },

  listFiles: async (path) => {
    if (!hasTauriRuntime()) {
      placeholderLog("filesystem.list", { path });
      return [];
    }

    try {
      const request = { path };
      return await invokeWithFallbacks<FilesystemEntry[]>("filesystem.list", TAURI_COMMANDS.filesystemList, [
        { request },
        request
      ]);
    } catch (error) {
      console.error("filesystem.list failed", error);
      return [];
    }
  },

  readFile: async (path) => {
    if (!hasTauriRuntime()) {
      placeholderLog("filesystem.read", { path });
      return null;
    }

    try {
      const request = { path };
      return await invokeWithFallbacks<FsReadResponse>("filesystem.read", TAURI_COMMANDS.filesystemRead, [
        { request },
        request
      ]);
    } catch (error) {
      console.error("filesystem.read failed", error);
      return null;
    }
  },

  writeFile: async (path, content) => {
    if (!hasTauriRuntime()) {
      placeholderLog("filesystem.write", { path, bytes: content.length });
      return;
    }

    try {
      const request = { path, content };
      await invokeWithFallbacks<FsReadResponse>("filesystem.write", TAURI_COMMANDS.filesystemWrite, [
        { request },
        request
      ]);
    } catch (error) {
      console.error("filesystem.write failed", error);
    }
  },

  createTerminal: async (request = {}) => {
    const normalizedRequest: TerminalCreateRequest = {
      cwd: request.cwd,
      cols: request.cols ?? 120,
      rows: request.rows ?? 34,
      shell: request.shell,
      args: request.args
    };

    if (!hasTauriRuntime()) {
      placeholderLog("terminal.create", normalizedRequest);
      return `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    try {
      await ensureTerminalEvents();
      const created = await invokeWithFallbacks<TerminalCreateResponse>("terminal.create", TAURI_COMMANDS.terminalCreate, [
        { request: normalizedRequest },
        toRecord(normalizedRequest)
      ]);
      terminalOutputBySession.set(created.sessionId, "");
      return created.sessionId;
    } catch (error) {
      console.error("terminal.create failed", error);
      throw error;
    }
  },

  writeTerminal: async (sessionId, data) => {
    if (!sessionId) {
      return;
    }

    if (!hasTauriRuntime()) {
      placeholderLog("terminal.write", { sessionId, bytes: data.length });
      appendTerminalOutput({ sessionId, data });
      return;
    }

    try {
      const request: TerminalWriteRequest = {
        sessionId,
        data
      };
      await invokeWithFallbacks<void>("terminal.write", TAURI_COMMANDS.terminalWrite, [{ request }, toRecord(request)]);
    } catch (error) {
      console.error("terminal.write failed", error);
      throw error;
    }
  },

  resizeTerminal: async (sessionId, cols, rows) => {
    if (!sessionId) {
      return;
    }

    const request: TerminalResizeRequest = {
      sessionId,
      cols,
      rows
    };

    if (!hasTauriRuntime()) {
      placeholderLog("terminal.resize", request);
      return;
    }

    try {
      await invokeWithFallbacks<void>("terminal.resize", TAURI_COMMANDS.terminalResize, [{ request }, toRecord(request)]);
    } catch (error) {
      console.error("terminal.resize failed", error);
      throw error;
    }
  },

  killTerminal: async (sessionId, signal) => {
    if (!sessionId) {
      return;
    }

    const request: TerminalKillRequest = {
      sessionId,
      signal
    };

    if (!hasTauriRuntime()) {
      placeholderLog("terminal.kill", request);
      terminalOutputBySession.delete(sessionId);
      return;
    }

    try {
      await invokeWithFallbacks<void>("terminal.kill", TAURI_COMMANDS.terminalKill, [{ request }, toRecord(request)]);
      terminalOutputBySession.delete(sessionId);
    } catch (error) {
      console.error("terminal.kill failed", error);
      throw error;
    }
  },

  listTerminalSessions: async () => {
    if (!hasTauriRuntime()) {
      placeholderLog("terminal.list");
      return Array.from(terminalOutputBySession.keys());
    }

    try {
      return await invokeWithFallbacks<string[]>("terminal.list", TAURI_COMMANDS.terminalList, [undefined]);
    } catch (error) {
      console.error("terminal.list failed", error);
      return [];
    }
  },

  onTerminalOutput: async (listener) => {
    terminalOutputListeners.add(listener);
    if (hasTauriRuntime()) {
      await ensureTerminalEvents();
    }
    return () => {
      terminalOutputListeners.delete(listener);
    };
  },

  onTerminalExit: async (listener) => {
    terminalExitListeners.add(listener);
    if (hasTauriRuntime()) {
      await ensureTerminalEvents();
    }
    return () => {
      terminalExitListeners.delete(listener);
    };
  },

  runCommand: async (command, cwd) => {
    try {
      const sessionId = await rendererBridge.createTerminal({
        cwd,
        cols: 120,
        rows: 34
      });
      await rendererBridge.writeTerminal(sessionId, `${command}\n`);
      return sessionId;
    } catch (error) {
      console.error("terminal.create/write failed", error);
      throw error;
    }
  }
};
