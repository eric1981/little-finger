// ═══════════════════════════════════════════════
// API Keys — load from chrome.storage, fallback to defaults
// Override: chrome.storage.local.set({api_keys: {pexels: 'sk-...'}})
// ═══════════════════════════════════════════════

const DEFAULTS: Record<string, string> = {
  pexels: '***REDACTED_PEXELS_KEY***',
};

let cachedKeys: Record<string, string> | null = null;

export async function getApiKey(name: string): Promise<string> {
  if (!cachedKeys) {
    const stored = await chrome.storage.local.get('api_keys');
    cachedKeys = { ...DEFAULTS, ...(stored.api_keys as Record<string, string> || {}) };
  }
  return cachedKeys[name] || '';
}

// Allow runtime override (for testing or Side Panel config)
export function setApiKeyOverride(name: string, value: string) {
  if (!cachedKeys) cachedKeys = { ...DEFAULTS };
  cachedKeys[name] = value;
}
