/**
 * Toutiao Adapter — uses configurable selectors from selectors.json + chrome.storage
 */
import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const TOUTIAO_INDEX = 'https://mp.toutiao.com/profile_v4/index';
const TOUTIAO_PUBLISH = 'https://mp.toutiao.com/profile_v4/graphic/publish';

let config = {
  titleSelector: 'textarea[placeholder*="文章标题"]',
  contentText: '请输入正文',
  previewText: '预览并发布',
  confirmText: '确认发布',
  importDocxBtn: '//*[@id="root"]/div/div[1]/div/div[1]/div[1]/div/div[17]/div/button',
  loggedOutSignals: ['登录', '账号登录', '手机登录', '注册'],
};

export function updateToutiaoConfig(c: Partial<typeof config>) {
  Object.assign(config, c);
}

export class ToutiaoAdapter {
  readonly id = 'toutiao';
  readonly name = '头条号';

  detectState(dom: DomSnapshot): PageState {
    if (dom.signals.some(s => config.loggedOutSignals.includes(s))) {
      return { page: 'login', ready: false, details: '需要登录头条号' };
    }
    if (dom.url.includes('/graphic/publish')) {
      return { page: 'editor', ready: true, details: '已在编辑器' };
    }
    if (dom.url.includes('mp.toutiao.com')) {
      return { page: 'dashboard', ready: true, details: '头条号后台' };
    }
    return { page: 'unknown', ready: false, details: '不在头条号网站' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (!state || state.page === 'unknown') {
      yield { type: 'navigate', target: TOUTIAO_INDEX, reason: '打开头条号' };
      yield { type: 'wait', target: '3000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'toutiao.com', reason: '等待登录头条号' };

    // Key waits increased for slow network
    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: TOUTIAO_PUBLISH, reason: '打开发文编辑器' };
    }

    yield { type: 'wait', target: '8000', reason: '等待编辑器加载' };
    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };
    
    if (article.docxB64) {
      yield { type: 'import_docx', target: config.importDocxBtn, value: article.docxB64, reason: '导入docx文件' };
      yield { type: 'wait', target: '10000', reason: '等待docx解析' };
    } else {
      yield { type: 'find_and_type_rich', target: config.contentText, value: article.content, reason: '填入正文' };
      yield { type: 'wait', target: '3000', reason: '等待编辑器处理内容' };
    }

    yield { type: 'upload_cover', target: article.title, reason: '搜索并上传封面图' };
    yield { type: 'wait', target: '3000', reason: '等待封面上传完成' };

    yield { type: 'find_and_click', target: config.previewText, reason: '点击预览并发布' };
    yield { type: 'wait', target: '4000', reason: '等待预览弹窗' };
    yield { type: 'find_and_click', target: config.confirmText, reason: '确认发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };
    yield { type: 'get_article_url', target: 'https://mp.toutiao.com/profile_v4/graphic/articles', value: article.title, reason: '获取文章URL' };
  }
}
