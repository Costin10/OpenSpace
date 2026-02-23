import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, JSX } from "react";
import type { WorkspaceState } from "@shared/ipc";
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
  TIMELINE_EVENTS,
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

const MAX_TERMINAL_PANES = 16;

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

const tabsFromWorkspaceState = (state: WorkspaceState): WorkspaceTab[] => {
  const sources = state.recentPaths.length > 0 ? state.recentPaths : state.rootPath ? [state.rootPath] : [];
  if (sources.length === 0) {
    return WORKSPACE_TABS;
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
  onApply: (template: TemplateDescriptor) => void;
  onClose: () => void;
}

const TemplatePickerModal = ({
  templates,
  themeMap,
  onApply,
  onClose
}: TemplatePickerModalProps): JSX.Element => (
  <div className="modal-overlay" onClick={onClose} role="presentation">
    <section
      aria-modal
      className="template-modal"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
    >
      <header className="modal-header">
        <h3>Template Picker</h3>
        <button className="text-button" onClick={onClose} type="button">
          Close
        </button>
      </header>
      <p className="modal-subtitle">
        Choose a BridgeSpace preset. If Tauri runtime is available, commands run through terminal IPC.
      </p>
      <div className="template-grid">
        {templates.map((template) => (
          <article className="template-card" key={template.id}>
            <h4>{template.name}</h4>
            <p>{template.description}</p>
            <div className="template-meta">
              <span>{template.defaultPanes} panes</span>
              <span>{themeMap[template.suggestedThemeId] ?? template.suggestedThemeId}</span>
            </div>
            <div className="template-tags">
              {template.categories.map((tag) => (
                <span key={`${template.id}-${tag}`}>{tag}</span>
              ))}
            </div>
            <button className="solid-button" onClick={() => onApply(template)} type="button">
              Apply Template
            </button>
          </article>
        ))}
      </div>
    </section>
  </div>
);

function App(): JSX.Element {
  const [workspaceTabs, setWorkspaceTabs] = useState(WORKSPACE_TABS);
  const [activeTabId, setActiveTabId] = useState(WORKSPACE_TABS[0]?.id ?? "");
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(defaultWorkspaceState);
  const [fileTree, setFileTree] = useState(FILE_TREE);
  const [selectedFileId, setSelectedFileId] = useState("file-app");
  const [documents, setDocuments] = useState<Record<string, EditorDocument>>(DOCUMENTS);
  const [editorText, setEditorText] = useState(DOCUMENTS["file-app"]?.content ?? "");
  const [terminalPaneCount, setTerminalPaneCount] = useState(4);
  const [terminalPanes, setTerminalPanes] = useState<TerminalPane[]>(TERMINAL_PANES);
  const [timelineEvents, setTimelineEvents] = useState(TIMELINE_EVENTS);
  const [kanbanCards, setKanbanCards] = useState(KANBAN_CARDS);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [themeId, setThemeId] = useState(THEMES[0]?.id ?? "");
  const [runtimeNotice, setRuntimeNotice] = useState<string>(
    rendererBridge.hasBackend() ? "Backend connected" : "Renderer-only placeholder mode"
  );
  const [isSaving, setIsSaving] = useState(false);

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
        if (entries.length > 0) {
          setFileTree(mapFsEntriesToTree(loadedWorkspace.rootPath, entries));
          setRuntimeNotice(`Loaded workspace: ${loadedWorkspace.rootPath}`);
        }
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

  const updatePane = (paneId: string, mutator: (pane: TerminalPane) => TerminalPane): void => {
    setTerminalPanes((previous) => previous.map((pane) => (pane.id === paneId ? mutator(pane) : pane)));
  };

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
    if (entries.length > 0) {
      setFileTree(mapFsEntriesToTree(rootPath, entries));
    } else {
      setFileTree(FILE_TREE);
    }
  };

  const handleTabSelect = (tabId: string): void => {
    setActiveTabId(tabId);
    const tab = workspaceTabs.find((candidate) => candidate.id === tabId);
    const rootPath = tab?.rootPath ?? workspaceState.rootPath;

    appendTimeline("Switch workspace tab", tab?.name ?? tabId, `switch:${tabId}`, "idle");

    if (rootPath) {
      void saveWorkspaceRoot(rootPath);
      void refreshTreeForRoot(rootPath);
    }
  };

  const handleSelectFile = async (node: FileNode): Promise<void> => {
    setSelectedFileId(node.id);
    appendTimeline("Open file", node.name, `open:${node.path ?? node.id}`, "idle");

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
      appendTimeline("Save file", "No backend file path. Kept local editor state.", "save:local", "idle");
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
    appendTimeline("Save file", targetPath, `write:${targetPath}`, "success");

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
    appendTimeline("Adjust terminal grid", `${nextCount} panes`, `terminals:${nextCount}`, "running");
  };

  const runCommand = async (command: string, source: string): Promise<string> => {
    const workingDirectory = activeTab?.rootPath ?? workspaceState.rootPath ?? undefined;
    const sessionId = await rendererBridge.runCommand(command, workingDirectory);
    appendTimeline("Run command", `${source} -> ${command}`, command, "running");
    return sessionId;
  };

  const handleRunPane = async (pane: TerminalPane): Promise<void> => {
    updatePane(pane.id, (current) => ({
      ...current,
      status: "running",
      outputPreview: "Dispatching command to terminal session..."
    }));
    try {
      const sessionId = await runCommand(pane.command, pane.label);
      updatePane(pane.id, (current) => ({
        ...current,
        sessionId,
        status: "success",
        outputPreview: `Attached to session ${sessionId}`
      }));
    } catch {
      updatePane(pane.id, (current) => ({
        ...current,
        status: "error",
        outputPreview: "Failed to dispatch command."
      }));
    }
  };

  const handleRunCommandBlock = async (eventId: string): Promise<void> => {
    const timelineEvent = timelineEvents.find((item) => item.id === eventId);
    if (!timelineEvent) {
      return;
    }

    setTimelineEvents((previous) =>
      previous.map((item) => (item.id === eventId ? { ...item, status: "running", timestamp: buildTimestamp() } : item))
    );
    try {
      const sessionId = await runCommand(timelineEvent.command, timelineEvent.title);
      setTimelineEvents((previous) =>
        previous.map((item) =>
          item.id === eventId
            ? {
                ...item,
                status: "success",
                detail: `${timelineEvent.detail} | session ${sessionId}`,
                timestamp: buildTimestamp()
              }
            : item
        )
      );
    } catch {
      setTimelineEvents((previous) =>
        previous.map((item) =>
          item.id === eventId
            ? {
                ...item,
                status: "error",
                detail: `${timelineEvent.detail} | dispatch failed`,
                timestamp: buildTimestamp()
              }
            : item
        )
      );
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
    appendTimeline("Move kanban card", `${cardId} -> ${lane}`, `kanban:${cardId}:${lane}`, "success");
  };

  const handleApplyTemplate = (template: TemplateDescriptor): void => {
    const paneCount = Math.max(1, Math.min(MAX_TERMINAL_PANES, template.defaultPanes));
    setThemeId(template.suggestedThemeId);
    setTerminalPaneCount(paneCount);
    setTemplateModalOpen(false);
    appendTimeline("Apply template", template.name, `template:${template.id}`, "success");
  };

  return (
    <div className="bridge-app" style={themeStyle}>
      <div aria-hidden className="shell-background" />
      <header className="panel top-bar">
        <div className="tabs-row">
          {workspaceTabs.map((tab) => (
            <button
              aria-label={`${tab.name} workspace tab`}
              className={`workspace-tab ${activeTabId === tab.id ? "active" : ""}`}
              key={tab.id}
              onClick={() => handleTabSelect(tab.id)}
              title={`${tab.branch} | ${HEALTH_LABELS[tab.health]}`}
              type="button"
            >
              <span aria-hidden className={`health-dot ${tab.health}`} />
              <span className="tab-title">{tab.name}</span>
              <span className="tab-branch">{tab.branch}</span>
              {tab.changedFiles > 0 ? <span className="tab-count">{tab.changedFiles}</span> : null}
            </button>
          ))}
        </div>
        <div className="top-controls">
          <span className="runtime-chip">{runtimeNotice}</span>
          <label className="control-field" htmlFor="theme-selector">
            <span>Theme</span>
            <select id="theme-selector" onChange={(event) => setThemeId(event.target.value)} value={themeId}>
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <button className="solid-button" onClick={() => setTemplateModalOpen(true)} type="button">
            Templates
          </button>
        </div>
      </header>

      <main className="workbench-grid">
        <aside className="left-column">
          <section className="panel panel-body tree-panel">
            <PanelHeader title="File Tree" subtitle="Workspace structure and source files" />
            <FileTree nodes={fileTree} onSelectFile={(node) => void handleSelectFile(node)} selectedFileId={selectedFileId} />
          </section>

          <section className="panel panel-body editor-panel">
            <div className="editor-heading-row">
              <PanelHeader
                subtitle={`${selectedDocument?.language ?? selectedNode?.language ?? "txt"} | updated ${selectedDocument?.updatedAt ?? "n/a"}`}
                title={selectedDocument?.title ?? selectedNode?.name ?? "Editor"}
              />
              <button className="solid-button compact" disabled={isSaving} onClick={() => void handleSaveFile()} type="button">
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save*" : "Save"}
              </button>
            </div>
            <textarea
              className="code-editor"
              onChange={(event) => setEditorText(event.target.value)}
              spellCheck={false}
              value={editorText}
            />
          </section>
        </aside>

        <section className="panel panel-body terminal-panel">
          <div className="panel-heading-row">
            <PanelHeader subtitle="Configurable 1-16 panes wired for terminal IPC" title="Terminal Grid" />
            <label className="pane-control" htmlFor="pane-slider">
              <span>{terminalPaneCount} panes</span>
              <input
                id="pane-slider"
                max={MAX_TERMINAL_PANES}
                min={1}
                onChange={(event) => handleTerminalCountChange(Number(event.target.value))}
                type="range"
                value={terminalPaneCount}
              />
            </label>
          </div>
          <div className="terminal-grid" style={{ gridTemplateColumns: `repeat(${terminalColumns}, minmax(0, 1fr))` }}>
            {visibleTerminals.map((pane) => (
              <article className={`terminal-card ${pane.status}`} key={pane.id}>
                <header>
                  <span>{pane.label}</span>
                  <span className={`status-pill ${pane.status}`}>{pane.status}</span>
                </header>
                <p className="terminal-command">{pane.command}</p>
                <p className="terminal-output">{pane.outputPreview}</p>
                <button className="text-button" onClick={() => void handleRunPane(pane)} type="button">
                  Run in terminal
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel panel-body timeline-panel">
          <PanelHeader title="Command Blocks" subtitle="Timeline of build/test/deploy actions" />
          <ul className="timeline-list">
            {timelineEvents.map((event) => (
              <li className={`timeline-item ${event.status}`} key={event.id}>
                <div className="timeline-item-head">
                  <strong>{event.title}</strong>
                  <time>{event.timestamp}</time>
                </div>
                <p>{event.detail}</p>
                <p className="timeline-command">{event.command}</p>
                <button className="text-button" onClick={() => void handleRunCommandBlock(event.id)} type="button">
                  Run block
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      <section className="panel panel-body board-panel">
        <PanelHeader title="Kanban Board" subtitle="Todo | In Progress | In Review | Complete" />
        <div className="board-grid">
          {LANE_ORDER.map((lane) => {
            const cards = kanbanCards.filter((card) => card.lane === lane);
            return (
              <section
                className="lane"
                key={lane}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingCardId) {
                    moveCard(draggingCardId, lane);
                    setDraggingCardId(null);
                  }
                }}
              >
                <header className="lane-header">
                  <h3>{LANE_LABELS[lane]}</h3>
                  <span>{cards.length}</span>
                </header>
                <div className="lane-cards">
                  {cards.map((card) => (
                    <article
                      className="kanban-card"
                      draggable
                      key={card.id}
                      onDragEnd={() => setDraggingCardId(null)}
                      onDragStart={() => setDraggingCardId(card.id)}
                    >
                      <header>
                        <h4>{card.title}</h4>
                        <span className={`priority ${card.priority}`}>{PRIORITY_LABELS[card.priority]}</span>
                      </header>
                      <p>{card.owner}</p>
                      <div className="tags-row">
                        {card.tags.map((tag) => (
                          <span key={`${card.id}-${tag}`}>{tag}</span>
                        ))}
                      </div>
                      {card.lane !== "complete" ? (
                        <button className="text-button" onClick={() => moveCard(card.id, nextLaneFor(card.lane))} type="button">
                          Advance
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {isTemplateModalOpen ? (
        <TemplatePickerModal
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
