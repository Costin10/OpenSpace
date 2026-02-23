import type {
  CommandTimelineEvent,
  EditorDocument,
  FileNode,
  KanbanCard,
  KanbanLane,
  TemplateDescriptor,
  TerminalPane,
  ThemeDefinition,
  WorkspaceTab
} from "../types/ui";

export const LANE_ORDER: KanbanLane[] = ["todo", "in-progress", "in-review", "complete"];

export const LANE_LABELS: Record<KanbanLane, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
  complete: "Complete"
};

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: "ops-core",
    name: "ops-core",
    branch: "feature/milestone-b",
    health: "healthy",
    changedFiles: 12,
    rootPath: "/workspace/ops-core"
  },
  {
    id: "billing-ui",
    name: "billing-ui",
    branch: "release/2026.03",
    health: "warning",
    changedFiles: 5,
    rootPath: "/workspace/billing-ui"
  },
  {
    id: "agent-runtime",
    name: "agent-runtime",
    branch: "main",
    health: "error",
    changedFiles: 0,
    rootPath: "/workspace/agent-runtime"
  }
];

export const FILE_TREE: FileNode[] = [
  {
    id: "folder-src",
    name: "src",
    kind: "folder",
    children: [
      {
        id: "folder-renderer",
        name: "renderer",
        kind: "folder",
        children: [
          { id: "file-app", name: "App.tsx", kind: "file", language: "tsx" },
          { id: "file-shell-css", name: "bridge-space.css", kind: "file", language: "css" },
          { id: "file-bridge", name: "openspaceBridge.ts", kind: "file", language: "ts" }
        ]
      },
      {
        id: "folder-shared",
        name: "shared",
        kind: "folder",
        children: [
          { id: "file-types", name: "types.ts", kind: "file", language: "ts" },
          { id: "file-contract", name: "ipcContract.ts", kind: "file", language: "ts" }
        ]
      }
    ]
  },
  {
    id: "folder-tests",
    name: "tests",
    kind: "folder",
    children: [{ id: "file-layout-test", name: "layout.spec.ts", kind: "file", language: "ts" }]
  }
];

export const DOCUMENTS: Record<string, EditorDocument> = {
  "file-app": {
    fileId: "file-app",
    title: "App.tsx",
    language: "tsx",
    updatedAt: "08:39",
    content: `const milestone = "B";

export const App = () => {
  return (
    <section className="bridge-shell">
      <h1>BridgeSpace Milestone {milestone}</h1>
    </section>
  );
};
`
  },
  "file-shell-css": {
    fileId: "file-shell-css",
    title: "bridge-space.css",
    language: "css",
    updatedAt: "08:36",
    content: `:root {
  --bg-root: #090d14;
  --accent: #00d1ff;
}

.bridge-shell {
  color: var(--accent);
}
`
  },
  "file-bridge": {
    fileId: "file-bridge",
    title: "openspaceBridge.ts",
    language: "ts",
    updatedAt: "08:41",
    content: `export interface RendererBridge {
  runCommand: (command: string) => Promise<string>;
}
`
  },
  "file-types": {
    fileId: "file-types",
    title: "types.ts",
    language: "ts",
    updatedAt: "07:53",
    content: `export type CommandStatus = "idle" | "running" | "error";`
  },
  "file-contract": {
    fileId: "file-contract",
    title: "ipcContract.ts",
    language: "ts",
    updatedAt: "07:20",
    content: `export const CHANNELS = {
  APPLY_TEMPLATE: "template:apply"
};`
  },
  "file-layout-test": {
    fileId: "file-layout-test",
    title: "layout.spec.ts",
    language: "ts",
    updatedAt: "06:48",
    content: `describe("layout", () => {
  it("renders terminal panes", () => {});
});`
  }
};

export const TERMINAL_PANES: TerminalPane[] = Array.from({ length: 16 }, (_v, index) => {
  const paneNumber = index + 1;
  const statuses = ["running", "idle", "success", "error"] as const;
  const status = statuses[index % statuses.length];

  return {
    id: `terminal-${paneNumber}`,
    label: `Pane ${paneNumber}`,
    command: `npm run ${paneNumber % 2 === 0 ? "test" : "build"}`,
    status,
    outputPreview:
      status === "error"
        ? "Type mismatch in renderer state."
        : status === "running"
          ? "Watching workspace changes..."
          : status === "success"
            ? "Command finished in 2.3s."
            : "Ready for command."
  };
});

export const TIMELINE_EVENTS: CommandTimelineEvent[] = [
  {
    id: "evt-103",
    title: "Deploy preview",
    detail: "bridge-ui-pr-301",
    command: "npm run deploy:preview",
    timestamp: "09:04",
    status: "running"
  },
  {
    id: "evt-102",
    title: "Run renderer tests",
    detail: "28 passed, 1 skipped",
    command: "npm run test:renderer",
    timestamp: "08:58",
    status: "success"
  },
  {
    id: "evt-101",
    title: "Validate IPC contract",
    detail: "shared types missing field: mode",
    command: "npm run check:ipc",
    timestamp: "08:47",
    status: "error"
  },
  {
    id: "evt-100",
    title: "Install dependencies",
    detail: "npm ci",
    command: "npm ci",
    timestamp: "08:21",
    status: "success"
  }
];

