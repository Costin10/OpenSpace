export type WorkspaceHealth = "healthy" | "warning" | "error";

export interface WorkspaceTab {
  id: string;
  name: string;
  branch: string;
  health: WorkspaceHealth;
  changedFiles: number;
  rootPath?: string;
}

export type FileNodeKind = "folder" | "file";

export interface FileNode {
  id: string;
  name: string;
  kind: FileNodeKind;
  language?: string;
  path?: string;
  children?: FileNode[];
}

export interface EditorDocument {
  fileId: string;
  title: string;
  language: string;
  content: string;
  updatedAt: string;
  path?: string;
}

export type TerminalStatus = "idle" | "running" | "success" | "error";

export interface TerminalPane {
  id: string;
  label: string;
  command: string;
  status: TerminalStatus;
  outputPreview: string;
  sessionId?: string;
}

export interface CommandTimelineEvent {
  id: string;
  title: string;
  detail: string;
  command: string;
  timestamp: string;
  status: TerminalStatus;
}

export type KanbanLane = "todo" | "in-progress" | "in-review" | "complete";
export type KanbanPriority = "p1" | "p2" | "p3";

export interface KanbanCard {
  id: string;
  title: string;
  owner: string;
  lane: KanbanLane;
  tags: string[];
  priority: KanbanPriority;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  description: string;
  vars: Record<string, string>;
}

export interface TemplateDescriptor {
  id: string;
  name: string;
  description: string;
  defaultPanes: number;
  suggestedThemeId: string;
  categories: string[];
}
