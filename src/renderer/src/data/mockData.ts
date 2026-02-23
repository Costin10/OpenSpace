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
    id: "cobalt-grid",
    label: "DeepMind",
    description: "Cool cyan energy with electric highlights.",
    kind: "dark",
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
    id: "void",
    label: "Void",
    description: "Near-black with subtle violet undertones.",
    kind: "dark",
    vars: {
      "--bg-root": "#06050e",
      "--bg-shell": "#0c0a18",
      "--bg-panel": "#110e22",
      "--bg-raised": "#17132e",
      "--border-soft": "#2a2350",
      "--border-strong": "#4a3d8a",
      "--text-primary": "#e6e0ff",
      "--text-muted": "#9b8fc6",
      "--accent": "#8b7aff",
      "--accent-alt": "#ff6bda",
      "--success": "#5dff9e",
      "--warning": "#ffcb4d",
      "--danger": "#ff5c7a",
      "--overlay": "rgba(4, 3, 10, 0.78)",
      "--shadow": "rgba(139, 122, 255, 0.22)",
      "--stripe-a": "rgba(139, 122, 255, 0.05)",
      "--stripe-b": "rgba(255, 107, 218, 0.04)"
    }
  },
  {
    id: "ghost",
    label: "Ghost",
    description: "Gray-toned stealth with pale accents.",
    kind: "dark",
    vars: {
      "--bg-root": "#0a0b0e",
      "--bg-shell": "#111318",
      "--bg-panel": "#171a20",
      "--bg-raised": "#1e2128",
      "--border-soft": "#2f343e",
      "--border-strong": "#4a5060",
      "--text-primary": "#e0e3ea",
      "--text-muted": "#8b919e",
      "--accent": "#a0b4d0",
      "--accent-alt": "#7ecfcf",
      "--success": "#6dd89a",
      "--warning": "#d4b45e",
      "--danger": "#d06666",
      "--overlay": "rgba(8, 9, 12, 0.78)",
      "--shadow": "rgba(100, 120, 150, 0.18)",
      "--stripe-a": "rgba(160, 180, 208, 0.04)",
      "--stripe-b": "rgba(126, 207, 207, 0.03)"
    }
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "Deep purple with vibrant magenta accents.",
    kind: "dark",
    vars: {
      "--bg-root": "#0d071a",
      "--bg-shell": "#150e28",
      "--bg-panel": "#1c1434",
      "--bg-raised": "#241a42",
      "--border-soft": "#3d2d68",
      "--border-strong": "#6a4aa8",
      "--text-primary": "#f0e4ff",
      "--text-muted": "#b49dda",
      "--accent": "#d04aff",
      "--accent-alt": "#ff4a9e",
      "--success": "#4affa4",
      "--warning": "#ffc44a",
      "--danger": "#ff4a6a",
      "--overlay": "rgba(10, 5, 20, 0.78)",
      "--shadow": "rgba(208, 74, 255, 0.22)",
      "--stripe-a": "rgba(208, 74, 255, 0.06)",
      "--stripe-b": "rgba(255, 74, 158, 0.04)"
    }
  },
  {
    id: "carbon",
    label: "Carbon",
    description: "Ultra-dark with sharp gray contrasts.",
    kind: "dark",
    vars: {
      "--bg-root": "#080808",
      "--bg-shell": "#0f0f0f",
      "--bg-panel": "#161616",
      "--bg-raised": "#1c1c1c",
      "--border-soft": "#303030",
      "--border-strong": "#505050",
      "--text-primary": "#e8e8e8",
      "--text-muted": "#888888",
      "--accent": "#ff6633",
      "--accent-alt": "#33ccff",
      "--success": "#33ff88",
      "--warning": "#ffbb33",
      "--danger": "#ff4444",
      "--overlay": "rgba(6, 6, 6, 0.78)",
      "--shadow": "rgba(255, 102, 51, 0.18)",
      "--stripe-a": "rgba(255, 102, 51, 0.04)",
      "--stripe-b": "rgba(51, 204, 255, 0.03)"
    }
  },
  {
    id: "neon-tokyo",
    label: "Neon Tokyo",
    description: "Cyberpunk neon with hot pink and cyan.",
    kind: "dark",
    vars: {
      "--bg-root": "#0a0812",
      "--bg-shell": "#12101e",
      "--bg-panel": "#1a162a",
      "--bg-raised": "#221d38",
      "--border-soft": "#38305a",
      "--border-strong": "#5e4e90",
      "--text-primary": "#f4eaff",
      "--text-muted": "#a090c8",
      "--accent": "#ff2a8a",
      "--accent-alt": "#00f0ff",
      "--success": "#00ff88",
      "--warning": "#ffdd00",
      "--danger": "#ff4455",
      "--overlay": "rgba(8, 6, 14, 0.78)",
      "--shadow": "rgba(255, 42, 138, 0.22)",
      "--stripe-a": "rgba(255, 42, 138, 0.06)",
      "--stripe-b": "rgba(0, 240, 255, 0.05)"
    }
  },
  {
    id: "amber-circuit",
    label: "Infrared",
    description: "Dark ember base with tactical amber accents.",
    kind: "dark",
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
    id: "nebula",
    label: "Nebula",
    description: "Blue-purple space atmosphere with soft glow.",
    kind: "dark",
    vars: {
      "--bg-root": "#080a16",
      "--bg-shell": "#0e1224",
      "--bg-panel": "#141832",
      "--bg-raised": "#1a1f40",
      "--border-soft": "#2d3560",
      "--border-strong": "#4858a0",
      "--text-primary": "#e4eaff",
      "--text-muted": "#8895c8",
      "--accent": "#6c8aff",
      "--accent-alt": "#ff82c8",
      "--success": "#4affba",
      "--warning": "#ffcc55",
      "--danger": "#ff5580",
      "--overlay": "rgba(6, 8, 18, 0.78)",
      "--shadow": "rgba(108, 138, 255, 0.22)",
      "--stripe-a": "rgba(108, 138, 255, 0.05)",
      "--stripe-b": "rgba(255, 130, 200, 0.04)"
    }
  },
  {
    id: "storm",
    label: "Storm",
    description: "Steel blue atmosphere under dark skies.",
    kind: "dark",
    vars: {
      "--bg-root": "#090c12",
      "--bg-shell": "#0e1420",
      "--bg-panel": "#141c2c",
      "--bg-raised": "#1a2438",
      "--border-soft": "#2a3a54",
      "--border-strong": "#3e5878",
      "--text-primary": "#dde6f0",
      "--text-muted": "#7e96b0",
      "--accent": "#4a90d8",
      "--accent-alt": "#d8904a",
      "--success": "#3ec890",
      "--warning": "#d8a84a",
      "--danger": "#d84a5a",
      "--overlay": "rgba(7, 10, 15, 0.78)",
      "--shadow": "rgba(74, 144, 216, 0.18)",
      "--stripe-a": "rgba(74, 144, 216, 0.04)",
      "--stripe-b": "rgba(216, 144, 74, 0.03)"
    }
  },
  {
    id: "emerald-scan",
    label: "Hologram",
    description: "Operations green with high-contrast text and glow.",
    kind: "dark",
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
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Classic Dracula palette with purple and pink.",
    kind: "dark",
    vars: {
      "--bg-root": "#282a36",
      "--bg-shell": "#21222c",
      "--bg-panel": "#2c2e3e",
      "--bg-raised": "#343648",
      "--border-soft": "#44475a",
      "--border-strong": "#6272a4",
      "--text-primary": "#f8f8f2",
      "--text-muted": "#6272a4",
      "--accent": "#bd93f9",
      "--accent-alt": "#ff79c6",
      "--success": "#50fa7b",
      "--warning": "#f1fa8c",
      "--danger": "#ff5555",
      "--overlay": "rgba(30, 31, 42, 0.78)",
      "--shadow": "rgba(189, 147, 249, 0.18)",
      "--stripe-a": "rgba(189, 147, 249, 0.04)",
      "--stripe-b": "rgba(255, 121, 198, 0.04)"
    }
  },
  {
    id: "stealth",
    label: "Stealth",
    description: "Minimal dark with faint monochrome accents.",
    kind: "dark",
    vars: {
      "--bg-root": "#060608",
      "--bg-shell": "#0c0c10",
      "--bg-panel": "#121218",
      "--bg-raised": "#18181f",
      "--border-soft": "#252530",
      "--border-strong": "#38384a",
      "--text-primary": "#d0d0dd",
      "--text-muted": "#6e6e85",
      "--accent": "#8888aa",
      "--accent-alt": "#55aabb",
      "--success": "#55aa77",
      "--warning": "#aa9955",
      "--danger": "#aa5555",
      "--overlay": "rgba(4, 4, 6, 0.78)",
      "--shadow": "rgba(100, 100, 130, 0.15)",
      "--stripe-a": "rgba(136, 136, 170, 0.03)",
      "--stripe-b": "rgba(85, 170, 187, 0.03)"
    }
  },
  {
    id: "paper",
    label: "Paper",
    description: "Warm off-white with soft ink accents.",
    kind: "light",
    vars: {
      "--bg-root": "#faf8f5",
      "--bg-shell": "#f2efe9",
      "--bg-panel": "#eae6de",
      "--bg-raised": "#e2ded5",
      "--border-soft": "#d0cbc0",
      "--border-strong": "#b0a898",
      "--text-primary": "#2c2820",
      "--text-muted": "#7a7468",
      "--accent": "#d05020",
      "--accent-alt": "#2080b0",
      "--success": "#2a8848",
      "--warning": "#b08820",
      "--danger": "#c03030",
      "--overlay": "rgba(250, 248, 245, 0.85)",
      "--shadow": "rgba(44, 40, 32, 0.12)",
      "--stripe-a": "rgba(208, 80, 32, 0.04)",
      "--stripe-b": "rgba(32, 128, 176, 0.04)"
    }
  },
  {
    id: "chalk",
    label: "Chalk",
    description: "Cool gray-white with blue-gray accents.",
    kind: "light",
    vars: {
      "--bg-root": "#f5f6f8",
      "--bg-shell": "#eceef2",
      "--bg-panel": "#e3e6ec",
      "--bg-raised": "#dadde5",
      "--border-soft": "#c4c8d4",
      "--border-strong": "#9fa5b5",
      "--text-primary": "#1e2230",
      "--text-muted": "#5e6578",
      "--accent": "#3868b8",
      "--accent-alt": "#8840b8",
      "--success": "#228855",
      "--warning": "#a88820",
      "--danger": "#c83838",
      "--overlay": "rgba(245, 246, 248, 0.85)",
      "--shadow": "rgba(30, 34, 48, 0.10)",
      "--stripe-a": "rgba(56, 104, 184, 0.04)",
      "--stripe-b": "rgba(136, 64, 184, 0.03)"
    }
  },
  {
    id: "solar",
    label: "Solar",
    description: "Warm golden light with earthy contrasts.",
    kind: "light",
    vars: {
      "--bg-root": "#fdf8f0",
      "--bg-shell": "#f5ede0",
      "--bg-panel": "#ede4d4",
      "--bg-raised": "#e5dbc8",
      "--border-soft": "#d4c8b0",
      "--border-strong": "#b8a888",
      "--text-primary": "#302818",
      "--text-muted": "#806838",
      "--accent": "#c07020",
      "--accent-alt": "#2888a0",
      "--success": "#388830",
      "--warning": "#b89020",
      "--danger": "#c04030",
      "--overlay": "rgba(253, 248, 240, 0.85)",
      "--shadow": "rgba(48, 40, 24, 0.12)",
      "--stripe-a": "rgba(192, 112, 32, 0.04)",
      "--stripe-b": "rgba(40, 136, 160, 0.04)"
    }
  },
  {
    id: "arctic",
    label: "Arctic",
    description: "Cold blue-white with icy accents.",
    kind: "light",
    vars: {
      "--bg-root": "#f4f8fc",
      "--bg-shell": "#e8f0f8",
      "--bg-panel": "#dce6f2",
      "--bg-raised": "#d0dcec",
      "--border-soft": "#b8c8dc",
      "--border-strong": "#8aa0c0",
      "--text-primary": "#18283c",
      "--text-muted": "#506882",
      "--accent": "#2868c0",
      "--accent-alt": "#a040c0",
      "--success": "#1c7848",
      "--warning": "#a08018",
      "--danger": "#c02838",
      "--overlay": "rgba(244, 248, 252, 0.85)",
      "--shadow": "rgba(24, 40, 60, 0.10)",
      "--stripe-a": "rgba(40, 104, 192, 0.04)",
      "--stripe-b": "rgba(160, 64, 192, 0.03)"
    }
  },
  {
    id: "ivory",
    label: "Ivory",
    description: "Creamy warm tone with subtle contrasts.",
    kind: "light",
    vars: {
      "--bg-root": "#fcfaf4",
      "--bg-shell": "#f6f2e8",
      "--bg-panel": "#eeead8",
      "--bg-raised": "#e6e2cc",
      "--border-soft": "#d8d0b8",
      "--border-strong": "#c0b490",
      "--text-primary": "#2e2c20",
      "--text-muted": "#78705a",
      "--accent": "#b86830",
      "--accent-alt": "#5080a8",
      "--success": "#488038",
      "--warning": "#b09028",
      "--danger": "#b83838",
      "--overlay": "rgba(252, 250, 244, 0.85)",
      "--shadow": "rgba(46, 44, 32, 0.10)",
      "--stripe-a": "rgba(184, 104, 48, 0.04)",
      "--stripe-b": "rgba(80, 128, 168, 0.03)"
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
    categories: ["incident", "review"],
    bootCommands: ["git status", "npm run typecheck", "npm run build:web"]
  },
  {
    id: "release-war-room",
    name: "Release War Room",
    description: "8 terminals and broad visibility for ship checks.",
    defaultPanes: 8,
    suggestedThemeId: "amber-circuit",
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
    suggestedThemeId: "emerald-scan",
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
