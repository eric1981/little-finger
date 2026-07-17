<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const currentUrl = ref('');
const domTitle = ref('');
const status = ref('idle');
const message = ref('');

// Chat state
const chatInput = ref('');
const chatMessages = ref<{ role: 'user' | 'assistant'; text: string }[]>([]);
const chatBusy = ref(false);

const chatContainer = ref<HTMLElement | null>(null);

// AI Settings
const apiKey = ref('');
const pexelsApiKey = ref('');
const showSettings = ref(false);
const aiMode = ref(false);

// Selector config
const selectorPlatform = ref('zhihu');
const selectorSaved = ref(false);
const selectorOverrides = ref<Record<string, Record<string, string>>>({
  zhihu: { titleSelector: '', publishText: '', contentText: '', confirmText: '' },
  toutiao: { titleSelector: '', previewText: '', confirmText: '', contentText: '' },
});

onMounted(async () => {
  const stored = await chrome.storage.local.get(['deepseek_api_key', 'api_keys']);
  if (stored.deepseek_api_key) {
    apiKey.value = stored.deepseek_api_key as string;
    aiMode.value = true;
  }
  const apiKeys = (stored.api_keys as Record<string, string> | undefined) || {};
  if (apiKeys.pexels) pexelsApiKey.value = apiKeys.pexels;
  status.value = 'ready';
  const aiStatus = aiMode.value ? 'AI 模式就绪' : 'AI 未配置';
  const pexelsStatus = pexelsApiKey.value ? ' · Pexels ✓' : ' · Pexels ✗';
  message.value = `${aiStatus}${pexelsStatus}`;
});

// ── DOM Sampling ──

function sampleCurrentPage() {
  status.value = 'sampling';
  message.value = '正在采样当前页面 DOM...';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      status.value = 'error';
      message.value = '没有找到活动标签页';
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SAMPLE_DOM', id: 'sample_1' }, (response) => {
      if (chrome.runtime.lastError) {
        status.value = 'error';
        message.value = `采样失败: ${chrome.runtime.lastError.message} (请刷新目标页面)`;
        return;
      }
      if (response) {
        currentUrl.value = response.data.url;
        domTitle.value = response.data.title;
        status.value = 'ready';
        message.value = `采样完成 — ${response.data.buttons.length} 按钮, ${response.data.inputs.length} 输入框`;
      }
    });
  });
}

// ── Chat / Command ──

interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
}

function parseCommand(input: string): { action: string; text?: string; value?: string; amount?: number } {
  const text = input.trim();

  // Read-only commands first (so "列出输入框" doesn't become a type command)
  if (/^列出\s*按钮|^按钮/.test(text)) return { action: 'list_buttons' };
  if (/^列出\s*输入框|^输入框/.test(text)) return { action: 'list_inputs' };
  if (/^(获取)?\s*(页面)?标题|^title$/i.test(text)) return { action: 'get_title' };
  if (/^(获取)?\s*(页面)?(链接|url|网址)$/i.test(text)) return { action: 'get_url' };

  // "点击 <按钮文字>"
  const clickMatch = text.match(/^点击\s*(.+)/);
  if (clickMatch) return { action: 'click', text: clickMatch[1].trim() };

  // "在 <标签> 输入 <内容>"  or "<标签> 输入 <内容>"
  const typeMatch = text.match(/^在\s*(.+?)\s*输入\s*(.+)/);
  if (typeMatch) return { action: 'type', text: typeMatch[1].trim(), value: typeMatch[2].trim() };
  // Fallback: just "<word> 输入 <content>" (but NOT when word starts with "列出" etc.)
  const typeMatch2 = text.match(/^(.+?)\s+输入\s+(.+)/);
  if (typeMatch2 && !/^(列出|获取|查看)/.test(typeMatch2[1])) {
    return { action: 'type', text: typeMatch2[1].trim(), value: typeMatch2[2].trim() };
  }

  // "向下滚动" / "向上滚动"
  if (/向[上下]滚动|^滚动/.test(text) && !/输入/.test(text)) {
    const dir = /向上/.test(text) ? -500 : 500;
    return { action: 'scroll', amount: dir };
  }

  // Generic read-only fallbacks
  if (/标题|title/i.test(text)) return { action: 'get_title' };
  if (/链接|url|网址/i.test(text)) return { action: 'get_url' };
  if (/按钮|button/i.test(text)) return { action: 'list_buttons' };
  if (/输入框|input/i.test(text)) return { action: 'list_inputs' };
  if (/采样|快照|snapshot|dom|查看/.test(text)) return { action: 'sample_dom' };

  return { action: 'sample_dom' };
}

