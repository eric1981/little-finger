/**
 * Penguin (企鹅号) Adapter
 * Title: contenteditable span
 * Body: ProseMirror editor
 * Extra: declaration step (添加内容自主声明 → 确认)
 */

import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const PENGUIN_INDEX = 'https://om.qq.com/main';
const PENGUIN_PUBLISH = 'https://om.qq.com/main/creation/article';

let config = {
  titleSelector: 'span[data-placeholder*="标题"]',
  publishText: '发布',
  declareBtn1Text: '添加内容自主声明',
  declareBtn2Text: '确认',
  loggedOutSignals: ['登录', '账号登录', '手机登录'],
};

export function updatePenguinConfig(c: Partial<typeof config>) {
  Object.assign(config, c);
}

export class PenguinAdapter {
  readonly id = 'qiehao';
  readonly name = '企鹅号';

  detectState(dom: DomSnapshot): PageState {
    if (dom.signals.some(s => config.loggedOutSignals.includes(s))) {
      return { page: 'login', ready: false, details: '需要登录企鹅号' };
    }
    if (dom.url.includes('/creation/article')) {
      return { page: 'editor', ready: true, details: '已在编辑器' };
    }
    if (dom.url.includes('om.qq.com')) {
      return { page: 'dashboard', ready: true, details: '企鹅号后台' };
    }
    return { page: 'unknown', ready: false, details: '不在企鹅号网站' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (!state || state.page === 'unknown') {
      yield { type: 'navigate', target: PENGUIN_INDEX, reason: '打开企鹅号' };
      yield { type: 'wait', target: '3000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'om.qq.com', reason: '等待登录企鹅号' };

    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: PENGUIN_PUBLISH, reason: '打开发文编辑器' };
      yield { type: 'wait', target: '5000', reason: '等待编辑器加载' };
    }

    // Title: contenteditable span
    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };

    // Body: ProseMirror editor
    yield { type: 'find_and_type_rich', target: '正文', value: article.content, reason: '填入正文' };
    yield { type: 'wait', target: '2000', reason: '等待编辑器处理内容' };

    // Declaration: 添加内容自主声明 → 确认
    yield { type: 'find_and_click', target: config.declareBtn1Text, reason: '点击添加内容自主声明' };
    yield { type: 'wait', target: '1000', reason: '等待声明弹窗' };
    yield { type: 'find_and_click', target: config.declareBtn2Text, reason: '确认声明' };
    yield { type: 'wait', target: '1000', reason: '等待弹窗关闭' };

    // Publish
    yield { type: 'find_and_click', target: config.publishText, reason: '点击发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };

    // Get URL
    yield { type: 'get_article_url', target: 'https://om.qq.com/main/management/articleManage', value: article.title, reason: '获取文章URL' };
  }
}
