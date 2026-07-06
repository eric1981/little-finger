/**
 * Douyin (抖音) Article Adapter
 * Flow: upload page → 一键导入 → docx inject → editor → title → cover → publish
 */

import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const DY_UPLOAD = 'https://creator.douyin.com/creator-micro/content/upload?default-tab=5';

let config = {
  importBtn: '一键导入',
  titleSelector: 'input[placeholder*="请输入文章标题"]',
  coverBtn: '点击上传封面图',
  confirmBtn: 'button.semi-button.semi-button-primary',
  publishBtn: 'button.button-dhlUZE.primary-cECiOJ',
  loggedOutSignals: ['登录', '扫码登录', '手机登录'],
};

export class DouyinAdapter {
  static id = 'douyin';
  static name = '抖音';

  detectState(snapshot: DomSnapshot): PageState {
    const url = snapshot.url || '';
    if (url.includes('/post/article')) return { page: 'editor', ready: true, details: '编辑器' };
    if (url.includes('creator.douyin.com')) return { page: 'dashboard', ready: true, details: '首页' };
    return { page: 'unknown', ready: false, details: '' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: DY_UPLOAD, reason: '打开抖音发布页' };
      yield { type: 'wait', target: '6000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'creator.douyin.com', reason: '等待登录抖音' };

    if (state?.page !== 'editor') {
      yield { type: 'find_and_click', target: config.importBtn, reason: '点击一键导入' };
      yield { type: 'wait', target: '3000', reason: '等待上传区域' };
      yield { type: 'inject_file', target: 'input[accept*="docx"]', value: article.docxB64 || '', reason: '注入docx文件' };
      yield { type: 'wait', target: '10000', reason: '等待docx解析' };
    }

    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };
    yield { type: 'wait', target: '1000', reason: '等待标题渲染' };

    yield { type: 'find_and_click', target: config.coverBtn, reason: '点击上传封面图' };
    yield { type: 'wait', target: '3000', reason: '等待封面弹窗' };
    yield { type: 'inject_image', target: 'input[type="file"][accept*="image"]', value: article.title, reason: '注入封面图' };
    yield { type: 'wait', target: '5000', reason: '等待封面预览渲染' };
    yield { type: 'find_and_click', target: config.confirmBtn, reason: '点击完成' };
    yield { type: 'wait', target: '2000', reason: '等待封面设置' };

    yield { type: 'find_and_click', target: config.publishBtn, reason: '点击发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };
    yield { type: 'get_article_url', target: 'https://creator.douyin.com/creator-micro/content/manage', value: article.title, reason: '获取文章URL' };
  }
}

export function updateDouyinConfig(overrides: Partial<typeof config>) {
  config = { ...config, ...overrides };
}
