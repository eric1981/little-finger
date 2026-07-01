import { AIEngine } from '../core/ai';
import { ZhihuAdapter, updateZhihuConfig } from '../adapters/zhihu/adapter';
import { ToutiaoAdapter, updateToutiaoConfig } from '../adapters/toutiao/adapter';
import { BaijiahaoAdapter, updateBaijiahaoConfig } from '../adapters/baijiahao/adapter';
import { PenguinAdapter, updatePenguinConfig } from '../adapters/penguin/adapter';
import { executeSteps, executeOneStep } from '../core/executor';
import { getApiKey } from '../core/api-keys';

let nativePort: chrome.runtime.Port | null = null;

export default defineBackground(() => {
  console.log('[LF:BG] Service Worker started');

  // Load selector configs from storage on startup
  loadSelectorConfigs();

  // ── Native Messaging: bridge to agent (Hermes) ──
  try {
    nativePort = chrome.runtime.connectNative('com.littlefinger');
    
    nativePort.onMessage.addListener(async (msg: unknown) => {
      const cmd = msg as {
        _id?: string; action: string; platform: string;
        title?: string; content?: string; params?: Record<string, unknown>;
      };
      console.log('[LF:BG] Native command:', cmd.action, cmd.platform);
      
      const result = await executeCommand(cmd);
      
      nativePort?.postMessage({
        _id: cmd._id, success: result.success,
        message: result.message, data: result.data,
      });
    });
    
    nativePort.onDisconnect.addListener(() => {
      console.log('[LF:BG] Native host disconnected, reconnecting in 5s...');
      setTimeout(() => {
        try { nativePort = chrome.runtime.connectNative('com.littlefinger'); } catch {}
      }, 5000);
    });
    
    console.log('[LF:BG] Native Messaging connected');
  } catch (err) {
    console.warn('[LF:BG] Native Messaging not available:', err);
  }

  // ── Side Panel: AI intent parsing ──
  browser.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as { type: string; id: string; text?: string };
    if (m.type === 'PARSE_INTENT') return handleParseIntent(m);
    if (m.type === 'SEARCH_PEXELS') return handlePexelsSearch(m);
  });
});

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

async function executeCommand(cmd: {
  action: string; platform: string;
  title?: string; content?: string; params?: Record<string, unknown>;
}) {
  try {
    if (cmd.action === 'publish_article') {
      const title = cmd.title || cmd.params?.title as string || '无标题';
      const content = cmd.content || cmd.params?.content as string || '';

      let adapter: ZhihuAdapter | ToutiaoAdapter | BaijiahaoAdapter | PenguinAdapter;
      let detectUrl: string;

      if (cmd.platform === 'zhihu') {
        adapter = new ZhihuAdapter();
        detectUrl = 'https://www.zhihu.com';
      } else if (cmd.platform === 'toutiao') {
        adapter = new ToutiaoAdapter();
        detectUrl = 'https://mp.toutiao.com/profile_v4/index';
      } else if (cmd.platform === 'baijiahao') {
        adapter = new BaijiahaoAdapter();
        detectUrl = 'https://baijiahao.baidu.com/builder/rc/home';
      } else if (cmd.platform === 'qiehao') {
        adapter = new PenguinAdapter();
        detectUrl = 'https://om.qq.com/main';
      } else {
        return { success: false, message: `不支持的平台: ${cmd.platform}`, data: null };
      }

      const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
      if (!tab.id) return { success: false, message: '无法创建标签页', data: null };

      let state: { page: string; ready: boolean; details: string } | undefined;
      try {
        chrome.tabs.update(tab.id, { url: detectUrl, active: true });
        await sleep(2000);
        const domResp = await sendToTab(tab.id, { type: 'SAMPLE_DOM', id: 'detect' });
        if (domResp?.data) {
          state = adapter.detectState(domResp.data);
        }
      } catch { /* proceed without state */ }

      const docxB64 = cmd.params?.docxB64 as string | undefined;
      const steps = Array.from(adapter.publish({ title, content, publishType: 'public', docxB64 }, state));
      const result = await executeSteps(tab.id, steps, (msg, type) => {
        console.log(`[LF:BG] ${type}: ${msg}`);
      });

      return { success: result.success, message: result.message, data: { title } };
    }

    if (cmd.action === 'get_article_url') {
      const platformUrls: Record<string, string> = {
        zhihu: 'https://www.zhihu.com/creator/manage/creation/all',
        toutiao: 'https://mp.toutiao.com/profile_v4/graphic/articles',
        baijiahao: 'https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=',
        qiehao: 'https://om.qq.com/main/management/articleManage',
      };
      const mgmtUrl = platformUrls[cmd.platform];
      if (!mgmtUrl) return { success: false, message: `未知平台: ${cmd.platform}`, data: null };

      const tab = await chrome.tabs.create({ url: mgmtUrl, active: true });
      await sleep(5000);

      const urlResult = await executeOneStep(
        tab.id!, 
        { type: 'get_article_url', target: mgmtUrl, value: cmd.title || '', reason: '' }, 
        (msg, type) => console.log(`[LF:BG] ${type}: ${msg}`)
      );
      return urlResult.success ? { success: true, message: urlResult.message, data: urlResult.data }
                               : { success: false, message: urlResult.message, data: null };
    }

    return { success: false, message: `不支持: ${cmd.action} on ${cmd.platform}`, data: null };
  } catch (err) {
    return { success: false, message: String(err), data: null };
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
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
    const resp = await fetch(url, { headers: { Authorization: await getApiKey('pexels') } });
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
