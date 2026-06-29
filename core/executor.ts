/**
 * Step Executor — executes adapter-generated steps via Content Script.
 * Separated from Side Panel UI for cleanliness and testability.
 */

import type { Step } from './types';

export type StepResult = { success: boolean; message: string };

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

function executeOneStep(
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
        chrome.tabs.sendMessage(tabId, {
          type: 'FIND_AND_CLICK', id: 'adapter', text: step.target,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '点击失败' });
        });
        break;

      case 'find_and_click_optional':
        chrome.tabs.sendMessage(tabId, {
          type: 'FIND_AND_CLICK', id: 'adapter', text: step.target,
        }, (r) => {
          resolve({ success: true, message: r?.success ? r.message : `跳过: ${r?.error}` });
        });
        break;

      case 'find_and_type':
        chrome.tabs.sendMessage(tabId, {
          type: 'FIND_AND_TYPE', id: 'adapter', text: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'find_and_type_rich':
        chrome.tabs.sendMessage(tabId, {
          type: 'FIND_AND_TYPE', id: 'adapter', text: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'type_selector':
        chrome.tabs.sendMessage(tabId, {
          type: 'TYPE_SELECTOR', id: 'adapter', selector: step.target, value: step.value,
        }, (r) => {
          resolve(r?.success
            ? { success: true, message: r.message }
            : { success: false, message: r?.error || '输入失败' });
        });
        break;

      case 'sample':
        chrome.tabs.sendMessage(tabId, {
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
        chrome.tabs.sendMessage(tabId, { type: 'UPLOAD_COVER', id: 'cover', text: step.target }, (r) => {
          resolve(r?.success ? { success: true, message: r.message } : { success: false, message: r?.error || '封面上传失败' });
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
      if (count++ > 120) { resolve({ success: false, message: '登录等待超时' }); return; }
      
      chrome.tabs.sendMessage(tabId, { type: 'SAMPLE_DOM', id: 'login_poll' }, (r) => {
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
