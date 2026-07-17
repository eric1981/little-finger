import { AIEngine } from '../core/ai';
import { ZhihuAdapter, updateZhihuConfig } from '../adapters/zhihu/adapter';
import { ToutiaoAdapter, updateToutiaoConfig } from '../adapters/toutiao/adapter';
import { BaijiahaoAdapter, updateBaijiahaoConfig } from '../adapters/baijiahao/adapter';
import { PenguinAdapter, updatePenguinConfig } from '../adapters/penguin/adapter';
import { SmzdmAdapter, updateSmzdmConfig } from '../adapters/smzdm/adapter';
import { XiaohongshuAdapter, updateXiaohongshuConfig } from '../adapters/xiaohongshu/adapter';
import { DouyinAdapter, updateDouyinConfig } from '../adapters/douyin/adapter';
import { executeSteps, executeOneStep } from '../core/executor';
import { getApiKey } from '../core/api-keys';
import type { DomSnapshot, PageState } from '../core/types';

let nativePort: chrome.runtime.Port | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCommands = 0;

export default defineBackground(() => {
  console.log('[LF:BG] Service Worker started');

  // Load selector configs from storage on startup
  loadSelectorConfigs();

  // ── Native Messaging: bridge to agent (Hermes) ──
  connectNative();

  // ── Side Panel: AI intent parsing ──
  browser.runtime.onMessage.addListener((msg: unknown, sender: unknown) => {
    const m = msg as { type: string; id: string; text?: string; code?: string };
    if (m.type === 'PARSE_INTENT') return handleParseIntent(m);
    if (m.type === 'SEARCH_PEXELS') return handlePexelsSearch(m);
    if (m.type === 'GET_DOUYIN_URL') {
      // Find new tab opened with work-detail URL, extract ID
      return (async () => {
        for (let i = 0; i < 15; i++) {
          const tabs = await chrome.tabs.query({});
          const detail = tabs.find(t => t.url?.includes('work-detail'));
          if (detail?.url) {
            const idMatch = detail.url.match(/work-detail\/(\d+)/);
            if (idMatch) return { url: 'https://www.douyin.com/article/' + idMatch[1] };
          }
          await new Promise(r => setTimeout(r, 500));
        }
        return { error: 'no new tab' };
      })();
    }
    if (m.type === 'EXECUTE_IN_MAIN') {
      const cmd = m as { type: string; id: string; code: string; tabId: number };
      if (!cmd.tabId) return { error: 'no tabId' };
      return (async () => {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: cmd.tabId },
            world: 'MAIN',
            func: async () => {
              // Warm up: click editor to focus before hovering toolbar
              const ed = document.querySelector('#ueditor_0') as HTMLIFrameElement | null;
              if (ed?.contentDocument?.body) ed.contentDocument.body.click();

              const h = document.querySelector('#edui40_state');
              if (!h) return { error: 'hover' };
              const r = h.getBoundingClientRect();
              h.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true, clientX:r.left+5, clientY:r.top+5 }));
              await new Promise(r2 => setTimeout(r2, 1500));

              const btn = [...document.querySelectorAll('div')]
                .find(d => d.textContent!.trim() === '导入文档');
              if (!btn) return { error: 'menu' };
              (btn as HTMLElement).click();
              await new Promise(r2 => setTimeout(r2, 2000));
              return document.querySelector('input[name="file"]') ? { ok:1 } : { error: 'input' };
            },
          });
          return result?.result || { error: 'no result' };
        } catch (e: any) { return { error: e.message }; }
      })();
    }
  });
});

// ── Native Messaging connection (with proper re-binding on reconnect) ──

