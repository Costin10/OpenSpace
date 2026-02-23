import { i as invoke, l as listen } from "./index-BjdFrzXK.js";

const terminalDataListeners = new Set();
const terminalExitListeners = new Set();
const terminalDataBySession = new Map();
const terminalExitBySession = new Map();
const terminalSessionDataListeners = new Map();
const terminalSessionExitListeners = new Map();
const terminalSessionCwd = new Map();
const TERMINAL_BUFFER_LIMIT = 1024 * 1024;

let terminalEventsInitialized = false;

function noopUnsub() {
  return () => {};
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function normalizePath(value) {
  return isNonEmptyString(value) ? value : "~";
}

function dirname(path) {
  if (!isNonEmptyString(path)) return "";
  const cleaned = path.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  if (idx <= 0) return cleaned.includes("\\") ? cleaned.slice(0, 3) : "/";
  return cleaned.slice(0, idx);
}

function basename(path) {
  if (!isNonEmptyString(path)) return "";
  const cleaned = path.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

function joinPath(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return "";
  const filtered = parts.filter((p) => isNonEmptyString(p));
  if (filtered.length === 0) return "";
  return filtered.join("/").replace(/\/{2,}/g, "/");
}

function toUtf8String(content) {
  if (typeof content === "string") return content;
  if (content instanceof Uint8Array) return new TextDecoder().decode(content);
  if (Array.isArray(content)) return new TextDecoder().decode(new Uint8Array(content));
  return String(content ?? "");
}

function addPerSessionListener(store, sessionId, listener) {
  let set = store.get(sessionId);
  if (!set) {
    set = new Set();
    store.set(sessionId, set);
  }
  set.add(listener);
  return () => {
    const current = store.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) store.delete(sessionId);
  };
}

function emitTerminalData(sessionId, data) {
  const event = { id: sessionId, data };

  terminalDataListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {}
  });

  const sessionListeners = terminalSessionDataListeners.get(sessionId);
  if (sessionListeners && sessionListeners.size > 0) {
    sessionListeners.forEach((fn) => {
      try {
        fn(data);
      } catch {}
    });
    return;
  }

  const previous = terminalDataBySession.get(sessionId) || "";
  const next = previous + data;
  terminalDataBySession.set(
    sessionId,
    next.length > TERMINAL_BUFFER_LIMIT ? next.slice(next.length - TERMINAL_BUFFER_LIMIT) : next
  );
}

function emitTerminalExit(sessionId, code) {
  const event = { id: sessionId, code };

  terminalExitListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {}
  });

  const sessionListeners = terminalSessionExitListeners.get(sessionId);
  if (sessionListeners && sessionListeners.size > 0) {
    sessionListeners.forEach((fn) => {
      try {
        fn(code);
      } catch {}
    });
  } else {
    terminalExitBySession.set(sessionId, code);
    setTimeout(() => {
      terminalExitBySession.delete(sessionId);
    }, 30000);
  }

  terminalDataBySession.delete(sessionId);
  terminalSessionDataListeners.delete(sessionId);
  terminalSessionExitListeners.delete(sessionId);
  terminalSessionCwd.delete(sessionId);
}

async function ensureTerminalEventListeners() {
  if (terminalEventsInitialized) return;
  terminalEventsInitialized = true;

  try {
    await listen("terminal:output", (event) => {
      const payload = event?.payload || {};
      const sessionId = payload.sessionId || payload.id;
      if (!isNonEmptyString(sessionId)) return;
      emitTerminalData(sessionId, String(payload.data ?? ""));
    });
  } catch {}

  try {
    await listen("terminal:exit", (event) => {
      const payload = event?.payload || {};
      const sessionId = payload.sessionId || payload.id;
      if (!isNonEmptyString(sessionId)) return;
      const code = Number(payload.exitCode ?? payload.code ?? 0);
      emitTerminalExit(sessionId, Number.isFinite(code) ? code : 0);
    });
  } catch {}
}

async function safeInvoke(command, args, fallback = null) {
  try {
    return await invoke(command, args);
  } catch {
    return fallback;
  }
}