export const KANBAN_CARDS: KanbanCard[] = [
  {
    id: "task-11",
    title: "Wire terminal pane IPC events",
    owner: "Ari",
    lane: "todo",
    tags: ["ipc", "terminals"],
    priority: "p1"
  },
  {
    id: "task-12",
    title: "Add compact mode for timeline",
    owner: "Mika",
    lane: "todo",
    tags: ["ui"],
    priority: "p2"
  },
  {
    id: "task-13",
    title: "Refine tab health indicators",
    owner: "Niko",
    lane: "in-progress",
    tags: ["workspace", "ux"],
    priority: "p3"
  },
  {
    id: "task-14",
    title: "Map templates to backend presets",
    owner: "Jules",
    lane: "in-review",
    tags: ["templates", "bridge"],
    priority: "p1"
  },
  {
    id: "task-15",
    title: "Document milestone B renderer API",
    owner: "Ken",
    lane: "complete",
    tags: ["docs"],
    priority: "p2"
  }
];

export const THEMES: ThemeDefinition[] = [
  {
    id: "cobalt-grid",
    label: "Cobalt Grid",
    description: "Cool cyan energy with electric highlights.",
    vars: {
      "--bg-root": "#070c14",
      "--bg-shell": "#0d1624",
      "--bg-panel": "#101d2f",
      "--bg-raised": "#13253a",
      "--border-soft": "#2c4d6f",
      "--border-strong": "#3f78b3",
      "--text-primary": "#e7f5ff",
      "--text-muted": "#95b7d3",
      "--accent": "#00d8ff",
      "--accent-alt": "#ffc247",
      "--success": "#00f7a1",
      "--warning": "#ffc247",
      "--danger": "#ff5c81",
      "--overlay": "rgba(1, 6, 12, 0.72)",
      "--shadow": "rgba(0, 216, 255, 0.22)",
      "--stripe-a": "rgba(0, 216, 255, 0.06)",
      "--stripe-b": "rgba(255, 194, 71, 0.04)"
    }
  },
  {
    id: "amber-circuit",
    label: "Amber Circuit",
    description: "Dark ember base with tactical amber accents.",
    vars: {
      "--bg-root": "#110d0b",
      "--bg-shell": "#1b1411",
      "--bg-panel": "#241b16",
      "--bg-raised": "#2b211b",
      "--border-soft": "#5c4536",
      "--border-strong": "#a86f44",
      "--text-primary": "#fff1df",
      "--text-muted": "#cfb59b",
      "--accent": "#ff9f40",
      "--accent-alt": "#2cfad6",
      "--success": "#56ffb2",
      "--warning": "#ffce56",
      "--danger": "#ff6a6a",
      "--overlay": "rgba(14, 9, 7, 0.78)",
      "--shadow": "rgba(255, 159, 64, 0.22)",
      "--stripe-a": "rgba(255, 159, 64, 0.06)",
      "--stripe-b": "rgba(44, 250, 214, 0.05)"
    }
  },
  {
    id: "emerald-scan",
    label: "Emerald Scan",
    description: "Operations green with high-contrast text and glow.",
    vars: {
      "--bg-root": "#08110d",
      "--bg-shell": "#0f1b15",
      "--bg-panel": "#13241c",
      "--bg-raised": "#193126",
      "--border-soft": "#2f5944",
      "--border-strong": "#3eb67a",
      "--text-primary": "#e8fff2",
      "--text-muted": "#9ac8b0",
      "--accent": "#40ffb8",
      "--accent-alt": "#1fd2ff",
      "--success": "#59ff86",
      "--warning": "#ffd66d",
      "--danger": "#ff6d8e",
      "--overlay": "rgba(5, 12, 9, 0.78)",
      "--shadow": "rgba(64, 255, 184, 0.22)",
      "--stripe-a": "rgba(64, 255, 184, 0.06)",
      "--stripe-b": "rgba(31, 210, 255, 0.04)"
    }
  }
];

export const TEMPLATES: TemplateDescriptor[] = [
  {
    id: "quick-triage",
    name: "Quick Triage",
    description: "3 terminals, timeline focus, and lightweight file context.",
    defaultPanes: 3,
    suggestedThemeId: "cobalt-grid",
    categories: ["incident", "review"]
  },
  {
    id: "release-war-room",
    name: "Release War Room",
    description: "8 terminals and broad visibility for ship checks.",
    defaultPanes: 8,
    suggestedThemeId: "amber-circuit",
    categories: ["release", "coordination"]
  },
  {
    id: "deep-debug",
    name: "Deep Debug",
    description: "12 terminals for parallel investigation and traces.",
    defaultPanes: 12,
    suggestedThemeId: "emerald-scan",
    categories: ["debug", "perf"]
  }
];
