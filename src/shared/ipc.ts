export const IPC_CHANNELS = {
  terminalCreate: "terminal:create",
  terminalWrite: "terminal:write",
  terminalResize: "terminal:resize",
  terminalKill: "terminal:kill",
  terminalList: "terminal:list",
  terminalOutput: "terminal:output",
  terminalExit: "terminal:exit",
  fsList: "fs:list",
  fsRead: "fs:read",
  fsWrite: "fs:write",
  tasksLoad: "tasks:load",
  tasksSave: "tasks:save",
  workspaceLoad: "workspace:load",
  workspaceSave: "workspace:save"
} as const;

export const TAURI_COMMANDS = {
  terminalCreate: "terminal_create",
  terminalWrite: "terminal_write",
  terminalResize: "terminal_resize",
  terminalKill: "terminal_kill",
  terminalList: "terminal_list",
  fsList: "filesystem_list",
  fsRead: "filesystem_read",
  fsWrite: "filesystem_write",
  tasksLoad: "tasks_load",
  tasksSave: "tasks_save",
  workspaceLoad: "workspace_load",
  workspaceSave: "workspace_save"
} as const;

export type Unsubscribe = () => void;

export interface TerminalCreateRequest {
  cwd?: string;
  cols?: number;
  rows?: number;
  shell?: string;
  args?: string[];
}

export interface TerminalCreateResponse {
  sessionId: string;
  pid: number;
}

export interface TerminalWriteRequest {
  sessionId: string;
  data: string;
}

export interface TerminalResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalKillRequest {
  sessionId: string;
  signal?: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface FsListRequest {
  path: string;
}

export interface FilesystemEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

export interface FsReadRequest {
  path: string;
}

export interface FsReadResponse {
  path: string;
  content: string;
}

export interface FsWriteRequest {
  path: string;
  content: string;
}

export type KanbanLane = "todo" | "in-progress" | "in-review" | "complete";
export type KanbanPriority = "p1" | "p2" | "p3";

export interface TaskRecord {
  id: string;
  title: string;
  owner: string;
  lane: KanbanLane;
  tags: string[];
  priority: KanbanPriority;
}

export interface TaskState {
  tasks: TaskRecord[];
  updatedAt: string;
}

export interface WorkspaceState {
  rootPath: string | null;
  recentPaths: string[];
  updatedAt: string;
}

export interface OpenSpaceApi {
  terminal: {
    create: (request: TerminalCreateRequest) => Promise<TerminalCreateResponse>;
    write: (request: TerminalWriteRequest) => Promise<void>;
    resize: (request: TerminalResizeRequest) => Promise<void>;
    kill: (request: TerminalKillRequest) => Promise<void>;
    list: () => Promise<string[]>;
    onOutput: (listener: (event: TerminalOutputEvent) => void) => Unsubscribe;
    onExit: (listener: (event: TerminalExitEvent) => void) => Unsubscribe;
  };
  filesystem: {
    list: (request: FsListRequest) => Promise<FilesystemEntry[]>;
    read: (request: FsReadRequest) => Promise<FsReadResponse>;
    write: (request: FsWriteRequest) => Promise<FsReadResponse>;
  };
  tasks: {
    load: () => Promise<TaskState>;
    save: (state: TaskState) => Promise<TaskState>;
  };
  workspace: {
    load: () => Promise<WorkspaceState>;
    save: (state: WorkspaceState) => Promise<WorkspaceState>;
  };
}