function platform() {
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("mac")) return "darwin";
  if (agent.includes("win")) return "win32";
  return "linux";
}

const apiNoopFailure = async (message = "Not implemented in local OpenSpace mode") => ({
  success: false,
  error: { message }
});

const tauriAPI = {
  terminal: {
    create: async (cwd) => {
      await ensureTerminalEventListeners();
      const normalizedCwd = normalizePath(cwd);
      const result = await invoke("terminal_create", {
        request: {
          cwd: normalizedCwd
        }
      });
      const id = result?.sessionId || result?.id;
      if (!isNonEmptyString(id)) {
        throw new Error("terminal_create did not return a session id");
      }
      terminalSessionCwd.set(id, normalizedCwd);
      return {
        id,
        sessionId: id,
        pid: Number(result?.pid ?? 0),
        cwd: normalizedCwd
      };
    },
    write: (id, data) => {
      if (!isNonEmptyString(id)) return;
      invoke("terminal_write", {
        request: {
          sessionId: id,
          data: String(data ?? "")
        }
      }).catch(() => {});
    },
    resize: (id, cols, rows) => {
      if (!isNonEmptyString(id)) return;
      invoke("terminal_resize", {
        request: {
          sessionId: id,
          cols: Number(cols || 1),
          rows: Number(rows || 1)
        }
      }).catch(() => {});
    },
    destroy: (id) => {
      if (!isNonEmptyString(id)) return;
      terminalDataBySession.delete(id);
      terminalExitBySession.delete(id);
      terminalSessionCwd.delete(id);
      invoke("terminal_kill", {
        request: {
          sessionId: id
        }
      }).catch(() => {});
    },
    getCwd: async (id) => {
      if (!isNonEmptyString(id)) return null;
      return terminalSessionCwd.get(id) || null;
    },
    setVisible: () => {},
    onData: (listener) => {
      terminalDataListeners.add(listener);
      return () => terminalDataListeners.delete(listener);
    },
    onExit: (listener) => {
      terminalExitListeners.add(listener);
      return () => terminalExitListeners.delete(listener);
    },
    onDataForSession: (sessionId, listener) => {
      const unsub = addPerSessionListener(terminalSessionDataListeners, sessionId, listener);
      const buffered = terminalDataBySession.get(sessionId);
      if (buffered) {
        terminalDataBySession.delete(sessionId);
        try {
          listener(buffered);
        } catch {}
      }
      return unsub;
    },
    onExitForSession: (sessionId, listener) => {
      const unsub = addPerSessionListener(terminalSessionExitListeners, sessionId, listener);
      if (terminalExitBySession.has(sessionId)) {
        const code = terminalExitBySession.get(sessionId);
        terminalExitBySession.delete(sessionId);
        try {
          listener(code);
        } catch {}
      }
      return unsub;
    }
  },
  system: {
    platform: platform(),
    getInfo: async (cwd) => ({
      cwd: normalizePath(cwd),
      gitBranch: null
    }),
    getHomeDir: async () => {
      const home = await safeInvoke("system_get_home_dir", null, null);
      return normalizePath(home);
    },
    getInitialPath: async () => {
      const state = await safeInvoke("workspace_load", null, null);
      if (state?.rootPath) return state.rootPath;
      if (Array.isArray(state?.recentPaths) && state.recentPaths.length > 0) {
        return state.recentPaths[0];
      }
      return null;
    },
    getWebUrl: async () => "https://www.bridgemind.ai",
    getLogPath: async () => null,
    getVersion: async () => {
      const version = await safeInvoke("system_get_version", null, null);
      return isNonEmptyString(version) ? version : "OpenSpace";
    }
  },
  dialog: {
    openFolder: async (options = {}) => {
      const value = await invoke("plugin:dialog|open", {
        options: {
          directory: true,
          multiple: false,
          defaultPath: options.defaultPath,
          title: options.title || "Select Folder"
        }
      });
      if (!value) return null;
      return Array.isArray(value) ? value[0] || null : value;
    },
    openFile: async (options = {}) => {
      const value = await invoke("plugin:dialog|open", {
        options: {
          directory: false,
          multiple: !!options.multiSelections,
          defaultPath: options.defaultPath,
          title: options.title || "Select File",
          filters: options.filters
        }
      });
      if (!value) return null;
      return Array.isArray(value) ? value : [value];
    },
    saveFile: async (options = {}) => {
      const value = await invoke("plugin:dialog|save", {
        options: {
          defaultPath: options.defaultPath,
          title: options.title || "Save File",
          filters: options.filters
        }
      });
      return value ?? null;
    }
  },
  fs: {
    readDirectory: async (dirPath, options = {}) => {
      const entries = await invoke("filesystem_list", {
        request: {
          path: dirPath
        }
      });
      if (!Array.isArray(entries)) return [];

      const ignored = Array.isArray(options.ignoredPatterns) ? options.ignoredPatterns : [];
      const showHidden = !!options.showHidden;
      const normalizedEntries = entries.map((entry) => {
        const name = String(entry?.name ?? "");
        return {
          name,
          path: String(entry?.path ?? ""),
          isDirectory: Boolean(entry?.isDirectory ?? entry?.is_directory),
          size: Number(entry?.size ?? 0),
          mtimeMs: Number(entry?.mtimeMs ?? entry?.mtime_ms ?? 0)
        };
      });

      return normalizedEntries.filter((entry) => {
        const name = entry.name;
        if (!showHidden && name.startsWith(".")) return false;
        if (ignored.some((pattern) => isNonEmptyString(pattern) && name.includes(pattern))) {
          return false;
        }
        return true;
      });
    },
    readFile: async (filePath) => {
      const result = await invoke("filesystem_read", {
        request: {
          path: filePath
        }
      });
      return String(result?.content ?? "");
    },
    writeFile: async (filePath, content) => {
      const result = await invoke("filesystem_write", {
        request: {
          path: filePath,
          content: toUtf8String(content)
        }
      });
      return result?.content ?? toUtf8String(content);
    },
    createFile: async (filePath, content = "") => {
      await tauriAPI.fs.writeFile(filePath, content);
    },
    createDirectory: async (dirPath) => {
      await invoke("filesystem_write", {
        request: {
          path: joinPath([dirPath, ".openspace_keep"]),
          content: ""
        }
      });
    },
    delete: async () => {
      throw new Error("Delete is not available in this OpenSpace bridge mode");
    },
    rename: async () => {
      throw new Error("Rename is not available in this OpenSpace bridge mode");
    },
    copy: async (src, dest) => {
      const content = await tauriAPI.fs.readFile(src, "utf-8");
      await tauriAPI.fs.writeFile(dest, content);
    },
    copyDroppedFile: async (destPath, bytes) => {
      await tauriAPI.fs.writeFile(destPath, bytes);
    },
    exists: async (targetPath) => {
      const asDir = await safeInvoke(
        "filesystem_list",
        {
          request: { path: targetPath }
        },
        null
      );
      if (Array.isArray(asDir)) return true;

      const asFile = await safeInvoke(
        "filesystem_read",
        {
          request: { path: targetPath }
        },
        null
      );
      return !!asFile;
    },
    stat: async (targetPath) => {
      const parentPath = dirname(targetPath);
      const name = basename(targetPath);
      if (!isNonEmptyString(parentPath) || !isNonEmptyString(name)) return null;
      const list = await tauriAPI.fs.readDirectory(parentPath, { showHidden: true });
      return list.find((entry) => entry?.name === name) || null;
    },
    watch: async () => ({ watchId: "noop-watch-id" }),
    unwatch: async () => {},
    basename: async (filePath) => basename(filePath),
    dirname: async (filePath) => dirname(filePath),
    join: async (...parts) => joinPath(parts),
    getPathForFile: (file) => {
      const path = file?.path;
      return isNonEmptyString(path) ? path : null;
    },
    onChange: () => noopUnsub()
  },
  window: {
    minimize: () => {
      invoke("window_minimize").catch(() => {});
    },
    maximize: () => {
      invoke("window_maximize").catch(() => {});
    },
    close: () => {
      invoke("window_close").catch(() => {
        try {
          window.close();
        } catch {}
      });
    },
    startDragging: () => {
      invoke("window_start_dragging").catch(() => {});
    },
    isMaximized: async () => false,
    onMaximizedChange: () => noopUnsub()
  },
  shell: {
    openExternal: async (url) => {
      const opened = await safeInvoke("shell_open_external", { url }, null);
      if (opened !== null) return;
      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {}
    },
    showItemInFolder: async (fullPath) => {
      const opened = await safeInvoke("shell_show_item_in_folder", { fullPath }, null);
      if (opened !== null) return;
      await tauriAPI.shell.openExternal(dirname(fullPath));
    }
  },
  api: {
    onEvent: () => noopUnsub(),
    stripe: {
      createCustomerPortal: () => apiNoopFailure("Stripe portal is unavailable in local OpenSpace mode")
    },
    apiKey: {
      create: () => apiNoopFailure("API keys require BridgeMind backend"),
      getAll: () => apiNoopFailure("API keys require BridgeMind backend"),
      revoke: () => apiNoopFailure("API keys require BridgeMind backend"),
      rotate: () => apiNoopFailure("API keys require BridgeMind backend")
    },
    auth: {
      signUpInit: () => apiNoopFailure(),
      signUp: () => apiNoopFailure(),
      signIn: () => apiNoopFailure(),
      signOut: async () => ({ success: true }),
      getCurrentUser: async () => ({ success: true, data: null }),
      checkStatus: async () => ({ success: true, data: { isAuthenticated: true } }),
      verifyEmail: () => apiNoopFailure(),
      resendVerification: () => apiNoopFailure(),
      forgotPassword: () => apiNoopFailure(),
      resetPassword: () => apiNoopFailure(),
      changePassword: () => apiNoopFailure(),
      isSessionValid: async () => true,
      sessionNeedsRefresh: async () => false,
      cognito: {
        callback: () => apiNoopFailure(),
        verifyToken: () => apiNoopFailure(),
        refresh: async () => ({ success: false }),
        loginUrl: () => apiNoopFailure(),
        signupUrl: () => apiNoopFailure(),
        logoutUrl: () => apiNoopFailure(),
        logout: async () => ({ success: true })
      }
    }
  },
  authFlow: {
    startLogin: async () => ({ success: true }),
    startSignup: async () => ({ success: true }),
    cancelFlow: async () => ({ success: true }),
    isFlowInProgress: async () => false,
    signOut: async () => ({ success: true }),
    checkStatus: async () => ({ isAuthenticated: true }),
    getSession: async () => ({ isAuthenticated: true, user: null, expiresAt: null }),
    getCurrentUser: async () => ({ success: true, data: { user: null } }),
    isSessionValid: async () => true,
    sessionNeedsRefresh: async () => false,
    refreshTokens: async () => ({ success: false }),
    getCognitoLoginUrl: async () => ({ success: false }),
    getCognitoSignupUrl: async () => ({ success: false }),
    getCognitoLogoutUrl: async () => ({ success: false }),
    forgotPassword: async () => ({ success: false }),
    resetPassword: async () => ({ success: false }),
    changePassword: async () => ({ success: false }),
    onAuthEvent: (listener) => {
      try {
        listener({ event: "auth:flow:success" });
      } catch {}
      return noopUnsub();
    }
  },
  updater: {
    checkForUpdates: async () => ({ updateAvailable: false }),
    quitAndInstall: async () => {},
    getVersion: async () => {
      const version = await tauriAPI.system.getVersion();
      return version || "OpenSpace";
    },
    onUpdateAvailable: () => noopUnsub(),
    onDownloadProgress: () => noopUnsub(),
    onUpdateDownloaded: () => noopUnsub(),
    onError: () => noopUnsub()
  }
};

if (typeof window !== "undefined") {
  window.tauriAPI = tauriAPI;
}

export { tauriAPI };