// ── Settings ──

async function saveApiKey() {
  await chrome.storage.local.set({ deepseek_api_key: apiKey.value });
  aiMode.value = !!apiKey.value;

  // Save Pexels key into api_keys map (consumed by core/api-keys.ts → getApiKey)
  const existing = ((await chrome.storage.local.get('api_keys')).api_keys as Record<string, string> | undefined) || {};
  if (pexelsApiKey.value.trim()) {
    existing.pexels = pexelsApiKey.value.trim();
  } else {
    delete existing.pexels;
  }
  await chrome.storage.local.set({ api_keys: existing });

  showSettings.value = false;
  const aiStatus = aiMode.value ? 'AI 模式已启用' : 'AI 模式已关闭';
  const pexelsStatus = pexelsApiKey.value ? ' · Pexels ✓' : ' · Pexels ✗';
  message.value = `${aiStatus}${pexelsStatus}`;
  status.value = 'ready';
}

async function saveSelectorOverrides() {
  // Filter out empty values (use defaults for those)
  const clean: Record<string, Record<string, string>> = {};
  for (const platform of ['zhihu', 'toutiao']) {
    const p = selectorOverrides.value[platform];
    const entries = Object.entries(p).filter(([, v]) => v.trim());
    if (entries.length > 0) {
      clean[platform] = Object.fromEntries(entries);
    }
  }
  await chrome.storage.local.set({ selector_overrides: clean });
  selectorSaved.value = true;
  setTimeout(() => selectorSaved.value = false, 3000);
}

// ── Adapter-Driven Command Execution ──

import { ZhihuAdapter } from '../../adapters/zhihu/adapter';
import { ToutiaoAdapter } from '../../adapters/toutiao/adapter';
import { executeSteps } from '../../core/executor';

/** Extract article content from user input, stripping command prefixes */
function extractContent(rawInput: string, aiContent?: string): string {
  // If AI returned real content (short article), use it
  if (aiContent && aiContent !== 'USER_PROVIDED' && aiContent.length > 20) {
    return aiContent;
  }
  
  // Find "内容：" or "正文：" position and take everything after
  const idx = rawInput.search(/[内容正文][：:]/);
  if (idx >= 0) {
    const after = rawInput.slice(idx).replace(/^[内容正文][：:]\s*/, '');
    // Strip wrapping quotes if present
    const trimmed = after.trim();
    if ((trimmed.startsWith('「') || trimmed.startsWith('"') || trimmed.startsWith("'")) &&
        (trimmed.endsWith('」') || trimmed.endsWith('"') || trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1).trim();
    }
    return after.trim();
  }
  
  // Fallback: raw input
  return rawInput;
}

