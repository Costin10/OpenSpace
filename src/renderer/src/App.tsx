import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import type { WorkspaceState } from "@shared/ipc";
import { Compartment, EditorState } from "@codemirror/state";
import { css as cssLanguage } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { basicSetup } from "codemirror";
import type { IDisposable, ITerminalOptions } from "@xterm/xterm";
import { rendererBridge } from "./bridge/openspaceBridge";
import {
  DOCUMENTS,
  FILE_TREE,
  KANBAN_CARDS,
  LANE_LABELS,
  LANE_ORDER,
  TEMPLATES,
  TERMINAL_PANES,
  THEMES,
  WORKSPACE_TABS
} from "./data/mockData";
import type {
  CommandTimelineEvent,
  EditorDocument,
  FileNode,
  KanbanCard,
  KanbanLane,
  TerminalPane,
  TerminalStatus,
  TemplateDescriptor,
  ThemeDefinition,
  WorkspaceHealth,
  WorkspaceTab
} from "./types/ui";
import "@xterm/xterm/css/xterm.css";

const MAX_TERMINAL_PANES = 16;

type SettingsTab = "appearance" | "shortcuts" | "account" | "api-keys";

const SHORTCUT_SECTIONS = [
  {
    id: "workspaces",
    label: "Workspaces",
    icon: "⚙",
    shortcuts: [
      { action: "New workspace tab", keys: ["Ctrl", "T"] },
      { action: "Close workspace", keys: ["Ctrl", "Shift", "W"] },
      { action: "Next workspace", keys: ["Ctrl", "Shift", "]"] },
      { action: "Previous workspace", keys: ["Ctrl", "Shift", "["] }
    ]
  },
  {
    id: "panes",
    label: "Panes",
    icon: "⊞",
    shortcuts: [
      { action: "New session", keys: ["Ctrl", "N"] },
      { action: "Split horizontal", keys: ["Ctrl", "D"] },
      { action: "Split vertical", keys: ["Ctrl", "Shift", "D"] },
      { action: "Close active pane", keys: ["Ctrl", "W"] },
      { action: "Next pane", keys: ["Ctrl", "]"] },
      { action: "Previous pane", keys: ["Ctrl", "["] }
    ]
  },
  {
    id: "ai",
    label: "AI Features",
    icon: "⚡",
    shortcuts: [
      { action: "AI assistance", keys: ["Ctrl", "K"] }
    ]
  }
];

const SETTINGS_NAV: { id: SettingsTab; label: string; subtitle: string; icon: string }[] = [
  { id: "appearance", label: "Appearance", subtitle: "Theme and display", icon: "◐" },
  { id: "shortcuts", label: "Shortcuts", subtitle: "Keyboard bindings", icon: "⌨" },
  { id: "account", label: "Account", subtitle: "Profile and billing", icon: "⚿" },
  { id: "api-keys", label: "API Keys", subtitle: "Create and manage keys", icon: "⚷" }
];

const PRIORITY_LABELS: Record<KanbanCard["priority"], string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3"
};

const HEALTH_LABELS: Record<WorkspaceHealth, string> = {
  healthy: "Healthy",
  warning: "Needs attention",
  error: "Blocked"
};

const defaultWorkspaceState = (): WorkspaceState => ({
  rootPath: null,
  recentPaths: [],
  updatedAt: new Date().toISOString()
});

const buildTimestamp = (): string =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const inferLanguage = (name: string): string => {
  const extension = name.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "js":
      return "js";
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "css":
      return "css";
    case "md":
      return "markdown";
    default:
      return "text";
  }
};

const codeMirrorLanguageExtension = (language: string) => {
  switch (language) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
      return json();
    case "css":
      return cssLanguage();
    case "markdown":
      return markdown();
    default:
      return [];
  }
};

const terminalTheme = {
  background: "#0b1320",
  foreground: "#dbefff",
  cursor: "#00d8ff",
  selectionBackground: "rgba(0, 216, 255, 0.2)",
  black: "#09111c",
  blue: "#3d8bff",
  brightBlue: "#68b2ff",
  brightBlack: "#31506d",
  brightCyan: "#63eeff",
  brightGreen: "#48f2b1",
  brightMagenta: "#cf9eff",
  brightRed: "#ff849e",
  brightWhite: "#f6fbff",
  brightYellow: "#ffd887",
  cyan: "#2ac8d8",
  green: "#13d688",
  magenta: "#a178ff",
  red: "#ff5c81",
  white: "#cce7ff",
  yellow: "#f4bf55"
} satisfies ITerminalOptions["theme"];

const createTimelineEvent = (
  title: string,
  detail: string,
  command: string,
  status: TerminalStatus
): CommandTimelineEvent => ({
  id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  title,
  detail,
  command,
  timestamp: buildTimestamp(),
  status
});

const terminalColumnsFor = (count: number): number => {
  if (count <= 1) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 9) {
    return 3;
  }
  return 4;
};

const nextLaneFor = (lane: KanbanLane): KanbanLane => {
  const index = LANE_ORDER.indexOf(lane);
  return index >= 0 && index < LANE_ORDER.length - 1 ? LANE_ORDER[index + 1] : lane;
};

const slugFromPath = (path: string): string =>
  path
    .split("/")
    .filter(Boolean)
    .join("-")
    .toLowerCase();

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const tabsFromWorkspaceState = (state: WorkspaceState): WorkspaceTab[] => {
  const sources = state.recentPaths.length > 0 ? state.recentPaths : state.rootPath ? [state.rootPath] : [];
  if (sources.length === 0) {
    return [];
  }

  return sources.slice(0, 4).map((path, index) => {
    const name = path.split("/").filter(Boolean).pop() ?? `workspace-${index + 1}`;
    return {
      id: `ws-${slugFromPath(path) || index}`,
      name,
      branch: index === 0 ? "active" : "main",
      health: index % 3 === 0 ? "healthy" : index % 3 === 1 ? "warning" : "error",
      changedFiles: Math.max(0, 8 - index * 2),
      rootPath: path
    };
  });
};

