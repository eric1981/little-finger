import { defineContentScript } from 'wxt/sandbox';
import * as mammoth from 'mammoth';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    console.log('[LF:CS] Injected:', window.location.href);

    async function handleCommand(msg: unknown): Promise<any> {
      const m = msg as { type: string; id?: string; text?: string; value?: string; amount?: number; selector?: string; action?: string };
      
      if (m.type === 'SAMPLE_DOM') {
        return Promise.resolve({ type: 'DOM_SAMPLE', id: m.id, data: sampleDom() });
      }
      
      // ── High-level: find element by visible text and click ──
      if (m.type === 'FIND_AND_CLICK') {
        return findAndClick(m.text || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── High-level: find input by placeholder/label and type ──
      if (m.type === 'FIND_AND_TYPE') {
        return findAndType(m.text || '', m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── Page-level scroll ──
      if (m.type === 'SCROLL_PAGE') {
        return scrollPage(m.amount || 500).then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── Direct CSS selector type (bypass React controlled inputs) ──
      if (m.type === 'TYPE_SELECTOR') {
        return typeBySelector(m.selector || m.text || '', m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── Upload cover image: search Pexels → fetch → file input → confirm ──
      if (m.type === 'UPLOAD_COVER') {
        return uploadCoverImage(m.text || '', m.value || '')
          .then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }))
          .catch(err => ({ type: 'ACTION_RESULT', id: m.id, success: false, error: String(err) }));
      }

      // ── Type into iframe editor ──
      if (m.type === 'TYPE_IFRAME') {
        return typeIntoIframe(m.selector || '', m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }

      // ── Import .docx file ──
      if (m.type === 'IMPORT_DOCX') {
        return importDocx(m.value || '', m.selector || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }

      // ── Import .docx file (Baijiahao 3-step: hover → click import → click file btn) ──
      if (m.type === 'IMPORT_DOCX_BJH') {
        return bjhImportDocx(m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }

      // ── Import .docx file (Zhihu 2-step: click 导入 → click 导入文档) ──
      if (m.type === 'IMPORT_DOCX_ZHIHU') {
        return zhihuImportDocx(m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }

      // ── Inject image (Pexels + DataTransfer) ──
      if (m.type === 'INJECT_IMAGE') {
        return injectImage(m.text || '', m.selector || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── Get article public URL from management page ──
      if (m.type === 'GET_ARTICLE_URL') {
        return getArticleUrl(m.value || '').then(r => ({ type: 'ACTION_RESULT', id: m.id, ...r }));
      }
      
      // ── Ping (health check for content script readiness) ──
      if (m.type === 'PING') {
        return { type: 'PONG', id: m.id };
      }
      
      // ── Low-level: raw selector action ──
      if (m.type === 'EXECUTE_ACTION') {
        return executeAction(m as { selector: string; action: string; value?: string }).then(r => ({
          type: 'ACTION_RESULT', id: m.id, ...r,
        }));
      }
    }

    browser.runtime.onMessage.addListener(handleCommand);

    // Fallback: polling channel for smzdm (probev3.js blocks chrome.runtime)
    setInterval(() => {
      const cmd = (window as any).__lf_cmd;
      if (!cmd) return;
      delete (window as any).__lf_cmd;
      handleCommand(cmd).then(r => {
        (window as any).__lf_result = r;
      });
    }, 200);
  },
});

// ─── Human-like delays ───

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ─── Element Finders ───

function findByLabel(text: string): Element | null {
  // Try label[for] → input
  const labels = document.querySelectorAll('label');
  for (const label of labels) {
    if (label.textContent?.includes(text)) {
      const htmlFor = label.getAttribute('for');
      if (htmlFor) {
        const target = document.getElementById(htmlFor);
        if (target) return target;
      }
      // Label wrapping input
      const input = label.querySelector('input, textarea, select');
      if (input) return input;
    }
  }
  return null;
}

function findByPlaceholder(text: string): Element | null {
  const inputs = document.querySelectorAll('input, textarea');
  for (const el of inputs) {
    if (el.getAttribute('placeholder')?.includes(text)) return el;
  }
  return null;
}

function findByVisibleText(text: string): Element | null {
  // Score candidates: prefer exact match, then contains, then partial
  const candidates = document.querySelectorAll(
    'button, a, [role="button"], span, div, li, [class*="btn"], [class*="tab"]'
  );
  
  let best: { el: Element; score: number } | null = null;
  
  for (const el of candidates) {
    let rect = el.getBoundingClientRect();
    // SPAN often has zero dimensions but is inside a visible container
    if ((rect.width === 0 || rect.height === 0) && el.tagName === 'SPAN' && el.parentElement) {
      rect = el.parentElement.getBoundingClientRect();
    }
    if (rect.width === 0 || rect.height === 0) continue;
    
    const elText = (el.textContent || '').trim();
    if (!elText) continue;
    
    let score = 0;
    if (elText === text) score = 100;
    else if (elText.startsWith(text)) score = 80;
    else if (elText.includes(text)) score = 50;
    else continue;
    
    // Prefer buttons and links
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'a') score += 10;
    if (el.getAttribute('role') === 'button') score += 10;
    
    if (!best || score > best.score) {
      best = { el, score };
    } else if (score === best.score) {
      // Equal score: prefer smaller element (more specific, likely handler target)
      const prevArea = best.el.getBoundingClientRect().width * best.el.getBoundingClientRect().height;
      const thisArea = rect.width * rect.height;
      if (thisArea < prevArea) best = { el, score };
    }
  }
  
  return best?.el || null;
}

// ─── Human Behavior Simulation ───

/** Human-like delay: log-normal distribution around base */
function humanDelay(baseMs: number, variance = 0.4): number {
  return Math.round(baseMs * (0.6 + Math.random() * variance * 2));
}

/** Thinking pause: longer, simulating reading/decision time */
function thinkingPause(): Promise<void> {
  return wait(randomBetween(400, 1200));
}

/** Micro-pause between words when typing */
function wordPause(): Promise<void> {
  return wait(randomBetween(80, 250));
}

// ─── High-Level Actions ───

async function findAndClick(text: string) {
  if (!text) return { success: false, error: 'No text to search for' };
  
  const el = findByVisibleText(text);
  if (!el) return { success: false, error: `找不到包含 "${text}" 的按钮或链接` };
  
  try {
    const el2 = el as HTMLElement;
    el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(humanDelay(350, 0.5));  // scroll settle
    
    // Human-like: hover before click
    el2.focus();
    await wait(randomBetween(120, 350)); // "finding the button"
    el2.click();
    // Traverse up to find the clickable container (React handler may be 2-3 levels up)
    if (el2.tagName === 'SPAN') {
      let parent: HTMLElement | null = el2.parentElement;
      for (let i = 0; i < 4 && parent; i++) {
        reactClick(parent);
        parent = parent.parentElement;
      }
    }
    await wait(randomBetween(250, 600)); // post-click reaction
    
    return { success: true, message: `已点击 "${text}"`, selector: buildSelector(el2) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function findAndType(labelOrPlaceholder: string, value: string) {
  if (!labelOrPlaceholder) return { success: false, error: 'No label/placeholder to search for' };
  if (!value) return { success: false, error: 'No value to type' };
  
  let el: HTMLElement | null = null;

  // 1. Try placeholder match
  el = findByPlaceholder(labelOrPlaceholder);
  
  // 2. Try label match
  if (!el) el = findByLabel(labelOrPlaceholder);
  
  // 3. Try contenteditable (rich text editor like Zhihu)
  if (!el) el = findContentEditable(labelOrPlaceholder);
  
  // 4. Try visible text match (input/textarea)
  if (!el) el = findByVisibleText(labelOrPlaceholder);
  
  // 5. Try any input near matching text
  if (!el) {
    const labelEl = findByVisibleText(labelOrPlaceholder);
    if (labelEl) {
      el = labelEl.closest('div, form, fieldset, section')?.querySelector('input, textarea, [contenteditable="true"]') as HTMLElement | null;
    }
  }
  
  // 6. Last resort: find any contenteditable on page
  if (!el) {
    const editables = document.querySelectorAll('[contenteditable="true"]');
    if (editables.length === 1) el = editables[0] as HTMLElement;
  }
  
  if (!el) return { success: false, error: `找不到 "${labelOrPlaceholder}" 对应的输入框` };
  
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(300);
    
    // Type into input/textarea (React-controlled compat)
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      await wait(randomBetween(100, 300));
      
      // For React-controlled inputs, use native setter to bypass React's value tracking
      const nativeSetter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        'value'
      )?.set;
      
      if (nativeSetter) {
        // Clear via native setter
        nativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(50);
        // Set via native setter
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
      
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    } else {
      // contenteditable rich text editor (Draft.js, Quill, etc.)
      el.focus();
      await thinkingPause(); // "thinking about what to write"
      
      // Clear existing content
      document.execCommand('selectAll', false);
      await wait(humanDelay(80));
      
      // HTML content (from docx conversion): insert one paragraph at a time
      if (/^<[a-z]+[>\s]/.test(value)) {
        const paras = value.split(/(?=<p>)/i);
        let first = true;
        for (const para of paras) {
          if (!para.trim()) continue;
          if (first) {
            document.execCommand('insertHTML', false, para);
            first = false;
          } else {
            document.execCommand('insertHTML', false, para);
          }
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          await wait(randomBetween(100, 300));
        }
      } else {
      // Plain text: type in chunks to simulate human writing (anti-bot)
      const CHUNK_SIZE = 40; // characters per "burst"
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      
      // First chunk replaces existing, rest append
      for (let ci = 0; ci < chunks.length; ci++) {
        if (ci === 0) {
          document.execCommand('insertText', false, chunks[ci]);
        } else {
          // Move cursor to end before inserting
          const sel = window.getSelection();
          if (sel) {
            sel.selectAllChildren(el);
            sel.collapseToEnd();
          }
          document.execCommand('insertText', false, chunks[ci]);
        }
        
        // Dispatch input event per chunk
        el.dispatchEvent(new InputEvent('input', {
          inputType: 'insertText', data: chunks[ci], bubbles: true, cancelable: true,
        }));
        
        // Pause between chunks (simulates thinking)
        if (ci < chunks.length - 1) {
          await wait(randomBetween(200, 600)); // 0.2-0.6s per chunk
        }
      }
      } // end else (plain text)
      
      el.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText', data: value, bubbles: true, cancelable: true,
      }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      
      await wordPause(); // micro-pause after finishing
    }
    
    await wait(randomBetween(200, 400));
    
    return { success: true, message: `已在 "${labelOrPlaceholder}" 输入 "${value.slice(0, 30)}${value.length > 30 ? '...' : ''}"`, selector: buildSelector(el) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function findContentEditable(contextText: string): Element | null {
  // Find contenteditable elements, score by proximity to context text
  const editables = document.querySelectorAll('[contenteditable="true"]');
  if (editables.length === 0) return null;
  
  // Check if any label/text near the editable matches
  for (const el of editables) {
    const parent = el.closest('div, form, section, fieldset');
    if (parent && parent.textContent?.includes(contextText)) {
      return el;
    }
  }
  
  // Fallback: return the largest visible contenteditable
  let best: { el: Element; area: number } | null = null;
  for (const el of editables) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && (!best || area > best.area)) {
      best = { el, area };
    }
  }
  
  return best?.el || null;
}

async function typeBySelector(selector: string, value: string) {
  if (!selector) return { success: false, error: 'No selector' };
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (!el) return { success: false, error: `Element not found: ${selector}` };

  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(200);
    el.focus();
    await wait(100);

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(50);
        nativeSetter.call(el, value);
      } else {
        el.value = value;
      }
    } else {
      // contenteditable fallback
      document.execCommand('selectAll', false);
      await wait(50);
      document.execCommand('insertText', false, value);
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    return { success: true, message: `已通过 ${selector} 输入内容`, selector };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function scrollPage(amount: number) {
  try {
    const sign = Math.sign(amount);
    const absAmount = Math.abs(amount) * (0.7 + Math.random() * 0.6); // ±30% jitter
    
    window.scrollBy({ top: sign * absAmount, behavior: 'smooth' });
    await wait(randomBetween(300, 800));
    
    // Occasional micro back-scroll (re-reading)
    if (Math.random() < 0.15) {
      window.scrollBy({ top: sign * -(20 + Math.random() * 40), behavior: 'smooth' });
      await wait(humanDelay(250));
    }
    
    // Simulate reading pause (~30% chance)
    if (Math.random() < 0.3) {
      await thinkingPause();
    }
    
    return { success: true, message: `页面已滚动 ${amount > 0 ? '向下' : '向上'} ${Math.round(absAmount)}px` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── DOM Sampling ───

function sampleDom() {
  const bodyText = (document.body?.innerText || '').slice(0, 2000);

  const buttons = getInteractiveElements('button, [role="button"], a.btn, a[class*="btn"], [class*="tab-item"]');
  const inputs = getInteractiveElements('input, textarea');
  const selects = getInteractiveElements('select');

  const signals = detectSignals(bodyText);
  const alerts = getAlertTexts();
  const errors = getErrorTexts();

  return {
    url: window.location.href,
    title: document.title,
    bodyText,
    buttons,
    inputs,
    selects,
    signals,
    alerts,
    errors,
  };
}

function getInteractiveElements(selector: string) {
  return Array.from(document.querySelectorAll(selector))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, 50)
    .map(el => ({
      text: (el.textContent || '').trim().slice(0, 50),
      tag: el.tagName.toLowerCase(),
      id: el.id,
      className: (el as HTMLElement).className?.toString().slice(0, 80) || '',
      type: el.getAttribute('type') || '',
      placeholder: el.getAttribute('placeholder') || '',
      visible: true,
      selector: buildSelector(el as HTMLElement),
    }));
}

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const classes = el.className?.toString().split(/\s+/).filter(c => c && !c.match(/^\d/)).slice(0, 2).join('.');
  if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
  return el.tagName.toLowerCase();
}

function detectSignals(bodyText: string): string[] {
  const patterns = [
    '登录', '注册', '发布成功', '保存成功', '验证码',
    '系统繁忙', '操作频繁', '请稍后再试', '网络错误',
    'loading', 'Loading', '加载中', '提交中',
  ];
  return patterns.filter(p => bodyText.includes(p));
}

function getAlertTexts(): string[] {
  return Array.from(document.querySelectorAll('[role="alert"], .alert, .toast, .notification, .message'))
    .map(el => el.textContent?.trim())
    .filter(Boolean) as string[];
}

function getErrorTexts(): string[] {
  return Array.from(document.querySelectorAll('.error, .err-msg, [class*="error"]:not([class*="errors"])'))
    .map(el => el.textContent?.trim())
    .filter(Boolean)
    .slice(0, 10) as string[];
}

// ─── Low-Level Action Execution ───

async function executeAction(action: { selector: string; action: string; value?: string }) {
  const el = document.querySelector(action.selector) as HTMLElement;
  if (!el) return { success: false, error: `Element not found: ${action.selector}` };

  try {
    switch (action.action) {
      case 'click':
        el.click();
        el.focus();
        break;
      case 'type':
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.value = action.value || '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        break;
      case 'focus':
        el.focus();
        break;
      case 'scroll_into_view':
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      case 'get_text':
        return { success: true, text: el.textContent?.trim() };
      case 'get_value':
        return { success: true, value: (el as HTMLInputElement).value };
      default:
        return { success: false, error: `Unknown action: ${action.action}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── React-aware click (bypasses React's synthetic event check) ───

function reactClick(el: Element | null): boolean {
  if (!el) return false;

  // Approach 1: Find React fiber and invoke onClick directly
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
  if (fiberKey) {
    let fiber: any = (el as any)[fiberKey];
    // Walk up fiber tree to find a node with pendingProps.onClick
    for (let i = 0; fiber && i < 10; i++) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props?.onClick) {
        // Fire mousedown then click to simulate full interaction
        if (props.onMouseDown) props.onMouseDown({ nativeEvent: {}, target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
        props.onClick({ nativeEvent: {}, target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
        return true;
      }
      fiber = fiber.return; // parent fiber
    }
  }

  // Approach 2: Try __reactProps (React 18+)
  const reactKey = Object.keys(el).find(k => k.startsWith('__reactProps$'));
  if (reactKey) {
    const props = (el as any)[reactKey];
    if (props?.onClick) {
      props.onClick({ target: el, currentTarget: el, preventDefault: () => {}, stopPropagation: () => {} });
      return true;
    }
  }

  // Approach 3: native event fallback
  const rect = el.getBoundingClientRect();
  ['pointerdown', 'pointerup', 'click'].forEach(type => {
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0, pointerId: 1,
    }));
  });

  return false; // tried native, may or may not work
}

// ─── Cover Image Upload (Pexels via Background SW to avoid CORS) ───

async function uploadCoverImage(query: string, coverInputSelector: string = '') {
  try {
    // 1. Search Pexels via Background SW (no CORS restrictions)
    const searchResp = await chrome.runtime.sendMessage({
      type: 'SEARCH_PEXELS', id: 'pexels', text: query,
    });
    
    if (!searchResp?.success) {
      return { success: false, error: searchResp?.error || 'Pexels 搜索失败' };
    }
    
    const imageUrl: string = searchResp.imageUrl;
    
    // 2. Fetch & convert to JPEG (Pexels serves WebP which Baijiahao rejects)
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    let file: File;
    if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
      file = new File([blob], 'cover.jpg', { type: blob.type });
    } else {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      const jpegBlob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));
      file = new File([jpegBlob], 'cover.jpg', { type: 'image/jpeg' });
    }

    // 3. Click cover button — platform-aware selector
    let clickable: Element | null = null;
    const host = location.hostname;
    
    if (host.includes('baijiahao.baidu.com')) {
      clickable = document.evaluate(
        '//*[@id="bjhNewsCover"]/div/div/div[2]/div/div/div[2]/div/div/div/div/div/div[2]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue as Element;
    } else if (host.includes('toutiao.com')) {
      clickable = document.querySelector('.article-cover-add');
    }
    
    if (!clickable) return { success: false, error: '找不到封面按钮（平台: ' + host + '）' };

    const beforeEl = document.body.querySelectorAll('*').length;
    
    // Cover button: PointerEvent (this was working before)
    const rect = clickable.getBoundingClientRect();
    ['pointerdown', 'pointerup', 'click'].forEach(type => {
      clickable!.dispatchEvent(new PointerEvent(type as any, {
        bubbles: true, cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        button: 0, pointerId: 1,
      }));
    });
    
    await wait(1500);
    const afterEl = document.body.querySelectorAll('*').length;
    
    if (afterEl <= beforeEl) {
      return { success: false, error: '封面弹窗未打开（DOM无变化）' };
    }

    // 3b. Find file input (from adapter config)
    let fi: HTMLInputElement | null = null;
    
    if (coverInputSelector) {
      fi = document.querySelector(coverInputSelector) as HTMLInputElement | null;
    }
    if (!fi) fi = document.querySelector('input[type="file"]:not([accept*="video"])') as HTMLInputElement | null;
    
    if (!fi) { fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; document.body.appendChild(fi); }
    const dt = new DataTransfer(); dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    fi.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(randomBetween(3000, 5000));

    const confirmBtn = findByVisibleText('确定') || findByVisibleText('确认') || findByVisibleText('完成') || findByVisibleText('保存');
    if (!confirmBtn) return { success: false, error: '找不到确定按钮' };
    (confirmBtn as HTMLElement).click();
    await wait(1000);

    return { success: true, message: '封面图已上传' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Iframe Editor (Baijiahao UEditor) ───

async function typeIntoIframe(selector: string, value: string) {
  try {
    const iframe = document.querySelector(selector) as HTMLIFrameElement;
    if (!iframe) return { success: false, error: `找不到iframe: ${selector}` };
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return { success: false, error: 'iframe不可访问' };
    const body = doc.body;
    if (!body) return { success: false, error: 'iframe body未加载' };
    body.focus();
    await wait(randomBetween(200, 400));
    doc.execCommand('selectAll', false);
    await wait(50);
    doc.execCommand('insertText', false, value);
    body.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: value, bubbles: true }));
    body.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, message: `已在iframe输入 ${value.length} 字` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Import .docx file (Toutiao) ───

async function importDocx(base64Content: string, btnSelector: string) {
  try {
    // 1. Click import button (XPath or CSS from adapter config)
    let importBtn: HTMLElement | null = null;
    if (btnSelector.startsWith('/')) {
      try {
        importBtn = document.evaluate(btnSelector, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
      } catch {}
    } else {
      importBtn = document.querySelector(btnSelector) as HTMLElement | null;
    }
    if (!importBtn) importBtn = document.querySelector('.syl-toolbar-button') as HTMLElement | null;
    if (!importBtn) return { success: false, error: '找不到导入按钮' };
    importBtn.click();
    await wait(randomBetween(1000, 2000));

    // 2. In the dialog, find the upload trigger (button or link)
    const uploadTrigger = findByVisibleText('上传文档') || findByVisibleText('选择文件')
      || findByVisibleText('导入') || document.querySelector('.syl-toolbar-button');
    if (uploadTrigger) {
      (uploadTrigger as HTMLElement).click();
      await wait(randomBetween(500, 1000));
    }

    // 3. Find the file input (accept: pdf,doc,docx)
    let fi = document.querySelector('input[type="file"][accept*="doc"]') as HTMLInputElement | null;
    if (!fi) fi = document.querySelector('input[type="file"][accept*=".doc"]') as HTMLInputElement | null;
    if (!fi) fi = document.querySelector('input[type="file"]:not([accept*="image"]):not([accept*="video"])') as HTMLInputElement | null;
    if (!fi) { fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.docx,.doc'; document.body.appendChild(fi); }

    // 3. Decode base64 to binary and create File
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const file = new File([blob], 'import.docx', { type: blob.type });

    // 4. Set file via DataTransfer
    const dt = new DataTransfer();
    dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    fi.dispatchEvent(new Event('input', { bubbles: true }));

    // 5. Wait for import + content parsing
    await wait(randomBetween(5000, 8000));

    return { success: true, message: 'docx文件已导入' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Import .docx file (Baijiahao — 3 step flow) ───

async function bjhImportDocx(base64Content: string) {
  try {
    // Run hover + click in MAIN world via chrome.scripting
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (!tabId) return { success: false, error: '无法获取tab' };

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async () => {
        const hoverEl = document.querySelector('#edui40_state');
        if (!hoverEl) return { error: 'hover元素未找到' };
        hoverEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        hoverEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1500));

        const btn = [...document.querySelectorAll('div')]
          .find((d: HTMLDivElement) => d.textContent!.trim() === '导入文档');
        if (!btn) return { error: '导入文档菜单未找到' };
        (btn as HTMLElement).click();
        await new Promise(r => setTimeout(r, 2000));

        const fi = document.querySelector('input[name="file"]');
        return fi ? { success: true } : { error: '找不到docx上传input' };
      },
    });

    if (!result?.result?.success) return { success: false, error: result?.result?.error || '导入失败' };

    // Inject file from isolated world
    const fi = document.querySelector('input[name="file"]') as HTMLInputElement | null;
    if (!fi) return { success: false, error: '找不到docx上传input' };

    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const file = new File([blob], 'import.docx', { type: blob.type });
    const dt = new DataTransfer(); dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    fi.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(randomBetween(5000, 8000));
    return { success: true, message: 'docx文件已导入' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Import .docx file (Zhihu — 2 step flow) ───

async function zhihuImportDocx(base64Content: string) {
  try {
    // Convert base64 to ArrayBuffer
    const binary = atob(base64Content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Convert docx to HTML via mammoth (bundled, no CSP issue)
    const result = await mammoth.convertToHtml({arrayBuffer: bytes.buffer});
    const html = result.value;
    console.log('[LF:CS] mammoth:', html.length, 'chars, warnings:', result.messages.length);

    // Find editor and insert via paste event (Draft.js handles paste)
    const el = document.querySelector('[contenteditable="true"]') as HTMLElement | null;
    if (!el) return { success: false, error: '找不到编辑器' };
    el.focus();

    // Clear existing
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    
    // Create paste event with HTML data
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    } as any);
    (pasteEvent.clipboardData as DataTransfer).setData('text/html', html);
    (pasteEvent.clipboardData as DataTransfer).setData('text/plain', html.replace(/<[^>]*>/g, ''));
    el.dispatchEvent(pasteEvent);
    await wait(2000);

    return { success: true, message: 'docx文件已导入（mammoth HTML）' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Get article public URL from management page ───

async function getArticleUrl(query: string = '') {
  try {
    const host = location.hostname;
    let url = '';
    await wait(2000); // wait for list to load

    if (host.includes('zhihu.com')) {
      // 知乎: find first answer/article link
      const link = document.querySelector('a[href*="/answer/"]') || 
                   document.querySelector('a[href*="/p/"]') ||
                   document.querySelector('a[data-tooltip*="查看"]');
      url = link ? (link as HTMLAnchorElement).href : '';
    } else if (host.includes('toutiao.com')) {
      // 头条: no search — find link near title text in article list
      if (query) {
        const matches = Array.from(document.querySelectorAll('a, span, div'))
          .filter(el => el.textContent?.trim() === query);
        if (matches.length > 0) {
          const target = matches[0];
          const link = target.closest('a') || target.querySelector('a') as HTMLAnchorElement | null;
          url = link ? link.href : '';
        }
      }
      if (!url) {
        const link = document.querySelector('a[href*="/group/"]')
            || document.querySelector('table a[href]')
            || document.querySelector('tr a[href]');
        url = link ? (link as HTMLAnchorElement).href : '';
      }
    } else if (host.includes('baijiahao.baidu.com')) {
      // 百家号: find link near title text in list
      if (query) {
        const matches = Array.from(document.querySelectorAll('a, span, div, td'))
          .filter(el => el.textContent?.trim() === query);
        if (matches.length > 0) {
          const target = matches[0];
          const link = target.closest('a') || target.querySelector('a') as HTMLAnchorElement | null;
          url = link ? link.href : '';
        }
      }
      if (!url) {
        const link = document.querySelector('a[href*="/rc/"]')
                  || document.querySelector('table a[href]')
                  || document.querySelector('tr a[href]');
        url = link ? (link as HTMLAnchorElement).href : '';
      }
    } else if (host.includes('om.qq.com')) {
      // 企鹅号: match title text in article list
      if (query) {
        const matches = Array.from(document.querySelectorAll('a, span, div, td'))
          .filter(el => el.textContent?.trim() === query);
        if (matches.length > 0) {
          const target = matches[0];
          const link = target.closest('a') || target.querySelector('a') as HTMLAnchorElement | null;
          url = link ? link.href : '';
        }
      }
      if (!url) {
        const link = document.querySelector('table a[href]') || document.querySelector('tr a[href]');
        url = link ? (link as HTMLAnchorElement).href : '';
      }
    } else if (host.includes('smzdm.com')) {
      // 什么值得买: match title text in article list
      if (query) {
        const matches = Array.from(document.querySelectorAll('a, span, div'))
          .filter(el => el.textContent?.trim() === query);
        if (matches.length > 0) {
          const target = matches[0];
          const link = target.closest('a') || target.querySelector('a') as HTMLAnchorElement | null;
          url = link ? link.href : '';
        }
      }
      if (!url) {
        const link = document.querySelector('a[href*="/p/"]') || document.querySelector('table a[href]');
        url = link ? (link as HTMLAnchorElement).href : '';
      }
    }

    if (!url) return { success: false, error: '未找到文章链接' };
    return { success: true, message: url, url };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Generic Image Injection (Pexels → DataTransfer) ───

async function injectImage(query: string, fileInputSelector: string) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SEARCH_PEXELS', id: 'img', text: query });
    if (!resp?.success) return { success: false, error: resp?.error || 'Pexels搜索失败' };
    const imageUrl = resp.imageUrl;
    if (!imageUrl) return { success: false, error: '未找到图片' };
    const imgResp = await fetch(imageUrl);
    const blob = await imgResp.blob();
    
    // Resize to at least 800x800 (smzdm cover requirement)
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(bitmap.width, 800);
    canvas.height = Math.max(bitmap.height, 800);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpegBlob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.92));
    const file = new File([jpegBlob], 'cover.jpg', { type: 'image/jpeg' });
    let fi = document.querySelector(fileInputSelector || 'input[name="file"]') as HTMLInputElement | null;
    if (!fi) fi = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement | null;
    if (!fi) { fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; document.body.appendChild(fi); }
    const dt = new DataTransfer(); dt.items.add(file);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change', { bubbles: true }));
    fi.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(2000);
    return { success: true, message: '图片已注入' };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
