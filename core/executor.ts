/**
 * Step Executor — executes adapter-generated steps via Content Script.
 * Separated from Side Panel UI for cleanliness and testability.
 */

import type { Step } from './types';
import { sendToContent } from './fallback-channel';

export type StepResult = { success: boolean; message: string; data?: any };

/**
 * Execute a list of adapter steps sequentially on the given tab.
 * Failed step stops execution (except for optional steps and wait_for_login).
 */
export async function executeSteps(
  tabId: number,
  steps: Step[],
  onProgress: (msg: string, type: 'info' | 'success' | 'error' | 'wait') => void
): Promise<StepResult> {
  for (const step of steps) {
    onProgress(`⏳ ${step.reason}`, 'info');

    const result = await executeOneStep(tabId, step, onProgress);
    
    if (!result.success) {
      onProgress(`❌ ${result.message}`, 'error');
      return result;
    }
    onProgress(`✅ ${result.message}`, 'success');
  }

  onProgress('🎉 任务完成', 'success');
  return { success: true, message: '完成' };
}

export function executeOneStep(
  tabId: number,
  step: Step,
  onProgress: (msg: string, type: 'info' | 'success' | 'error' | 'wait') => void
): Promise<StepResult> {
  return new Promise((resolve) => {
    switch (step.type) {
      case 'navigate':
        chrome.tabs.update(tabId, { url: step.target }, () => {
          resolve({ success: true, message: `导航到 ${step.target}` });
        });
        break;

      case 'wait':
        setTimeout(() => {
          resolve({ success: true, message: `等待 ${parseInt(step.target) || 0}ms` });
        }, parseInt(step.target) || 2000);
        break;

      case 'find_and_click':
        sendToContent(tabId, {
          type: 'FIND_AND_CLICK', id: 'adapter', text: step.target,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '点击失败' });
        });
        break;

      case 'find_and_click_optional':
        sendToContent(tabId, {
          type: 'FIND_AND_CLICK', id: 'adapter', text: step.target,
        }, (r) => {
          resolve({ success: true, message: r?.success ? r.message : `跳过: ${r?.error}` });
        });
        break;

      case 'find_and_type':
        sendToContent(tabId, {
          type: 'FIND_AND_TYPE', id: 'adapter', text: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'find_and_type_rich':
        sendToContent(tabId, {
          type: 'FIND_AND_TYPE', id: 'adapter', text: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'type_selector':
        sendToContent(tabId, {
          type: 'TYPE_SELECTOR', id: 'adapter', selector: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'sample':
        sendToContent(tabId, {
          type: 'SAMPLE_DOM', id: 'check_state',
        }, (r) => {
          if (!r?.data) {
            resolve({ success: false, message: '采样失败' });
          } else {
            const sig = r.data.signals?.join(', ') || '无';
            resolve({ success: true, message: `${r.data.title?.slice(0, 30)} | 信号: ${sig}` });
          }
        });
        break;

      case 'check':
        resolve({ success: false, message: step.reason });
        break;

      case 'upload_cover':
        sendToContent(tabId, { type: 'UPLOAD_COVER', id: 'cover', text: step.target, value: step.value }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || '封面上传失败' });
        });
        break;

      case 'type_iframe':
        sendToContent(tabId, { type: 'TYPE_IFRAME', id: 'iframe', selector: step.target, value: step.value }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || 'iframe输入失败' });
        });
        break;

      case 'import_docx':
        sendToContent(tabId, { type: 'IMPORT_DOCX', id: 'docx', value: step.value, selector: step.target }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || 'docx导入失败' });
        });
        break;

      case 'import_docx_bjh':
        sendToContent(tabId, { type: 'IMPORT_DOCX_BJH', id: 'docx', value: step.value, tabId }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || 'docx导入失败' });
        });
        break;

      case 'import_docx_zhihu':
        sendToContent(tabId, { type: 'IMPORT_DOCX_ZHIHU', id: 'docx', value: step.value }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || 'docx导入失败' });
        });
        break;

      case 'get_article_url':
        chrome.tabs.update(tabId, { url: step.target, active: true }, () => {
          setTimeout(() => {
            sendToContent(tabId, { type: 'GET_ARTICLE_URL', id: 'url', value: step.value }, (r) => {
              resolve(r?.success ? { success: true, message: r.message, data: { url: r.url } } 
                      : { success: false, message: r?.error || '获取URL失败' });
            });
          }, 4000);
        });
        break;

      case 'inject_image':
        sendToContent(tabId, { type: 'INJECT_IMAGE', id: 'img', text: step.value, selector: step.target }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || '图片注入失败' });
        });
        break;

      case 'wait_for_page':
        // Poll: wait for URL to match, then content script ready
        const urlPattern = step.target;
        const t0 = Date.now();
        const poll = () => {
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
              if (Date.now() - t0 < 20000) return setTimeout(poll, 500);
              return resolve({ success: false, message: `页面超时: ${urlPattern}` });
            }
            if (!tab.url?.includes(urlPattern)) {
              if (Date.now() - t0 < 20000) return setTimeout(poll, 500);
              return resolve({ success: false, message: `未导航到 ${urlPattern}` });
            }
            // URL matched — now wait for content script
            sendToContent(tabId, { type: 'PING', id: 'wp' }, (r) => {
              if (chrome.runtime.lastError || !r) return setTimeout(poll, 500);
              resolve({ success: true, message: `页面就绪: ${tab.url}` });
            });
          });
        };
        setTimeout(poll, 500);
        break;

      case 'key_press':
        sendToContent(tabId, { type: 'KEY_PRESS', id: 'key', text: step.target, value: step.value }, (r) => {
          resolve({ success: true, message: r?.message || '按键已发送' });
        });
        break;

      case 'inject_file':
        sendToContent(tabId, { type: 'INJECT_FILE', id: 'file', value: step.value, selector: step.target }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || '文件注入失败' });
        });
        break;

      case 'wait_for_login':
        waitForLogin(tabId, step, onProgress).then(resolve);
        break;

      default:
        resolve({ success: false, message: `未知步骤: ${step.type}` });
    }
  });
}

/** Poll until user logs in on the target domain */
async function waitForLogin(
  tabId: number,
  step: Step,
  onProgress: (msg: string, type: 'info' | 'success' | 'error' | 'wait') => void
): Promise<StepResult> {
  onProgress(`🔐 ${step.reason}`, 'wait');

  return new Promise((resolve) => {
    let count = 0;
    const poll = () => {
      if (count++ > 45) { resolve({ success: false, message: '登录等待超时' }); return; }
      
      sendToContent(tabId, { type: 'SAMPLE_DOM', id: 'login_poll' }, (r) => {
        if (chrome.runtime.lastError || !r?.data) { setTimeout(poll, 2000); return; }
        
        const url: string = r.data.url || '';
        const signals: string[] = r.data.signals || [];
        
        // Reliable: check if URL has login-related path (redirected to login page)
        const isLoginPage = /login|passport|sso|signin|auth/i.test(url) &&
                            !/profile|dashboard|creator|write/i.test(url);
        
        // Fallback: check for explicit login form signals
        const hasLoginForm = signals.some(s =>
          ['账号密码登录', '手机号登录', '短信登录', '验证码登录'].includes(s)
        );
        
        if (isLoginPage || hasLoginForm) {
          setTimeout(poll, 2000);
        } else if (url.includes(step.target || '')) {
          resolve({ success: true, message: '已登录，继续执行' });
        } else {
          setTimeout(poll, 2000);
        }
      });
    };
    poll();
  });
}