const mapFsEntriesToTree = (rootPath: string, entries: { name: string; path: string; isDirectory: boolean }[]): FileNode[] => [
  {
    id: `folder-${slugFromPath(rootPath) || "workspace"}`,
    name: rootPath.split("/").filter(Boolean).pop() ?? rootPath,
    kind: "folder",
    path: rootPath,
    children: entries.slice(0, 220).map((entry) => ({
      id: `${entry.isDirectory ? "folder" : "file"}-${slugFromPath(entry.path)}`,
      name: entry.name,
      kind: entry.isDirectory ? "folder" : "file",
      language: entry.isDirectory ? undefined : inferLanguage(entry.name),
      path: entry.path
    }))
  }
];

const findNodeById = (nodes: FileNode[], targetId: string): FileNode | undefined => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children?.length) {
      const nested = findNodeById(node.children, targetId);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
};

interface TerminalRuntime {
  dataSubscription: IDisposable;
  fitAddon: FitAddon;
  hostElement: HTMLDivElement;
  resizeFrame: number | null;
  resizeObserver: ResizeObserver;
  terminal: Terminal;
  webglAddon: WebglAddon | null;
}

interface PanelHeaderProps {
  title: string;
  subtitle: string;
}

const PanelHeader = ({ title, subtitle }: PanelHeaderProps): JSX.Element => (
  <header className="panel-heading">
    <h2>{title}</h2>
    <p>{subtitle}</p>
  </header>
);

interface FileTreeProps {
  nodes: FileNode[];
  selectedFileId: string;
  onSelectFile: (node: FileNode) => void;
}

const FileTree = ({ nodes, selectedFileId, onSelectFile }: FileTreeProps): JSX.Element => (
  <ul className="file-tree-list">
    {nodes.map((node) => (
      <FileTreeNode
        key={node.id}
        depth={0}
        node={node}
        onSelectFile={onSelectFile}
        selectedFileId={selectedFileId}
      />
    ))}
  </ul>
);

interface FileTreeNodeProps {
  depth: number;
  node: FileNode;
  selectedFileId: string;
  onSelectFile: (node: FileNode) => void;
}