async function runAdapterWorkflow(userText: string) {
  chatBusy.value = true;
  addAssistantMessage('🤖 分析指令中...');

  // 1. AI parses intent
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) { addAssistantMessage('无活动标签页'); finishExecution('error'); return; }
    const tabId = tabs[0].id;

    chrome.runtime.sendMessage(
      { type: 'PARSE_INTENT', id: 'intent_' + Date.now(), text: userText },
      async (resp) => {
        if (!resp?.success) {
          addAssistantMessage(`解析失败: ${resp?.error || '未知'}`);
          finishExecution('error');
          return;
        }

        const { intent, platform } = resp;
        addAssistantMessage(`→ ${platform === 'zhihu' ? '知乎' : platform}: ${intent}`);

        // 2. Sample DOM to determine page state
        chrome.tabs.sendMessage(tabId, { type: 'SAMPLE_DOM', id: 'state_check' }, async (domResp) => {
          const dom = domResp?.data;
          let state: { page: string; ready: boolean; details: string } | undefined;

          if (intent === 'publish_article') {
            let adapter: ZhihuAdapter | ToutiaoAdapter;
            if (platform === 'zhihu') adapter = new ZhihuAdapter();
            else if (platform === 'toutiao') adapter = new ToutiaoAdapter();
            else { addAssistantMessage(`暂不支持: ${platform}`); finishExecution('ready'); return; }

            if (dom) {
              state = adapter.detectState(dom);
              addAssistantMessage(`📍 当前状态: ${state.details}`);
            }
            // Extract content from user input (strip command prefix)
            const content = extractContent(userText, resp.params?.content);
            console.log('[SidePanel] Extracted content, length:', content.length, 'first 100:', content.slice(0, 100));
            const steps = Array.from(adapter.publish({ 
              title: resp.params?.title || '无标题',
              content: content,
              publishType: 'public',
            }, state));

            await executeSteps(tabId, steps, (msg, type) => {
              if (type === 'wait') addAssistantMessage(msg);
              else if (type === 'info') addAssistantMessage(`⏳ ${msg}`);
              else if (type === 'success') addAssistantMessage(`✅ ${msg}`);
              else if (type === 'error') addAssistantMessage(`❌ ${msg}`);
            });
            addAssistantMessage('🎉 任务完成');
            finishExecution('ready');
          } else {
            addAssistantMessage(`暂不支持: ${intent} on ${platform}`);
            finishExecution('ready');
          }
        });
      }
    );
  });
}

// ── Legacy: Keyword-based command (AI mode off) ──

async function sendCommand() {
  const text = chatInput.value.trim();
  if (!text || chatBusy.value) return;

  chatMessages.value.push({ role: 'user', text });
  chatInput.value = '';
  chatBusy.value = true;
  message.value = '正在执行...';
  status.value = 'sampling';

  await nextTick();
  scrollToBottom();

  // AI Mode: route to adapter-driven workflow
  if (aiMode.value) {
    runAdapterWorkflow(text);
    return;
  }

  const cmd = parseCommand(text);

  // Write actions (click, type, scroll) go directly to content script
  if (cmd.action === 'click' || cmd.action === 'type' || cmd.action === 'scroll') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) { addAssistantMessage('没有找到活动标签页'); finishExecution('error'); return; }

      let msgType: string;
      let msgPayload: Record<string, unknown>;

      if (cmd.action === 'click') {
        msgType = 'FIND_AND_CLICK';
        msgPayload = { type: msgType, id: 'cmd_click', text: cmd.text };
      } else if (cmd.action === 'type') {
        msgType = 'FIND_AND_TYPE';
        msgPayload = { type: msgType, id: 'cmd_type', text: cmd.text, value: cmd.value };
      } else {
        msgType = 'SCROLL_PAGE';
        msgPayload = { type: msgType, id: 'cmd_scroll', amount: cmd.amount };
      }

      chrome.tabs.sendMessage(tabs[0].id, msgPayload, (resp) => {
        if (chrome.runtime.lastError) {
          addAssistantMessage(`操作失败: ${chrome.runtime.lastError.message}`);
          finishExecution('error');
        } else if (resp?.success) {
          addAssistantMessage(resp.message || '操作完成');
          finishExecution('ready');
        } else {
          addAssistantMessage(`操作失败: ${resp?.error || '未知错误'}`);
          finishExecution('error');
        }
      });
    });
    return;
  }

  // Read actions: sample DOM then parse
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) { addAssistantMessage('没有找到活动标签页'); finishExecution('error'); return; }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'SAMPLE_DOM', id: 'chat_sample' }, (response) => {
      if (chrome.runtime.lastError) {
        addAssistantMessage(`执行失败: ${chrome.runtime.lastError.message} (请刷新目标页面后重试)`);
        finishExecution('error');
        return;
      }

      const dom = response?.data;
      let result: CommandResult;

      switch (cmd.action) {
        case 'get_title':
          result = { success: true, message: `页面标题: ${dom.title}`, data: { title: dom.title } };
          break;
        case 'get_url':
          result = { success: true, message: `URL: ${dom.url}`, data: { url: dom.url } };
          break;
        case 'list_buttons':
          result = {
            success: true,
            message: `找到 ${dom.buttons.length} 个按钮:\n${dom.buttons.filter((b: { text: string }) => b.text).slice(0, 10).map((b: { text: string }) => `  • ${b.text}`).join('\n')}`,
            data: { buttons: dom.buttons.slice(0, 10) },
          };
          break;
        case 'list_inputs':
          result = {
            success: true,
            message: `找到 ${dom.inputs.length} 个输入框:\n${dom.inputs.map((i: { tag: string; placeholder: string; type: string }) => `  • <${i.tag}> ${i.placeholder || i.type || '(空)'}`).join('\n')}`,
            data: { inputs: dom.inputs },
          };
          break;
        case 'sample_dom':
        default:
          currentUrl.value = dom.url;
          domTitle.value = dom.title;
          result = {
            success: true,
            message: `页面: ${dom.title}\nURL: ${dom.url}\n${dom.buttons.length} 按钮, ${dom.inputs.length} 输入框\n\n信号: ${dom.signals.join(', ') || '无'}`,
            data: dom,
          };
      }

      addAssistantMessage(result.message);
      finishExecution(result.success ? 'ready' : 'error');
    });
  });
}

