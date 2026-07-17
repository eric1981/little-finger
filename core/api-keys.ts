// ═══════════════════════════════════════════════
// API Keys — load from chrome.storage.
// NO DEFAULT KEYS: user must configure via Side Panel → ⚙ → API Keys.
// Override: chrome.storage.local.set({api_keys: {pexels: 'sk-...'}})
// ═══════════════════════════════════════════════

let cachedKeys: Record<string, string> | null = null;

export async function getApiKey(name: string): Promise<string> {
  if (!cachedKeys) {
    const stored = await chrome.storage.local.get('api_keys');
    cachedKeys = { ...(stored.api_keys as Record<string, string> || {}) };
  }
  return cachedKeys[name] || '';
}

// Allow runtime override (for testing or Side Panel config)
export function setApiKeyOverride(name: string, value: string) {
  if (!cachedKeys) cachedKeys = {};
  cachedKeys[name] = value;
}

// Force re-read from storage on next access (call after user edits keys in UI)
export function invalidateApiKeyCache() {
  cachedKeys = null;
}