function connectNative(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    nativePort = chrome.runtime.connectNative('com.littlefinger');

    nativePort.onMessage.addListener(async (msg: unknown) => {
      const cmd = msg as {
        _id?: string; action: string; platform: string;
        title?: string; content?: string; params?: Record<string, unknown>;
      };
      console.log('[LF:BG] Native command:', cmd.action, cmd.platform);

      pendingCommands++;
      try {
        const result = await executeCommand(cmd);
        nativePort?.postMessage({
          _id: cmd._id, success: result.success,
          message: result.message, data: result.data,
        });
      } catch (err) {
        // Should not happen — executeCommand has its own try/catch — but be defensive
        nativePort?.postMessage({
          _id: cmd._id, success: false,
          message: `Background error: ${String(err)}`, data: null,
        });
      } finally {
        pendingCommands--;
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const lastErr = chrome.runtime.lastError;
      console.warn('[LF:BG] Native host disconnected',
        lastErr ? `(${lastErr.message})` : '',
        pendingCommands > 0 ? `with ${pendingCommands} pending command(s)` : '',
        '— reconnecting in 5s...');
      nativePort = null;
      // Drain pending command responses with error so CLI doesn't wait until timeout
      // (Cannot recover the original _id here — host/CLI will time out, which is acceptable)
      scheduleReconnect();
    });

    console.log('[LF:BG] Native Messaging connected');
  } catch (err) {
    console.warn('[LF:BG] Native Messaging not available:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 5000);
}

// ── Command Execution (shared by Native + Side Panel) ──

async function loadSelectorConfigs() {
  // Load overrides from chrome.storage (populated by Side Panel config UI)
  const stored = await chrome.storage.local.get('selector_overrides');
  const overrides: Record<string, Record<string, string>> = stored.selector_overrides || {};

  if (overrides.zhihu) {
    updateZhihuConfig({
      titleSelector: overrides.zhihu.titleSelector,
      publishText: overrides.zhihu.publishText,
      contentText: overrides.zhihu.contentText,
      confirmText: overrides.zhihu.confirmText,
    });
  }

  if (overrides.toutiao) {
    updateToutiaoConfig({
      titleSelector: overrides.toutiao.titleSelector,
      previewText: overrides.toutiao.previewText,
      confirmText: overrides.toutiao.confirmText,
      contentText: overrides.toutiao.contentText,
    });
  }

  console.log('[LF:BG] Selector configs loaded', overrides);
}

type PublishAdapter =
  | ZhihuAdapter | ToutiaoAdapter | BaijiahaoAdapter | PenguinAdapter
  | SmzdmAdapter | XiaohongshuAdapter | DouyinAdapter;

function resolveAdapter(platform: string): { adapter: PublishAdapter; detectUrl: string } | { error: string } {
  if (platform === 'zhihu')    return { adapter: new ZhihuAdapter(),    detectUrl: 'https://www.zhihu.com' };
  if (platform === 'toutiao')  return { adapter: new ToutiaoAdapter(),  detectUrl: 'https://mp.toutiao.com/profile_v4/index' };
  if (platform === 'baijiahao')return { adapter: new BaijiahaoAdapter(),detectUrl: 'https://baijiahao.baidu.com/builder/rc/home' };
  if (platform === 'qiehao')   return { adapter: new PenguinAdapter(),  detectUrl: 'https://om.qq.com/main' };
  if (platform === 'smzdm')    return { adapter: new SmzdmAdapter(),    detectUrl: 'https://post.smzdm.com' };
  if (platform === 'xiaohongshu') return { adapter: new XiaohongshuAdapter(), detectUrl: 'https://creator.xiaohongshu.com/new/home' };
  if (platform === 'douyin')   return { adapter: new DouyinAdapter(),   detectUrl: 'https://creator.douyin.com/creator-micro/content/upload' };
  return { error: `不支持的平台: ${platform}` };
}

async function executeCommand(cmd: {
  action: string; platform: string;
  title?: string; content?: string; params?: Record<string, unknown>;
}) {
  let tabId: number | null = null;
  let shouldCloseTabOnFailure = false;

  try {
    if (cmd.action === 'publish_article') {
      const title = cmd.title || cmd.params?.title as string || '无标题';
      const content = cmd.content || cmd.params?.content as string || '';

      const resolved = resolveAdapter(cmd.platform);
      if ('error' in resolved) return { success: false, message: resolved.error, data: null };
      const { adapter, detectUrl } = resolved;

      const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
      if (!tab.id) return { success: false, message: '无法创建标签页', data: null };
      tabId = tab.id;
      shouldCloseTabOnFailure = true;

      let state: PageState | undefined;
      try {
        await chrome.tabs.update(tabId, { url: detectUrl, active: true });
        await sleep(2000);
        const domResp = await sendToTab(tabId, { type: 'SAMPLE_DOM', id: 'detect' });
        if (domResp?.data) {
          // domResp.data is loosely typed from content script — validate shape before trusting
          const d = domResp.data as Partial<DomSnapshot>;
          if (d && typeof d.url === 'string' && Array.isArray(d.signals)) {
            state = adapter.detectState(d as DomSnapshot);
          } else {
            console.warn('[LF:BG] Malformed DOM sample, proceeding without state');
          }
        }
      } catch (err) {
        // proceed without state — do NOT silently swallow; log for diagnostics
        console.warn('[LF:BG] State detection failed, proceeding without state:', err);
      }

      const docxB64 = cmd.params?.docxB64 as string | undefined;
      const steps = Array.from(adapter.publish({ title, content, publishType: 'public', docxB64 }, state));
      const result = await executeSteps(tabId, steps, (msg, type) => {
        console.log(`[LF:BG] ${type}: ${msg}`);
      });

      // Publish succeeded — leave tab open so user can verify / manage it
      if (result.success) shouldCloseTabOnFailure = false;

      return { success: result.success, message: result.message, data: { title } };
    }

    if (cmd.action === 'get_article_url') {
      const platformUrls: Record<string, string> = {
        zhihu: 'https://www.zhihu.com/creator/manage/creation/all',
        toutiao: 'https://mp.toutiao.com/profile_v4/graphic/articles',
        baijiahao: 'https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=',
        qiehao: 'https://om.qq.com/main/management/articleManage',
        smzdm: 'https://zhiyou.smzdm.com/user/article/',
        xiaohongshu: 'https://creator.xiaohongshu.com/new/note-manager',
        douyin: 'https://creator.douyin.com/creator-micro/content/manage',
      };
      const mgmtUrl = platformUrls[cmd.platform];
      if (!mgmtUrl) return { success: false, message: `未知平台: ${cmd.platform}`, data: null };

      const tab = await chrome.tabs.create({ url: mgmtUrl, active: true });
      if (!tab.id) return { success: false, message: '无法创建标签页', data: null };
      tabId = tab.id;
      shouldCloseTabOnFailure = true;
      await sleep(5000);

      const urlResult = await executeOneStep(
        tab.id,
        { type: 'get_article_url', target: mgmtUrl, value: cmd.title || '', reason: '' },
        (msg, type) => console.log(`[LF:BG] ${type}: ${msg}`)
      );
      if (urlResult.success) shouldCloseTabOnFailure = false;
      return urlResult.success
        ? { success: true, message: urlResult.message, data: urlResult.data }
        : { success: false, message: urlResult.message, data: null };
    }

    return { success: false, message: `不支持: ${cmd.action} on ${cmd.platform}`, data: null };
  } catch (err) {
    return { success: false, message: String(err), data: null };
  } finally {
    // P2.2: Close tab on failure to prevent tab accumulation
    if (shouldCloseTabOnFailure && tabId !== null) {
      try {
        await chrome.tabs.remove(tabId);
        console.log(`[LF:BG] Closed failed tab ${tabId}`);
      } catch (err) {
        // Tab may already be closed by user — ignore
      }
    }
  }
}

// ── AI Intent Parsing (for Side Panel) ──

async function handleParseIntent(m: { type: string; id: string; text?: string }) {
  try {
    const stored = await chrome.storage.local.get('deepseek_api_key');
    const apiKey = stored.deepseek_api_key as string | undefined;
    if (!apiKey) {
      return { type: 'PARSE_RESULT', id: m.id, success: false, error: '请先配置 API Key' };
    }

    const ai = new AIEngine({ apiKey });
    const response = await ai.chat([
      { role: 'system', content: `你是意图解析器。返回JSON: {"intent":"publish_article","platform":"zhihu","params":{"title":"...","content":"USER_PROVIDED"}}。content永远返回USER_PROVIDED。` },
      { role: 'user', content: m.text || '' },
    ]);

    let parsed = parseAIJson(response.content);
    if (!parsed) {
      return { type: 'PARSE_RESULT', id: m.id, success: false, error: '无法解析AI响应' };
    }

    return { type: 'PARSE_RESULT', id: m.id, success: true, intent: parsed.intent, platform: parsed.platform, params: parsed.params };
  } catch (err) {
    return { type: 'PARSE_RESULT', id: m.id, success: false, error: String(err) };
  }
}

// ── Helpers ──

function sendToTab(tabId: number, msg: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      resolve(chrome.runtime.lastError ? undefined : resp);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function parseAIJson(text: string): Record<string, unknown> | null {
  const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1]); } catch {} }
  const brace = findBalancedJson(text);
  if (brace) { try { return JSON.parse(brace); } catch {} }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ── Pexels Image Search (runs in Background SW to avoid CORS) ──

async function handlePexelsSearch(m: { type: string; id: string; text?: string }) {
  try {
    const query = m.text || 'abstract';
    const apiKey = await getApiKey('pexels');
    if (!apiKey) {
      return { success: false, error: '未配置 Pexels API Key（在 Side Panel → ⚙ 中设置）' };
    }
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=square&size=large`;
    const resp = await fetch(url, { headers: { Authorization: apiKey } });
    if (!resp.ok) return { success: false, error: `Pexels API: ${resp.status}` };

    const data = await resp.json();
    if (!data.photos?.length) return { success: false, error: '无搜索结果' };

    return {
      success: true,
      imageUrl: data.photos[0].src.large,
      alt: data.photos[0].alt || query,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function findBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