function addAssistantMessage(text: string) {
  chatMessages.value.push({ role: 'assistant', text });
  nextTick(() => scrollToBottom());
}

function finishExecution(s: string) {
  status.value = s;
  message.value = s === 'ready' ? '就绪' : '执行出错';
  chatBusy.value = false;
}

function scrollToBottom() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCommand();
  }
}
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>🖐️ Little Finger</h1>
      <span class="badge">{{ aiMode ? 'AI' : 'v0.1' }}</span>
      <button class="settings-btn" @click="showSettings = !showSettings" :title="aiMode ? 'AI 已配置' : '配置 AI'">⚙</button>
    </header>

    <!-- Settings Panel -->
    <div v-if="showSettings" class="settings-panel">
      <label>DeepSeek API Key</label>
      <input v-model="apiKey" type="password" placeholder="sk-..." />
      <label>Pexels API Key <span style="color:#999">(用于封面图搜索)</span></label>
      <input v-model="pexelsApiKey" type="password" placeholder="留空则禁用封面图自动搜索" />
      <button class="btn-save" @click="saveApiKey">保存</button>
      <p class="hint-text">Key 仅存储在本地浏览器中</p>
      
      <hr style="margin:8px 0;border-color:#eee">
      <label style="font-weight:600">选择器覆盖 (Selector Overrides)</label>
      <p class="hint-text">留空使用默认值。填入后覆盖默认，下次执行生效。</p>
      
      <select v-model="selectorPlatform" style="padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px">
        <option value="zhihu">知乎</option>
        <option value="toutiao">头条</option>
      </select>
      
      <template v-if="selectorPlatform === 'zhihu'">
        <label>标题选择器</label>
        <input v-model="selectorOverrides.zhihu.titleSelector" placeholder="默认: textarea[placeholder*=标题]" />
        <label>发布按钮文字</label>
        <input v-model="selectorOverrides.zhihu.publishText" placeholder="默认: 发布" />
        <label>正文匹配文字</label>
        <input v-model="selectorOverrides.zhihu.contentText" placeholder="默认: 请输入正文" />
      </template>
      
      <template v-if="selectorPlatform === 'toutiao'">
        <label>标题选择器</label>
        <input v-model="selectorOverrides.toutiao.titleSelector" placeholder="默认: textarea[placeholder*=文章标题]" />
        <label>预览按钮文字</label>
        <input v-model="selectorOverrides.toutiao.previewText" placeholder="默认: 预览并发布" />
        <label>确认按钮文字</label>
        <input v-model="selectorOverrides.toutiao.confirmText" placeholder="默认: 确认发布" />
        <label>正文匹配文字</label>
        <input v-model="selectorOverrides.toutiao.contentText" placeholder="默认: 请输入正文" />
      </template>
      
      <button class="btn-save" @click="saveSelectorOverrides">保存选择器</button>
      <p class="hint-text" style="color:#4caf50" v-if="selectorSaved">✅ 已保存，下次执行生效</p>
    </div>

    <div class="status-bar" :class="status">
      <span class="dot"></span>
      <span>{{ message }}</span>
    </div>

    <!-- Chat Messages -->
    <div class="chat-messages" ref="chatContainer">
      <div v-for="(msg, i) in chatMessages" :key="i" class="chat-msg" :class="msg.role">
        <div class="msg-bubble">{{ msg.text }}</div>
      </div>
    </div>

    <!-- Sample result (compact, shown when sampled) -->
    <section v-if="currentUrl && chatMessages.length === 0" class="sample-result">
      <h3>📄 最近快照</h3>
      <div class="field"><label>URL</label><code>{{ currentUrl }}</code></div>
      <div class="field"><label>标题</label><code>{{ domTitle }}</code></div>
    </section>

    <!-- Chat Input -->
    <div class="chat-input-area">
      <input
        v-model="chatInput"
        type="text"
        placeholder="输入指令，例如: 获取页面标题 / 列出按钮 / 获取正文..."
        :disabled="chatBusy"
        @keydown="handleKeydown"
      />
      <div class="hints">
        <span class="hint" @click="chatInput='获取页面标题'; sendCommand()">📋 标题</span>
        <span class="hint" @click="chatInput='列出按钮'; sendCommand()">🔘 按钮</span>
        <span class="hint" @click="chatInput='列出输入框'; sendCommand()">📝 输入框</span>
        <span class="hint" @click="chatInput='向下滚动'; sendCommand()">⬇ 滚动</span>
        <span class="hint" @click="chatInput='点击 写文章'; sendCommand()">🖱 点击写文章</span>
      </div>
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; }

