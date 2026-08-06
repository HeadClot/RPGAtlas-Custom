/* RPGAtlas — browser-side Electrobun bridge.
   This is emitted as an additional Vite entry and injected only into the
   Electrobun-staged frontend. Plain browser pages never execute it. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Electroview } from "electrobun/view";
import type { DesktopRPCSchema } from "../../shared/electrobun-rpc";

declare global {
  interface Window {
    __ATLAS_ELECTROBUN__?: {
      isDesktop: true;
      rpc: ReturnType<typeof Electroview.defineRPC<DesktopRPCSchema>>;
      onOpenProjectRequest(cb: (path: string) => void): void;
    };
  }
}

const nativeWindow = typeof window !== "undefined" &&
  typeof (window as any).__electrobunWebviewId === "number";

if (nativeWindow && !(window as any).__ATLAS_ELECTROBUN__) {
  const listeners = new Set<(path: string) => void>();
  const rpc = Electroview.defineRPC<DesktopRPCSchema>({
    handlers: {
      messages: {
        open_project_request: ({ path }) => { for (const listener of listeners) listener(path); },
      },
    },
  });
  new Electroview({ rpc });
  window.__ATLAS_ELECTROBUN__ = {
    isDesktop: true,
    rpc,
    onOpenProjectRequest(cb) { listeners.add(cb); },
  };
}
