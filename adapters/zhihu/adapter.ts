/**
 * Zhihu Adapter — uses configurable selectors from selectors.json + chrome.storage
 */
import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const ZHIHU_HOME = 'https://www.zhihu.com';
const WRITE_URL = 'https://zhuanlan.zhihu.com/write';

// Defaults — overridden by config loader at runtime
let config = {
  titleSelector: 'textarea[placeholder*="标题"]',
  contentText: '请输入正文',
  publishText: '发布',
  confirmText: '确认并发布',
  loggedOutSignals: ['登录', '账号密码登录', '手机号登录', '注册'],
};

export function updateZhihuConfig(c: Partial<typeof config>) {
  Object.assign(config, c);
}

export class ZhihuAdapter {
  readonly id = 'zhihu';
  readonly name = '知乎';

  detectState(dom: DomSnapshot): PageState {
    if (dom.signals.some(s => config.loggedOutSignals.includes(s))) {
      return { page: 'login', ready: false, details: '需要登录知乎' };
    }
    if (dom.url.includes('/write') || dom.url.includes('/p/')) {
      return { page: 'editor', ready: true, details: '已在编辑器' };
    }
    if (dom.url.includes('/creator')) {
      return { page: 'dashboard', ready: true, details: '创作中心' };
    }
    if (dom.url.includes('zhihu.com')) {
      return { page: 'dashboard', ready: true, details: '知乎其他页面' };
    }
    return { page: 'unknown', ready: false, details: '不在知乎网站' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (!state || state.page === 'unknown') {
      yield { type: 'navigate', target: ZHIHU_HOME, reason: '打开知乎首页' };
      yield { type: 'wait', target: '3000', reason: '等待首页加载' };
    }

    yield { type: 'wait_for_login', target: 'zhihu.com', reason: '等待登录知乎' };

    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: WRITE_URL, reason: '打开编辑器' };
      yield { type: 'wait', target: '5000', reason: '等待编辑器加载' };
    }

    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };
    
    if (article.docxB64) {
      yield { type: 'import_docx_zhihu', target: '', value: article.docxB64, reason: '导入docx文件' };
      yield { type: 'wait', target: '8000', reason: '等待docx解析' };
    } else {
      yield { type: 'find_and_type_rich', target: config.contentText, value: article.content, reason: '填入正文' };
      yield { type: 'wait', target: '2000', reason: '等待编辑器处理内容' };
    }
    yield { type: 'find_and_click', target: config.publishText, reason: '点击发布' };
    yield { type: 'wait', target: '3000', reason: '等待发布处理' };
    yield { type: 'find_and_click_optional', target: config.confirmText, reason: '确认发布（如不需要则跳过）' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };
  }
}
