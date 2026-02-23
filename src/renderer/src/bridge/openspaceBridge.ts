import type {
  FilesystemEntry,
  FsReadResponse,
  TaskRecord,
  TaskState,
  TerminalCreateResponse,
  TerminalExitEvent,
  TerminalOutputEvent,
  WorkspaceState
} from "@shared/ipc";
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

const TAURI_MODULES = {
  core: "@tauri-apps/api/core",
  event: "@tauri-apps/api/event"
} as const;

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

  if (!invokePromise) {
    invokePromise = (async () => {
      try {
        const coreApi = (await import(
          /* @vite-ignore */ TAURI_MODULES.core
        )) as { invoke?: InvokeFn };
        if (typeof coreApi.invoke !== "function") {
          console.error("Tauri core API loaded without invoke()");
          return null;
        }
        return coreApi.invoke;
      } catch (error) {
        console.error("Unable to load @tauri-apps/api/core", error);
        return null;
      }
    })();
  }

  return invokePromise;
};

const loadListen = async (): Promise<ListenFn | null> => {
  if (!hasTauriRuntime()) {
    return null;
  }

  if (!listenPromise) {
    listenPromise = (async () => {
      try {
        const eventApi = (await import(
          /* @vite-ignore */ TAURI_MODULES.event
        )) as { listen?: ListenFn };
        if (typeof eventApi.listen !== "function") {
          console.error("Tauri event API loaded without listen()");
          return null;
        }
        return eventApi.listen;
      } catch (error) {
        console.error("Unable to load @tauri-apps/api/event", error);
        return null;
      }
    })();
  }

  return listenPromise;
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
};

const handleTerminalExit = (payload: TerminalExitEvent): void => {
  terminalOutputBySession.delete(payload.sessionId);
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
  loadWorkspaceState: () => Promise<WorkspaceState>;
  saveWorkspaceState: (state: WorkspaceState) => Promise<WorkspaceState>;
  loadKanbanCards: () => Promise<KanbanCard[]>;
  persistKanbanCards: (cards: KanbanCard[]) => Promise<void>;
  listFiles: (path: string) => Promise<FilesystemEntry[]>;
  readFile: (path: string) => Promise<FsReadResponse | null>;
  writeFile: (path: string, content: string) => Promise<void>;
  runCommand: (command: string, cwd?: string) => Promise<string>;
}

export const rendererBridge: RendererBridge = {
  hasBackend: hasTauriRuntime,

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

  runCommand: async (command, cwd) => {
    if (!hasTauriRuntime()) {
      placeholderLog("terminal.create/write", { command, cwd });
      return `mock-${Date.now()}`;
    }

    try {
      await ensureTerminalEvents();

      const createRequest = {
        cwd,
        cols: 120,
        rows: 34
      };
      const created = await invokeWithFallbacks<TerminalCreateResponse>("terminal.create", TAURI_COMMANDS.terminalCreate, [
        { request: createRequest },
        toRecord(createRequest)
      ]);

      terminalOutputBySession.set(created.sessionId, "");

      const writeRequest = {
        sessionId: created.sessionId,
        data: `${command}\n`
      };
      await invokeWithFallbacks<void>("terminal.write", TAURI_COMMANDS.terminalWrite, [
        { request: writeRequest },
        toRecord(writeRequest)
      ]);
      return created.sessionId;
    } catch (error) {
      console.error("terminal.create/write failed", error);
      throw error;
    }
  }
};
