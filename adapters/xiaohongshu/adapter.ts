/**
 * Xiaohongshu (小红书) Adapter
 * Flow: home → 发布笔记 → 写长文 → title → body → 一键排版 → 下一步 → URL
 */

import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const XHS_HOME = 'https://creator.xiaohongshu.com/new/home';
const XHS_PUBLISH = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=article';

let config = {
  publishNote: '发布笔记',
  writeArticle: '写长文',
  newCreation: '新的创作',
  titleSelector: 'textarea[placeholder*="输入标题"]',
  bodyEditor: '.rich-editor-content',
  autoFormat: '一键排版',
  publishBtn: '下一步',
  manageBtn: '笔记管理',
  loggedOutSignals: ['登录', '手机号登录', '验证码登录'],
};

export class XiaohongshuAdapter {
  static id = 'xiaohongshu';
  static name = '小红书';

  detectState(snapshot: DomSnapshot): PageState {
    const url = snapshot.url || '';
    if (url.includes('creator.xiaohongshu.com/publish') && snapshot.bodyText.includes('输入标题'))
      return { page: 'editor', ready: true, details: '编辑器' };
    if (url.includes('creator.xiaohongshu.com'))
      return { page: 'dashboard', ready: true, details: '首页' };
    return { page: 'unknown', ready: false, details: '' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (!state || state.page === 'unknown') {
      yield { type: 'navigate', target: XHS_HOME, reason: '打开小红书创作者中心' };
      yield { type: 'wait', target: '4000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'creator.xiaohongshu.com', reason: '等待登录小红书' };

    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: XHS_PUBLISH, reason: '打开发布页面' };
      yield { type: 'wait', target: '5000', reason: '等待编辑器加载' };
    }

    // Title
    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };
    yield { type: 'wait', target: '1000', reason: '等待标题渲染' };

    // Body — rich editor
    yield { type: 'find_and_type_rich', target: config.bodyEditor, value: article.content, reason: '填入正文' };
    yield { type: 'wait', target: '3000', reason: '等待正文渲染' };

    // Auto format
    yield { type: 'find_and_click', target: config.autoFormat, reason: '点击一键排版' };
    yield { type: 'wait', target: '2000', reason: '等待排版完成' };

    // Publish
    yield { type: 'find_and_click', target: config.publishBtn, reason: '点击下一步/发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };

    // Get URL
    yield { type: 'get_article_url', target: 'https://creator.xiaohongshu.com/publish/publish?source=&published=true', value: article.title, reason: '获取文章URL' };
  }
}

export function updateXiaohongshuConfig(overrides: Partial<typeof config>) {
  config = { ...config, ...overrides };
}
