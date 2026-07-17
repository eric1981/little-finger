/// <reference types="wxt/sandbox" />

// Vue SFC shim — allows importing .vue files in TS
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

// WXT auto-imports — declared globally so tsc --noEmit (which doesn't run the
// WXT build pipeline) can resolve them. At build time WXT injects real imports.
declare const defineBackground: (cb: () => void) => void;
declare const defineContentScript: (opts: Record<string, unknown>) => unknown;
declare const browser: typeof chrome;
