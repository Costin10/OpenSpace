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

export const LANE_ORDER: KanbanLane[] = ["todo", "in-progress", "in-review", "complete", "cancelled"];

export const LANE_LABELS: Record<KanbanLane, string> = {
  todo: "Todo",
  "in-progress": "In Progress",
  "in-review": "In Review",
  complete: "Complete",
  cancelled: "Cancelled"
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
          { id: "file-shell-css", name: "openspace.css", kind: "file", language: "css" },
          { id: "file-renderer", name: "openspace.ts", kind: "file", language: "ts" }
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
    <section className="openspace-shell">
      <h1>OpenSpace Milestone {milestone}</h1>
    </section>
  );
};
`
  },
  "file-shell-css": {
    fileId: "file-shell-css",
    title: "openspace.css",
    language: "css",
    updatedAt: "08:36",
    content: `:root {
  --bg-root: #090d14;
  --accent: #00d1ff;
}

.openspace-shell {
  color: var(--accent);
}
`
  },
  "file-renderer": {
    fileId: "file-renderer",
    title: "openspace.ts",
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
    detail: "openspace-ui-pr-301",
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
    tags: ["templates", "core"],
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
    id: "void",
    label: "Void",
    description: "Near-black with subtle violet undertones.",
    kind: "dark",
    vars: {
      "--surface": "#0a0a10", "--surface-hover": "#11111a", "--background": "#040407",
      "--panel": "#0a0a10", "--border": "#1e1e2e", "--border-active": "#6366f1bf",
      "--text-primary": "#eef", "--text-secondary": "#9898cc", "--text-muted": "#4a4a70",
      "--accent-blue": "#6366f1", "--accent-cyan": "#818cf8", "--accent-green": "#34d399",
      "--accent-yellow": "#fbbf24", "--accent-red": "#f43f5e", "--accent-magenta": "#e879f9"
    }
  },
  {
    id: "ghost",
    label: "Ghost",
    description: "Gray-toned stealth with pale accents.",
    kind: "dark",
    vars: {
      "--surface": "#0f0f10", "--surface-hover": "#151517", "--background": "#080808",
      "--panel": "#0f0f10", "--border": "#1e1e22", "--border-active": "#10d5a9bf",
      "--text-primary": "#f0f0f2", "--text-secondary": "#8a8a9a", "--text-muted": "#3e3e50",
      "--accent-blue": "#60a5fa", "--accent-cyan": "#10d5a9", "--accent-green": "#86efac",
      "--accent-yellow": "#fde68a", "--accent-red": "#fb7185", "--accent-magenta": "#c084fc"
    }
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "Deep purple with vibrant magenta accents.",
    kind: "dark",
    vars: {
      "--surface": "#0f0020", "--surface-hover": "#160030", "--background": "#070013",
      "--panel": "#0f0020", "--border": "#2a0048", "--border-active": "#e040fbd9",
      "--text-primary": "#f4e8ff", "--text-secondary": "#bc88f0", "--text-muted": "#6a3d90",
      "--accent-blue": "#818cf8", "--accent-cyan": "#22d3ee", "--accent-green": "#4ade80",
      "--accent-yellow": "#fbbf24", "--accent-red": "#f43f5e", "--accent-magenta": "#e040fb"
    }
  },
  {
    id: "carbon",
    label: "Carbon",
    description: "Ultra-dark with sharp gray contrasts.",
    kind: "dark",
    vars: {
      "--surface": "#181818", "--surface-hover": "#212121", "--background": "#101010",
      "--panel": "#181818", "--border": "#2c2c2c", "--border-active": "#f59e0bd9",
      "--text-primary": "#e8e8e8", "--text-secondary": "#b0b0b0", "--text-muted": "#606060",
      "--accent-blue": "#60a5fa", "--accent-cyan": "#22d3ee", "--accent-green": "#a3e635",
      "--accent-yellow": "#f59e0b", "--accent-red": "#ef4444", "--accent-magenta": "#f97316"
    }
  },
  {
    id: "hex",
    label: "Hex",
    description: "Hacker green on deep black.",
    kind: "dark",
    vars: {
      "--surface": "#060f06", "--surface-hover": "#091509", "--background": "#030803",
      "--panel": "#060f06", "--border": "#0f200f", "--border-active": "#00ff41bf",
      "--text-primary": "#cfc", "--text-secondary": "#6d6", "--text-muted": "#286628",
      "--accent-blue": "#0af", "--accent-cyan": "#0d5", "--accent-green": "#00ff41",
      "--accent-yellow": "#cf0", "--accent-red": "#f44", "--accent-magenta": "#4f8"
    }
  },
  {
    id: "neon-tokyo",
    label: "Neon Tokyo",
    description: "Cyberpunk neon with hot pink and cyan.",
    kind: "dark",
    vars: {
      "--surface": "#12001e", "--surface-hover": "#1a0028", "--background": "#0a0014",
      "--panel": "#12001e", "--border": "#2d0048", "--border-active": "#ff0080d9",
      "--text-primary": "#ffe8ff", "--text-secondary": "#c8c", "--text-muted": "#63a",
      "--accent-blue": "#0ff", "--accent-cyan": "#00e0ff", "--accent-green": "#39ff14",
      "--accent-yellow": "#ff0", "--accent-red": "#ff0080", "--accent-magenta": "#f0f"
    }
  },
  {
    id: "obsidian",
    label: "Obsidian",
    description: "Deep indigo with purple accents.",
    kind: "dark",
    vars: {
      "--surface": "#0d0a1a", "--surface-hover": "#130f24", "--background": "#06040e",
      "--panel": "#0d0a1a", "--border": "#1e183a", "--border-active": "#8b5cf6cc",
      "--text-primary": "#e8e0ff", "--text-secondary": "#9880d0", "--text-muted": "#4a3880",
      "--accent-blue": "#818cf8", "--accent-cyan": "#34d399", "--accent-green": "#86efac",
      "--accent-yellow": "#fbbf24", "--accent-red": "#f87171", "--accent-magenta": "#8b5cf6"
    }
  },
  {
    id: "nebula",
    label: "Nebula",
    description: "Blue-purple space atmosphere with soft glow.",
    kind: "dark",
    vars: {
      "--surface": "#060020", "--surface-hover": "#0a0030", "--background": "#030010",
      "--panel": "#060020", "--border": "#160040", "--border-active": "#c084fcd9",
      "--text-primary": "#f0e8ff", "--text-secondary": "#b085e8", "--text-muted": "#5a3080",
      "--accent-blue": "#818cf8", "--accent-cyan": "#67e8f9", "--accent-green": "#34d399",
      "--accent-yellow": "#fbbf24", "--accent-red": "#f472b6", "--accent-magenta": "#c084fc"
    }
  },
  {
    id: "storm",
    label: "Storm",
    description: "Steel blue atmosphere under dark skies.",
    kind: "dark",
    vars: {
      "--surface": "#131b24", "--surface-hover": "#1a2333", "--background": "#0c1016",
      "--panel": "#131b24", "--border": "#243040", "--border-active": "#fde047d9",
      "--text-primary": "#e8eef8", "--text-secondary": "#89b", "--text-muted": "#456",
      "--accent-blue": "#60a5fa", "--accent-cyan": "#22d3ee", "--accent-green": "#4ade80",
      "--accent-yellow": "#fde047", "--accent-red": "#f87171", "--accent-magenta": "#f472b6"
    }
  },
  {
    id: "infrared",
    label: "Infrared",
    description: "Dark ember base with tactical amber accents.",
    kind: "dark",
    vars: {
      "--surface": "#1a0500", "--surface-hover": "#250800", "--background": "#0c0200",
      "--panel": "#1a0500", "--border": "#3d1000", "--border-active": "#ff6b35d9",
      "--text-primary": "#fff4ee", "--text-secondary": "#d97", "--text-muted": "#7a3a22",
      "--accent-blue": "#fb923c", "--accent-cyan": "#fbbf24", "--accent-green": "#a3e635",
      "--accent-yellow": "#ff6b35", "--accent-red": "#dc2626", "--accent-magenta": "#f97316"
    }
  },
  {
    id: "nova",
    label: "Nova",
    description: "Cosmic dark with warm orange glow.",
    kind: "dark",
    vars: {
      "--surface": "#0c0312", "--surface-hover": "#12051c", "--background": "#050208",
      "--panel": "#0c0312", "--border": "#200a30", "--border-active": "#f97316d9",
      "--text-primary": "#fff8f0", "--text-secondary": "#d9a880", "--text-muted": "#705040",
      "--accent-blue": "#818cf8", "--accent-cyan": "#22d3ee", "--accent-green": "#4ade80",
      "--accent-yellow": "#fbbf24", "--accent-red": "#ef4444", "--accent-magenta": "#f97316"
    }
  },
  {
    id: "stealth",
    label: "Stealth",
    description: "Minimal dark with faint monochrome accents.",
    kind: "dark",
    vars: {
      "--surface": "#141818", "--surface-hover": "#1c2222", "--background": "#0d0f0f",
      "--panel": "#141818", "--border": "#252e2e", "--border-active": "#34d39999",
      "--text-primary": "#c8d8d0", "--text-secondary": "#708878", "--text-muted": "#384840",
      "--accent-blue": "#4d9e8e", "--accent-cyan": "#34d399", "--accent-green": "#84cc16",
      "--accent-yellow": "#a3a046", "--accent-red": "#dc2626", "--accent-magenta": "#64748b"
    }
  },
  {
    id: "hologram",
    label: "Hologram",
    description: "Deep navy with electric cyan accents.",
    kind: "dark",
    vars: {
      "--surface": "#04101e", "--surface-hover": "#06162a", "--background": "#020810",
      "--panel": "#04101e", "--border": "#0a2040", "--border-active": "#00d4ffd9",
      "--text-primary": "#e0f6ff", "--text-secondary": "#7dcff0", "--text-muted": "#2a6888",
      "--accent-blue": "#00d4ff", "--accent-cyan": "#38bdf8", "--accent-green": "#34d399",
      "--accent-yellow": "#fbbf24", "--accent-red": "#f87171", "--accent-magenta": "#a78bfa"
    }
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Classic Dracula palette with purple and pink.",
    kind: "dark",
    vars: {
      "--surface": "#24253a", "--surface-hover": "#2e2f47", "--background": "#1a1b2e",
      "--panel": "#24253a", "--border": "#44475a", "--border-active": "#bd93f9d9",
      "--text-primary": "#f8f8f2", "--text-secondary": "#ccc9f4", "--text-muted": "#6272a4",
      "--accent-blue": "#8be9fd", "--accent-cyan": "#8be9fd", "--accent-green": "#50fa7b",
      "--accent-yellow": "#f1fa8c", "--accent-red": "#f55", "--accent-magenta": "#ff79c6"
    }
  },
  {
    id: "bridgemind",
    label: "BridgeMind",
    description: "Deep AI-core theme with electric cyan glow.",
    kind: "dark",
    vars: {
      "--surface": "#080c14", "--surface-hover": "#0f1420", "--background": "#030508",
      "--panel": "#080c14", "--border": "#141e30", "--border-active": "#00e5ffcc",
      "--text-primary": "#eef2ff", "--text-secondary": "#8ba3d0", "--text-muted": "#3a5070",
      "--accent-blue": "#3b82f6", "--accent-cyan": "#00e5ff", "--accent-green": "#10ffb0",
      "--accent-yellow": "#fc0", "--accent-red": "#ff3370", "--accent-magenta": "#bf5af2"
    }
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm off-white with soft ink accents.",
    kind: "light",
    vars: {
      "--surface": "#f4f4f5", "--surface-hover": "#e8e8ea", "--background": "#fafafa",
      "--panel": "#f4f4f5", "--border": "#e0e0e4", "--border-active": "#09090b99",
      "--text-primary": "#09090b", "--text-secondary": "#3f3f46", "--text-muted": "#71717a",
      "--accent-blue": "#2563eb", "--accent-cyan": "#0891b2", "--accent-green": "#16a34a",
      "--accent-yellow": "#ca8a04", "--accent-red": "#dc2626", "--accent-magenta": "#7c3aed"
    }
  },
  {
    id: "chalk",
    label: "Chalk",
    description: "Cool gray-white with blue-gray accents.",
    kind: "light",
    vars: {
      "--surface": "#f5eed8", "--surface-hover": "#ece0c4", "--background": "#fdf8f0",
      "--panel": "#f5eed8", "--border": "#ddd0b8", "--border-active": "#16a34abf",
      "--text-primary": "#1a1008", "--text-secondary": "#4a3020", "--text-muted": "#8a7060",
      "--accent-blue": "#2563eb", "--accent-cyan": "#0891b2", "--accent-green": "#16a34a",
      "--accent-yellow": "#d97706", "--accent-red": "#dc2626", "--accent-magenta": "#7c3aed"
    }
  },
  {
    id: "solar",
    label: "Solar",
    description: "Warm golden light with earthy contrasts.",
    kind: "light",
    vars: {
      "--surface": "#eee8d5", "--surface-hover": "#ddd6c0", "--background": "#fdf6e3",
      "--panel": "#eee8d5", "--border": "#d0caa8", "--border-active": "#268bd2bf",
      "--text-primary": "#073642", "--text-secondary": "#586e75", "--text-muted": "#93a1a1",
      "--accent-blue": "#268bd2", "--accent-cyan": "#2aa198", "--accent-green": "#859900",
      "--accent-yellow": "#b58900", "--accent-red": "#dc322f", "--accent-magenta": "#d33682"
    }
  },
  {
    id: "arctic",
    label: "Arctic",
    description: "Cold blue-white with icy accents.",
    kind: "light",
    vars: {
      "--surface": "#eff4ff", "--surface-hover": "#e3edff", "--background": "#f8fbff",
      "--panel": "#eff4ff", "--border": "#c8daf8", "--border-active": "#2563ebbf",
      "--text-primary": "#0f1c3f", "--text-secondary": "#344e88", "--text-muted": "#6680b0",
      "--accent-blue": "#2563eb", "--accent-cyan": "#0891b2", "--accent-green": "#059669",
      "--accent-yellow": "#d97706", "--accent-red": "#dc2626", "--accent-magenta": "#7c3aed"
    }
  },
  {
    id: "ivory",
    label: "Ivory",
    description: "Creamy warm tone with subtle contrasts.",
    kind: "light",
    vars: {
      "--surface": "#f3efe8", "--surface-hover": "#e8e2d8", "--background": "#faf8f4",
      "--panel": "#f3efe8", "--border": "#d8d0c0", "--border-active": "#b45309bf",
      "--text-primary": "#1e1208", "--text-secondary": "#54402a", "--text-muted": "#9a8060",
      "--accent-blue": "#2563eb", "--accent-cyan": "#0891b2", "--accent-green": "#16a34a",
      "--accent-yellow": "#b45309", "--accent-red": "#dc2626", "--accent-magenta": "#7c3aed"
    }
  }
];

export const TEMPLATES: TemplateDescriptor[] = [
  {
    id: "quick-triage",
    name: "Quick Triage",
    description: "3 terminals, timeline focus, and lightweight file context.",
    defaultPanes: 3,
    suggestedThemeId: "bridgemind",
    categories: ["incident", "review"],
    bootCommands: ["git status", "npm run typecheck", "npm run build:web"]
  },
  {
    id: "release-war-room",
    name: "Release War Room",
    description: "8 terminals and broad visibility for ship checks.",
    defaultPanes: 8,
    suggestedThemeId: "infrared",
    categories: ["release", "coordination"],
    bootCommands: [
      "git pull --ff-only",
      "npm ci",
      "npm run typecheck",
      "npm run build",
      "npm run test",
      "cargo check --manifest-path src-tauri/Cargo.toml"
    ]
  },
  {
    id: "deep-debug",
    name: "Deep Debug",
    description: "12 terminals for parallel investigation and traces.",
    defaultPanes: 12,
    suggestedThemeId: "hologram",
    categories: ["debug", "perf"],
    bootCommands: [
      "git status",
      "npm run dev:web",
      "npm run typecheck -- --watch",
      "cargo check --manifest-path src-tauri/Cargo.toml",
      "tail -f ./logs/app.log",
      "rg --line-number TODO src"
    ]
  }
];