const FileTreeNode = ({ depth, node, selectedFileId, onSelectFile }: FileTreeNodeProps): JSX.Element => {
  const isFile = node.kind === "file";
  const isSelected = selectedFileId === node.id;

  return (
    <li>
      <button
        className={`tree-node ${isFile ? "tree-file" : "tree-folder"} ${isSelected ? "selected" : ""}`}
        onClick={() => {
          if (isFile) {
            onSelectFile(node);
          }
        }}
        style={{ paddingLeft: `${0.75 + depth * 0.9}rem` }}
        title={node.path}
        type="button"
      >
        <span aria-hidden className="tree-glyph">
          {isFile ? "<>" : "v"}
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.kind === "folder" && node.children?.length ? (
        <ul className="file-tree-list nested">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              depth={depth + 1}
              node={child}
              onSelectFile={onSelectFile}
              selectedFileId={selectedFileId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

interface TemplatePickerModalProps {
  templates: TemplateDescriptor[];
  themeMap: Record<string, string>;
  defaultDirectory: string;
  onApply: (template: TemplateDescriptor, directoryPath: string) => void;
  onClose: () => void;
}

const TemplatePickerModal = ({
  templates,
  themeMap,
  defaultDirectory,
  onApply,
  onClose
}: TemplatePickerModalProps): JSX.Element => {
  const sortedTemplates = [...templates].sort((left, right) => left.defaultPanes - right.defaultPanes);
  const [selectedTemplateId, setSelectedTemplateId] = useState(sortedTemplates[0]?.id ?? "");
  const [directoryPath, setDirectoryPath] = useState(defaultDirectory || "~");
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(["Claude", "Codex", "Gemini", "Cursor", "OpenCode"].map((a) => [a, 0]))
  );

  const selectedTemplate =
    sortedTemplates.find((template) => template.id === selectedTemplateId) ?? sortedTemplates[0] ?? templates[0];

  const adjustAgent = (agent: string, delta: number): void => {
    setAgentCounts((prev) => ({
      ...prev,
      [agent]: Math.max(0, Math.min(5, (prev[agent] ?? 0) + delta))
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <section
        aria-modal
        className="template-modal new-workspace-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <h3>New Workspace</h3>
          <button className="text-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="modal-section">
          <span className="section-label">Layout</span>
          <div className="layout-picker-grid">
            {sortedTemplates.map((template) => (
              <button
                className={`layout-tile ${selectedTemplate?.id === template.id ? "selected" : ""}`}
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                type="button"
              >
                <span className="layout-icon">▦</span>
                <span>{template.defaultPanes}</span>
              </button>
            ))}
          </div>
          <p className="modal-hint">
            {selectedTemplate?.defaultPanes ?? 1} panes | {themeMap[selectedTemplate?.suggestedThemeId ?? ""] ?? selectedTemplate?.suggestedThemeId}
          </p>
        </div>

        <div className="modal-section">
          <span className="section-label">Directory</span>
          <div className="directory-row">
            <input
              className="directory-input"
              onChange={(event) => setDirectoryPath(event.target.value)}
              placeholder="/home/user/project"
              type="text"
              value={directoryPath}
            />
          </div>
        </div>

        <div className="modal-section agents-list">
          <div className="agents-header">
            <span className="section-label">AI Agents</span>
            <span className="collapse-text">collapse</span>
          </div>
          {["Claude", "Codex", "Gemini", "Cursor", "OpenCode"].map((agent) => (
            <div className="agent-row" key={agent}>
              <span>{agent}</span>
              <span className="agent-controls">
                <button className="agent-btn" onClick={() => adjustAgent(agent, -1)} type="button">−</button>
                <span>{agentCounts[agent] ?? 0}</span>
                <button className="agent-btn" onClick={() => adjustAgent(agent, 1)} type="button">+</button>
              </span>
            </div>
          ))}
        </div>

        <footer className="modal-footer">
          <button className="text-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="solid-button"
            onClick={() => selectedTemplate && onApply(selectedTemplate, directoryPath)}
            type="button"
          >
            Create
          </button>
        </footer>
      </section>
    </div>
  );
};

interface SettingsViewProps {
  activeThemeId: string;
  themes: ThemeDefinition[];
  onThemeChange: (themeId: string) => void;
}

const SettingsView = ({ activeThemeId, themes, onThemeChange }: SettingsViewProps): JSX.Element => {
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const darkThemes = useMemo(() => themes.filter((t) => t.kind === "dark"), [themes]);
  const lightThemes = useMemo(() => themes.filter((t) => t.kind === "light"), [themes]);

  const renderThemeCard = (theme: ThemeDefinition): JSX.Element => (
    <button
      className={`theme-card ${activeThemeId === theme.id ? "selected" : ""}`}
      key={theme.id}
      onClick={() => onThemeChange(theme.id)}
      type="button"
    >
      <div className={`theme-preview ${theme.kind}`} style={{ background: theme.vars["--bg-root"] }}>
        <div className="preview-dots">
          <span style={{ background: theme.vars["--danger"] }} />
          <span style={{ background: theme.vars["--warning"] }} />
          <span style={{ background: theme.vars["--success"] }} />
        </div>
        <div className="preview-lines">
          <span style={{ background: theme.vars["--accent"], width: "55%" }} />
          <span style={{ background: theme.vars["--text-muted"], width: "35%" }} />
        </div>
      </div>
      <div className="theme-card-footer">
        <span className="theme-name">{theme.label}</span>
        {activeThemeId === theme.id && <span className="theme-check">✓</span>}
      </div>
    </button>
  );

  return (
    <div className="settings-layout">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <span className="settings-gear-icon">⚙</span>
          <div>
            <h2>Settings</h2>
            <p>OpenSpace Desktop</p>
          </div>
        </div>
        <nav className="settings-nav">
          {SETTINGS_NAV.map((item) => (
            <button
              className={`settings-nav-item ${tab === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span className="nav-item-icon">{item.icon}</span>
              <div className="nav-item-text">
                <span className="nav-item-label">{item.label}</span>
                <span className="nav-item-subtitle">{item.subtitle}</span>
              </div>
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-footer">
          <span className="connection-dot" />
          <span>Connected</span>
        </div>
      </aside>

      <main className="settings-content">
        {tab === "appearance" && (
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-icon">◐</span>
              <div>
                <h2>Appearance</h2>
                <p>Choose a theme and keep your workspace consistent across sessions.</p>
              </div>
            </div>

            <h3 className="theme-group-label">☽ Dark themes</h3>
            <div className="theme-grid">
              {darkThemes.map(renderThemeCard)}
            </div>

            {lightThemes.length > 0 && (
              <>
                <h3 className="theme-group-label">☀ Light themes</h3>
                <div className="theme-grid">
                  {lightThemes.map(renderThemeCard)}
                </div>
              </>
            )}

            <p className="settings-info-note">ⓘ Theme changes are applied instantly and saved automatically.</p>
          </section>
        )}

        {tab === "shortcuts" && (
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-icon">⌨</span>
              <div>
                <h2>Keyboard Shortcuts</h2>
                <p>Reference frequently used shortcuts for workspace and pane actions.</p>
              </div>
            </div>

            {SHORTCUT_SECTIONS.map((section) => (
              <div className="shortcut-block" key={section.id}>
                <div className="shortcut-block-header">
                  <span>{section.icon} {section.label}</span>
                  <span className="shortcut-count">{section.shortcuts.length}</span>
                </div>
                <div className="shortcut-list">
                  {section.shortcuts.map((shortcut) => (
                    <div className="shortcut-row" key={shortcut.action}>
                      <span className="shortcut-action">{shortcut.action}</span>
                      <div className="shortcut-keys">
                        {shortcut.keys.map((key, keyIndex) => (
                          <kbd key={`${shortcut.action}-${keyIndex}`}>{key}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p className="settings-info-note">ⓘ Shortcuts use Ctrl on Linux. Use ⌘ on macOS.</p>
          </section>
        )}

        {tab === "account" && (
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-icon">⚿</span>
              <div>
                <h2>Account</h2>
                <p>Manage your profile, billing, and current session.</p>
              </div>
            </div>

            <div className="settings-card-label">PROFILE</div>
            <div className="account-profile-card">
              <div className="profile-avatar">O</div>
              <div className="profile-info">
                <div className="profile-name-row">
                  <strong>openspace-user</strong>
                  <span className="badge-active">● Active</span>
                </div>
                <span className="profile-email">local@openspace.dev</span>
              </div>
            </div>

            <div className="settings-card-label">BILLING</div>
            <div className="account-billing-card">
              <div className="billing-plan-row">
                <div>
                  <strong>Community Edition</strong>
                  <span className="badge-plan">Free</span>
                </div>
                <span className="billing-detail">Full access to all OpenSpace features</span>
              </div>
            </div>

            <div className="settings-card-label">SESSION</div>
            <div className="account-session-card">
              <div className="session-row">
                <div className="session-info">
                  <strong>Current Device</strong>
                  <span className="badge-session">This Session</span>
                </div>
                <span className="session-detail">OpenSpace Desktop • Linux</span>
              </div>
            </div>

            <div className="settings-card-label">DEBUG</div>
            <div className="account-debug-card">
              <div className="debug-row">
                <div><strong>Updates</strong></div>
                <span className="debug-detail">Current version: 0.1.0</span>
              </div>
            </div>
          </section>
        )}

        {tab === "api-keys" && (
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-icon">⚷</span>
              <div>
                <h2>API Keys</h2>
                <p>Create and manage API keys for MCP and programmatic access.</p>
              </div>
            </div>

            <div className="api-keys-create-card">
              <div className="api-keys-create-header">
                <div>
                  <h3>Create API Key</h3>
                  <p>Keys are shown once. Copy and store them securely.</p>
                </div>
                <button className="solid-button" type="button">⚷ Create Key</button>
              </div>
              <div className="api-key-input-row">
                <label>KEY NAME</label>
                <input className="api-key-input" placeholder="e.g. Claude Desktop" type="text" />
              </div>
            </div>

            <div className="api-keys-existing-card">
              <div className="existing-keys-header">
                <div>
                  <h3>Existing Keys</h3>
                  <p>Rotate compromised keys immediately. Revoke keys you no longer use.</p>
                </div>
                <button className="text-button" type="button">↻ Refresh</button>
              </div>
              <p className="empty-keys-message">No API keys created yet.</p>
            </div>

            <p className="settings-info-note">ⓘ Never share API keys in chat logs or source control. Rotate after suspected exposure.</p>
          </section>
        )}
      </main>
    </div>
  );
};

const codeEditorTheme = EditorView.theme(
  {
    "&": {
      background: "color-mix(in srgb, var(--bg-shell) 86%, black 14%)",
      border: "1px solid var(--border-soft)",
      borderRadius: "0.65rem",
      color: "var(--text-primary)",
      flex: "1",
      fontFamily: '"IBM Plex Mono", "Consolas", monospace',
      fontSize: "0.8rem",
      minHeight: "0",
      overflow: "hidden"
    },
    "&.cm-editor.cm-focused": {
      borderColor: "var(--accent)",
      outline: "none"
    },
    ".cm-content": {
      lineHeight: "1.45",
      minHeight: "100%",
      padding: "0.65rem 0.7rem"
    },
    ".cm-gutters": {
      background: "color-mix(in srgb, var(--bg-shell) 82%, black 18%)",
      border: "none",
      color: "var(--text-muted)"
    },
    ".cm-activeLine": {
      background: "rgba(0, 216, 255, 0.06)"
    },
    ".cm-activeLineGutter": {
      background: "rgba(0, 216, 255, 0.1)"
    }
  },
  {
    dark: true
  }
);

interface CodeEditorProps {
  language: string;
  onChange: (value: string) => void;
  value: string;
}

const CodeEditor = ({ language, onChange, value }: CodeEditorProps): JSX.Element => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const languageCompartment = languageCompartmentRef.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          oneDark,
          codeEditorTheme,
          EditorView.lineWrapping,
          languageCompartment.of(codeMirrorLanguageExtension(language)),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (!update.docChanged) {
              return;
            }
            onChangeRef.current(update.state.doc.toString());
          })
        ]
      })
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(codeMirrorLanguageExtension(language))
    });
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentDoc = view.state.doc.toString();
    if (currentDoc === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentDoc.length,
        insert: value
      }
    });
  }, [value]);

  return <div className="code-editor" ref={hostRef} />;
};

function App(): JSX.Element {
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(defaultWorkspaceState);
  const [fileTree, setFileTree] = useState(FILE_TREE);
  const [selectedFileId, setSelectedFileId] = useState("file-app");
  const [documents, setDocuments] = useState<Record<string, EditorDocument>>(DOCUMENTS);
  const [editorText, setEditorText] = useState(DOCUMENTS["file-app"]?.content ?? "");
  const [terminalPaneCount, setTerminalPaneCount] = useState(4);
  const [terminalPanes, setTerminalPanes] = useState<TerminalPane[]>(() =>
    TERMINAL_PANES.map((pane) => ({
      ...pane,
      status: "idle",
      outputPreview: "Waiting for terminal session.",
      sessionId: undefined
    }))
  );
  const [timelineEvents, setTimelineEvents] = useState<CommandTimelineEvent[]>([]);
  const [kanbanCards, setKanbanCards] = useState(KANBAN_CARDS);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [themeId, setThemeId] = useState(THEMES[0]?.id ?? "");
  const [runtimeNotice, setRuntimeNotice] = useState<string>(
    rendererBridge.hasBackend() ? "Backend connected" : "Renderer-only placeholder mode"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [terminalHostVersion, setTerminalHostVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const terminalRuntimesRef = useRef<Map<string, TerminalRuntime>>(new Map());
  const terminalHostsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const terminalHostCallbacksRef = useRef<Map<string, (host: HTMLDivElement | null) => void>>(new Map());
  const paneSessionMapRef = useRef<Map<string, string>>(new Map());
  const sessionPaneMapRef = useRef<Map<string, string>>(new Map());
  const creatingSessionRef = useRef<Map<string, Promise<string>>>(new Map());

  const activeTheme: ThemeDefinition = useMemo(
    () => THEMES.find((theme) => theme.id === themeId) ?? THEMES[0],
    [themeId]
  );
  const themeStyle = activeTheme.vars as CSSProperties;

  const selectedNode = useMemo(() => findNodeById(fileTree, selectedFileId), [fileTree, selectedFileId]);
  const selectedDocument = documents[selectedFileId];
  const hasUnsavedChanges = editorText !== (selectedDocument?.content ?? "");

  const visibleTerminals: TerminalPane[] = useMemo(() => {
    return Array.from({ length: terminalPaneCount }, (_entry, index) => {
      const seeded = terminalPanes[index];
      if (seeded) {
        return seeded;
      }
      const paneIndex = index + 1;
      return {
        id: `terminal-${paneIndex}`,
        label: `Pane ${paneIndex}`,
        command: "echo ready",
        status: "idle",
        outputPreview: "Ready for command."
      };
    });
  }, [terminalPaneCount, terminalPanes]);

  const terminalColumns = terminalColumnsFor(terminalPaneCount);
  const activeTab = useMemo(
    () => workspaceTabs.find((tab) => tab.id === activeTabId) ?? workspaceTabs[0],
    [workspaceTabs, activeTabId]
  );
  const themeMap = useMemo(() => Object.fromEntries(THEMES.map((theme) => [theme.id, theme.label])), []);

  const appendTimeline = (title: string, detail: string, command: string, status: TerminalStatus): void => {
    setTimelineEvents((previous) => [createTimelineEvent(title, detail, command, status), ...previous].slice(0, 18));
  };

  useEffect(() => {
    let isMounted = true;

    const boot = async (): Promise<void> => {
      const loadedWorkspace = await rendererBridge.loadWorkspaceState();
      if (!isMounted) {
        return;
      }

      setWorkspaceState(loadedWorkspace);
      const runtimeTabs = tabsFromWorkspaceState(loadedWorkspace);
      setWorkspaceTabs(runtimeTabs);
      setActiveTabId((current) => current || runtimeTabs[0]?.id || "");

      if (loadedWorkspace.rootPath) {
        const entries = await rendererBridge.listFiles(loadedWorkspace.rootPath);
        if (!isMounted) {
          return;
        }
        setFileTree(mapFsEntriesToTree(loadedWorkspace.rootPath, entries));
        setRuntimeNotice(`Loaded workspace: ${loadedWorkspace.rootPath}`);
      }

      const loadedCards = await rendererBridge.loadKanbanCards();
      if (!isMounted) {
        return;
      }
      if (loadedCards.length > 0) {
        setKanbanCards(loadedCards);
      }
    };

    void boot();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const doc = documents[selectedFileId];
    if (doc) {
      setEditorText(doc.content);
    } else {
      setEditorText("// Select a file from the tree to start editing.");
    }
  }, [selectedFileId, documents]);

  useEffect(() => {
    if (!isTemplateModalOpen) {
      return undefined;
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setTemplateModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isTemplateModalOpen]);

  const activeRootPath = activeTab?.rootPath ?? workspaceState.rootPath ?? undefined;
  const terminalCwd = activeRootPath || undefined;

  const updatePane = useCallback((paneId: string, mutator: (pane: TerminalPane) => TerminalPane): void => {
    setTerminalPanes((previous) => previous.map((pane) => (pane.id === paneId ? mutator(pane) : pane)));
  }, []);

  const getTerminalHostRef = useCallback((paneId: string): ((host: HTMLDivElement | null) => void) => {
    const existing = terminalHostCallbacksRef.current.get(paneId);
    if (existing) {
      return existing;
    }

    const callback = (host: HTMLDivElement | null): void => {
      const previousHost = terminalHostsRef.current.get(paneId);
      if (host) {
        terminalHostsRef.current.set(paneId, host);
      } else {
        terminalHostsRef.current.delete(paneId);
      }

      if (previousHost !== host) {
        setTerminalHostVersion((version) => version + 1);
      }
    };
    terminalHostCallbacksRef.current.set(paneId, callback);
    return callback;
  }, []);

  const resizePaneTerminal = useCallback((paneId: string): void => {
    const runtime = terminalRuntimesRef.current.get(paneId);
    if (!runtime) {
      return;
    }

    runtime.fitAddon.fit();
    const sessionId = paneSessionMapRef.current.get(paneId);
    if (!sessionId) {
      return;
    }

    const cols = Math.max(2, runtime.terminal.cols);
    const rows = Math.max(2, runtime.terminal.rows);
    void rendererBridge.resizeTerminal(sessionId, cols, rows).catch((error) => {
      console.error(`terminal resize failed for ${paneId}`, error);
    });
  }, []);

  const ensurePaneSession = useCallback(
    async (paneId: string): Promise<string> => {
      const existing = paneSessionMapRef.current.get(paneId);
      if (existing) {
        return existing;
      }

      const inFlight = creatingSessionRef.current.get(paneId);
      if (inFlight) {
        return inFlight;
      }

      let runtime = terminalRuntimesRef.current.get(paneId);
      if (!runtime) {
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await waitFor(50);
          runtime = terminalRuntimesRef.current.get(paneId);
          if (runtime) {
            break;
          }
        }
      }
      if (!runtime) {
        throw new Error(`terminal runtime missing for ${paneId}`);
      }

      const createSessionPromise = rendererBridge
        .createTerminal({
          cwd: terminalCwd,
          cols: Math.max(2, runtime.terminal.cols),
          rows: Math.max(2, runtime.terminal.rows)
        })
        .then((sessionId) => {
          paneSessionMapRef.current.set(paneId, sessionId);
          sessionPaneMapRef.current.set(sessionId, paneId);
          updatePane(paneId, (pane) => ({
            ...pane,
            sessionId,
            status: "idle",
            outputPreview: `Session ${sessionId} ready`
          }));
          resizePaneTerminal(paneId);
          return sessionId;
        })
        .catch((error) => {
          updatePane(paneId, (pane) => ({
            ...pane,
            sessionId: undefined,
            status: "error",
            outputPreview: "Failed to create terminal session."
          }));
          throw error;
        })
        .finally(() => {
          creatingSessionRef.current.delete(paneId);
        });

      creatingSessionRef.current.set(paneId, createSessionPromise);
      return createSessionPromise;
    },
    [terminalCwd, resizePaneTerminal, updatePane]
  );

  const disposePaneRuntime = useCallback(
    (paneId: string, killSession: boolean, resetPaneState = true): void => {
      const runtime = terminalRuntimesRef.current.get(paneId);
      if (runtime) {
        runtime.resizeObserver.disconnect();
        if (runtime.resizeFrame !== null) {
          window.cancelAnimationFrame(runtime.resizeFrame);
        }
        runtime.dataSubscription.dispose();
        runtime.webglAddon?.dispose();
        runtime.terminal.dispose();
        terminalRuntimesRef.current.delete(paneId);
      }

      const sessionId = paneSessionMapRef.current.get(paneId);
      paneSessionMapRef.current.delete(paneId);
      creatingSessionRef.current.delete(paneId);
      if (sessionId) {
        sessionPaneMapRef.current.delete(sessionId);
        if (killSession) {
          void rendererBridge.killTerminal(sessionId).catch((error) => {
            console.error(`terminal kill failed for ${paneId}`, error);
          });
        }
      }

      if (resetPaneState) {
        updatePane(paneId, (pane) => ({
          ...pane,
          sessionId: undefined,
          status: "idle",
          outputPreview: "Waiting for terminal session."
        }));
      }
    },
    [updatePane]
  );

  const createPaneRuntime = useCallback(
    (paneId: string, hostElement: HTMLDivElement): void => {
      const terminal = new Terminal({
        allowProposedApi: true,
        convertEol: true,
        cursorBlink: true,
        fontFamily: "IBM Plex Mono, Consolas, monospace",
        fontSize: 12,
        theme: terminalTheme
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      let webglAddon: WebglAddon | null = null;
      try {
        webglAddon = new WebglAddon();
        terminal.loadAddon(webglAddon);
      } catch (error) {
        console.warn("xterm webgl addon unavailable; continuing with canvas renderer", error);
      }

      terminal.open(hostElement);

      const dataSubscription = terminal.onData((data: string) => {
        const sessionId = paneSessionMapRef.current.get(paneId);
        if (!sessionId) {
          return;
        }

        void rendererBridge.writeTerminal(sessionId, data).catch((error) => {
          console.error(`terminal input write failed for ${paneId}`, error);
          updatePane(paneId, (pane) => ({
            ...pane,
            status: "error",
            outputPreview: "Terminal input write failed."
          }));
        });
      });

      const runtime: TerminalRuntime = {
        dataSubscription,
        fitAddon,
        hostElement,
        resizeFrame: null,
        resizeObserver: new ResizeObserver(() => {
          if (runtime.resizeFrame !== null) {
            window.cancelAnimationFrame(runtime.resizeFrame);
          }
          runtime.resizeFrame = window.requestAnimationFrame(() => {
            runtime.resizeFrame = null;
            resizePaneTerminal(paneId);
          });
        }),
        terminal,
        webglAddon
      };

      runtime.resizeObserver.observe(hostElement);
      terminalRuntimesRef.current.set(paneId, runtime);

      resizePaneTerminal(paneId);
      void ensurePaneSession(paneId);
    },
    [ensurePaneSession, resizePaneTerminal, updatePane]
  );

  useEffect(() => {
    const visiblePaneIds = new Set(visibleTerminals.map((pane) => pane.id));

    for (const pane of visibleTerminals) {
      const hostElement = terminalHostsRef.current.get(pane.id);
      if (!hostElement) {
        continue;
      }

      const existing = terminalRuntimesRef.current.get(pane.id);
      if (existing && existing.hostElement !== hostElement) {
        disposePaneRuntime(pane.id, true);
      }

      if (!terminalRuntimesRef.current.has(pane.id)) {
        createPaneRuntime(pane.id, hostElement);
      } else {
        resizePaneTerminal(pane.id);
        void ensurePaneSession(pane.id);
      }
    }

    for (const paneId of Array.from(terminalRuntimesRef.current.keys())) {
      if (!visiblePaneIds.has(paneId)) {
        disposePaneRuntime(paneId, true);
      }
    }
  }, [createPaneRuntime, disposePaneRuntime, ensurePaneSession, resizePaneTerminal, terminalHostVersion, visibleTerminals]);

  useEffect(
    () => () => {
      for (const paneId of Array.from(terminalRuntimesRef.current.keys())) {
        disposePaneRuntime(paneId, true, false);
      }
    },
    [disposePaneRuntime]
  );

  useEffect(() => {
    let outputUnlisten: (() => void) | null = null;
    let exitUnlisten: (() => void) | null = null;
    let disposed = false;

    const subscribe = async (): Promise<void> => {
      outputUnlisten = await rendererBridge.onTerminalOutput((payload) => {
        const paneId = sessionPaneMapRef.current.get(payload.sessionId);
        if (!paneId) {
          return;
        }

        const runtime = terminalRuntimesRef.current.get(paneId);
        runtime?.terminal.write(payload.data);
      });

      exitUnlisten = await rendererBridge.onTerminalExit((payload) => {
        const paneId = sessionPaneMapRef.current.get(payload.sessionId);
        if (!paneId) {
          return;
        }

        sessionPaneMapRef.current.delete(payload.sessionId);
        paneSessionMapRef.current.delete(paneId);

        const runtime = terminalRuntimesRef.current.get(paneId);
        runtime?.terminal.writeln(`\r\n[process exited with code ${payload.exitCode}]`);

        updatePane(paneId, (pane) => ({
          ...pane,
          sessionId: undefined,
          status: payload.exitCode === 0 ? "success" : "error",
          outputPreview: `Process exited (${payload.exitCode})`
        }));

        if (terminalRuntimesRef.current.has(paneId)) {
          void ensurePaneSession(paneId);
        }
      });

      if (disposed) {
        outputUnlisten?.();
        exitUnlisten?.();
      }
    };

    void subscribe();

    return () => {
      disposed = true;
      outputUnlisten?.();
      exitUnlisten?.();
    };
  }, [ensurePaneSession, updatePane]);

  const saveWorkspaceRoot = async (rootPath: string | null): Promise<void> => {
    const nextRecent = rootPath
      ? [rootPath, ...workspaceState.recentPaths.filter((item) => item !== rootPath)].slice(0, 6)
      : workspaceState.recentPaths;

    const nextState: WorkspaceState = {
      rootPath,
      recentPaths: nextRecent,
      updatedAt: new Date().toISOString()
    };
    setWorkspaceState(nextState);
    const persisted = await rendererBridge.saveWorkspaceState(nextState);
    setWorkspaceState(persisted);
  };

  const refreshTreeForRoot = async (rootPath: string): Promise<void> => {
    const entries = await rendererBridge.listFiles(rootPath);
    setFileTree(mapFsEntriesToTree(rootPath, entries));
  };

  const handleTabSelect = (tabId: string): void => {
    setActiveTabId(tabId);
    const tab = workspaceTabs.find((candidate) => candidate.id === tabId);
    const rootPath = tab?.rootPath ?? workspaceState.rootPath;

    if (rootPath) {
      void saveWorkspaceRoot(rootPath);
      void refreshTreeForRoot(rootPath);
    }
  };

  const handleSelectFile = async (node: FileNode): Promise<void> => {
    setSelectedFileId(node.id);

    if (!node.path) {
      return;
    }

    const read = await rendererBridge.readFile(node.path);
    if (!read) {
      return;
    }

    const nextDoc: EditorDocument = {
      fileId: node.id,
      title: node.name,
      language: node.language ?? inferLanguage(node.name),
      updatedAt: buildTimestamp(),
      content: read.content,
      path: read.path
    };

    setDocuments((previous) => ({ ...previous, [node.id]: nextDoc }));
  };

  const handleSaveFile = async (): Promise<void> => {
    const targetPath = selectedNode?.path ?? selectedDocument?.path;
    if (!targetPath) {
      const existing = selectedDocument;
      if (existing) {
        setDocuments((previous) => ({
          ...previous,
          [selectedFileId]: {
            ...existing,
            content: editorText,
            updatedAt: buildTimestamp()
          }
        }));
      }
      return;
    }

    setIsSaving(true);
    await rendererBridge.writeFile(targetPath, editorText);
    setIsSaving(false);

    setDocuments((previous) => ({
      ...previous,
      [selectedFileId]: {
        fileId: selectedFileId,
        title: selectedNode?.name ?? selectedDocument?.title ?? targetPath.split("/").pop() ?? "file",
        language: selectedNode?.language ?? selectedDocument?.language ?? "text",
        updatedAt: buildTimestamp(),
        content: editorText,
        path: targetPath
      }
    }));
  };

  const handleTerminalCountChange = (value: number): void => {
    const nextCount = Math.max(1, Math.min(MAX_TERMINAL_PANES, value));
    setTerminalPaneCount(nextCount);
  };

  const handlePaneCommandChange = (paneId: string, command: string): void => {
    updatePane(paneId, (pane) => ({
      ...pane,
      command
    }));
  };

  const handleRunPaneCommand = async (paneId: string, commandOverride?: string): Promise<void> => {
    const pane = terminalPanes.find((candidate) => candidate.id === paneId);
    if (!pane) {
      return;
    }

    const command = (commandOverride ?? pane.command).trim();
    if (!command) {
      return;
    }

    updatePane(paneId, (current) => ({
      ...current,
      status: "running",
      outputPreview: `Running: ${command}`
    }));

    try {
      const sessionId = await ensurePaneSession(paneId);
      await rendererBridge.writeTerminal(sessionId, `${command}\n`);
      updatePane(paneId, (current) => ({
        ...current,
        status: "success",
        outputPreview: `Dispatched on session ${sessionId}`
      }));
      appendTimeline("Run command", `${pane.label} | session ${sessionId}`, command, "success");
    } catch (error) {
      console.error(`run command failed for ${paneId}`, error);
      updatePane(paneId, (current) => ({
        ...current,
        status: "error",
        outputPreview: "Command dispatch failed."
      }));
      appendTimeline("Run command", `${pane.label} | dispatch failed`, command, "error");
    }
  };

  const persistKanban = async (cards: KanbanCard[]): Promise<void> => {
    await rendererBridge.persistKanbanCards(cards);
  };

  const moveCard = (cardId: string, lane: KanbanLane): void => {
    setKanbanCards((previous) => {
      const next = previous.map((card) => (card.id === cardId ? { ...card, lane } : card));
      void persistKanban(next);
      return next;
    });
  };

  const handleApplyTemplate = (template: TemplateDescriptor, directoryPath?: string): void => {
    const paneCount = Math.max(1, Math.min(MAX_TERMINAL_PANES, template.defaultPanes));
    const seedCommands =
      template.bootCommands.length > 0 ? template.bootCommands : ["git status", "npm run typecheck", "npm run build:web"];

    const resolvedDir = directoryPath && directoryPath !== "~"
      ? directoryPath
      : workspaceState.rootPath ?? undefined;

    setTerminalPanes((previous) =>
      previous.map((pane, index) =>
        index < paneCount
          ? {
              ...pane,
              command: seedCommands[index % seedCommands.length]
            }
          : pane
      )
    );

    setThemeId(template.suggestedThemeId);
    setTerminalPaneCount(paneCount);
    setTemplateModalOpen(false);
    setShowSettings(false);

    const workspaceName = resolvedDir
      ? resolvedDir.split("/").filter(Boolean).pop() ?? `Workspace ${Date.now() % 99}`
      : `Workspace ${new Date().getSeconds() % 99 || 1}`;
    const workspaceId = `ws-${Date.now()}`;
    const nextTab: WorkspaceTab = {
      id: workspaceId,
      name: workspaceName,
      branch: "main",
      health: "healthy",
      changedFiles: 0,
      rootPath: resolvedDir
    };

    if (workspaceTabs.length === 0) {
      setWorkspaceTabs([nextTab]);
    } else {
      setWorkspaceTabs((prev) => [...prev, nextTab]);
    }
    setActiveTabId(workspaceId);

    if (resolvedDir) {
      void saveWorkspaceRoot(resolvedDir);
      void refreshTreeForRoot(resolvedDir);
    }

    appendTimeline("Apply template", template.name, `template:${template.id}`, "success");

    seedCommands.slice(0, paneCount).forEach((command, index) => {
      const paneId = `terminal-${index + 1}`;
      window.setTimeout(() => {
        updatePane(paneId, (current) => ({
          ...current,
          command
        }));
        void handleRunPaneCommand(paneId, command);
      }, 300 * (index + 1));
    });
  };

  const handleOpenFolder = (): void => {
    setTemplateModalOpen(true);
  };

  const defaultDirectory = activeRootPath ?? workspaceState.rootPath ?? "~";

  return (
    <div className="bridge-app bridge-shell-exact" style={themeStyle}>
      <div aria-hidden className="shell-background" />

      <header className="shell-topbar">
        <div className="topbar-left">
          <div className="brand-mark" aria-hidden>
            ⚡
          </div>
          <div className="workspace-strip">
            {showSettings ? (
              <button
                className="workspace-pill settings-pill active"
                onClick={() => setShowSettings(true)}
                type="button"
              >
                <span className="pill-name">⚙ Settings</span>
              </button>
            ) : null}
            {workspaceTabs.length === 0 && !showSettings ? (
              <span className="no-workspaces">No workspaces open</span>
            ) : (
              workspaceTabs.map((tab) => (
                <button
                  aria-label={`${tab.name} workspace tab`}
                  className={`workspace-pill ${activeTabId === tab.id && !showSettings ? "active" : ""}`}
                  key={tab.id}
                  onClick={() => {
                    setShowSettings(false);
                    handleTabSelect(tab.id);
                  }}
                  title={`${tab.branch} | ${HEALTH_LABELS[tab.health]}`}
                  type="button"
                >
                  <span className="pill-name">{tab.name}</span>
                  {tab.changedFiles > 0 ? <span className="pill-count">{tab.changedFiles}</span> : null}
                </button>
              ))
            )}
            <button className="icon-button" onClick={() => setTemplateModalOpen(true)} type="button" title="New workspace">
              +
            </button>
          </div>
        </div>
        <button
          className={`icon-button ${showSettings ? "active" : ""}`}
          onClick={() => setShowSettings((prev) => !prev)}
          title="Settings"
          type="button"
        >
          ⚙
        </button>
      </header>

      {showSettings ? (
        <SettingsView
          activeThemeId={themeId}
          onThemeChange={setThemeId}
          themes={THEMES}
        />
      ) : workspaceTabs.length === 0 ? (
        <section className="welcome-shell">
          <div className="welcome-title-wrap">
            <h1>OpenSpace</h1>
            <p>Build The Future.</p>
          </div>

          <div className="welcome-actions">
            <button className="solid-button" onClick={() => setTemplateModalOpen(true)} type="button">
              ↳ New Workspace
            </button>
            <button className="text-button" onClick={handleOpenFolder} type="button">
              ☐ Open Folder
            </button>
          </div>

          <div className="shortcut-card">
            <header>
              <span>⌨ Keyboard Shortcuts</span>
            </header>
            <div className="shortcut-grid">
              <span>New Workspace</span>
              <kbd>Ctrl+T</kbd>
              <span>Navigate Panes</span>
              <kbd>Ctrl+] / [</kbd>
              <span>New Terminal</span>
              <kbd>Ctrl+N</kbd>
              <span>Quick Open File</span>
              <kbd>Ctrl+P</kbd>
              <span>Search Terminal</span>
              <kbd>Ctrl+F</kbd>
              <span>Settings</span>
              <kbd>Ctrl+,</kbd>
            </div>
          </div>
        </section>
      ) : (
        <main className="workspace-main">
          <div className="terminal-grid terminal-grid-exact" style={{ gridTemplateColumns: `repeat(${terminalColumns}, minmax(0, 1fr))` }}>
            {visibleTerminals.map((pane) => (
              <article className={`terminal-card exact-pane ${pane.status}`} key={pane.id}>
                <header>
                  <span className="pane-name">{pane.label}</span>
                  <span className={`status-pill ${pane.status}`}>{pane.status}</span>
                </header>
                <div className="terminal-host" ref={getTerminalHostRef(pane.id)} />
                <p className="terminal-command">{pane.command}</p>
                <p className="terminal-output">{pane.outputPreview}</p>
              </article>
            ))}
          </div>
        </main>
      )}

      {isTemplateModalOpen ? (
        <TemplatePickerModal
          defaultDirectory={defaultDirectory}
          onApply={handleApplyTemplate}
          onClose={() => setTemplateModalOpen(false)}
          templates={TEMPLATES}
          themeMap={themeMap}
        />
      ) : null}
    </div>
  );
}

export default App;
