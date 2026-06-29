/**
 * Registers and manages all platform adapters.
 * New platforms are added by registering their adapter here.
 */
import type { IPlatformAdapter } from './base';
import type { PlatformId } from '../core/types';

const adapterMap = new Map<string, IPlatformAdapter>();

export function registerAdapter(adapter: IPlatformAdapter): void {
  adapterMap.set(adapter.id, adapter);
  console.log(`[Little Finger] Registered adapter: ${adapter.name} (${adapter.id})`);
}

export function getAdapter(id: PlatformId | string): IPlatformAdapter | undefined {
  return adapterMap.get(id);
}

export function listAdapters(): IPlatformAdapter[] {
  return Array.from(adapterMap.values());
}

export function findAdapterForDomain(url: string): IPlatformAdapter | undefined {
  const hostname = new URL(url).hostname;
  for (const adapter of adapterMap.values()) {
    if (adapter.domains.some(d => hostname.includes(d))) {
      return adapter;
    }
  }
  return undefined;
}