.app {
  padding: 12px;
  color: #1a1a2e;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.header h1 { font-size: 16px; }
.badge {
  font-size: 10px;
  background: #e8e8e8;
  padding: 1px 5px;
  border-radius: 3px;
  color: #666;
}
.badge:contains('AI') { background: #e8f0fe; color: #1a73e8; }
.settings-btn {
  margin-left: auto;
  background: none;
  border: 1px solid #ddd;
  border-radius: 50%;
  width: 24px; height: 24px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-panel {
  background: #f8f9fa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.settings-panel label { font-size: 11px; color: #666; }
.settings-panel input {
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
}
.btn-save {
  padding: 6px 12px;
  background: #1a73e8;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.hint-text { font-size: 10px; color: #999; margin: 0; }

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: #f0f0f0;
  flex-shrink: 0;
}
.status-bar.ready { background: #e8f5e9; }
.status-bar.sampling { background: #fff3e0; }
.status-bar.error { background: #ffebee; }
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #4caf50;
  flex-shrink: 0;
}
.status-bar.sampling .dot { background: #ff9800; animation: pulse 1s infinite; }
.status-bar.error .dot { background: #f44336; }
@keyframes pulse { 50% { opacity: 0.4; } }

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}
.chat-msg { display: flex; }
.chat-msg.user { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }
.msg-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
.chat-msg.user .msg-bubble {
  background: #1a73e8;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.chat-msg.assistant .msg-bubble {
  background: #f1f3f4;
  color: #1a1a2e;
  border-bottom-left-radius: 4px;
}

/* Sample result */
.sample-result {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  flex-shrink: 0;
}
.sample-result h3 { font-size: 12px; margin-bottom: 6px; }
.field { margin-bottom: 4px; }
.field label { font-size: 10px; color: #999; display: block; }
.field code {
  font-size: 11px;
  background: #fff;
  padding: 3px 6px;
  border-radius: 3px;
  display: block;
  word-break: break-all;
  border: 1px solid #eee;
}

/* Chat Input */
.chat-input-area { flex-shrink: 0; }
.chat-input-area input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.chat-input-area input:focus { border-color: #1a73e8; }
.chat-input-area input:disabled { background: #f5f5f5; }
.hints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.hint {
  font-size: 11px;
  color: #1a73e8;
  background: #e8f0fe;
  padding: 3px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.hint:hover { background: #d2e3fc; }
</style>
