import type { OpenSpaceApi } from "@shared/ipc";

declare global {
  interface Window {
    openspace?: OpenSpaceApi;
  }
}

export {};
