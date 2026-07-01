/**
 * Smzdm (什么值得买) Adapter
 * Multi-step: new post → body image (3-step) → cover (4-step) → publish
 */

import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const SMZDM_PUBLISH = 'https://post.smzdm.com/tougao/';

let config = {
  newPostLink: '发布新文章',
  titleSelector: 'textarea[placeholder*="文章标题"]',
  addImageBtn: '添加图片',
  insertImageBtn: '插入正文',
  coverBtn: '添加方图',
  fileInputSelector: 'input[name="file"][accept*="image"]',
  setCoverBtn: '设为封面图',
  coverConfirmBtn: '确认',
  publishText: '发布',
  loggedOutSignals: ['登录', '账号登录', '手机登录'],
};

export function updateSmzdmConfig(c: Partial<typeof config>) {
  Object.assign(config, c);
}

export class SmzdmAdapter {
  readonly id = 'smzdm';
  readonly name = '什么值得买';

  detectState(dom: DomSnapshot): PageState {
    if (dom.signals.some(s => config.loggedOutSignals.includes(s))) {
      return { page: 'login', ready: false, details: '需要登录什么值得买' };
    }
    if (dom.url.includes('/tougao')) {
      return { page: 'editor', ready: true, details: '已在编辑器' };
    }
    if (dom.url.includes('smzdm.com')) {
      return { page: 'dashboard', ready: true, details: '什么值得买首页' };
    }
    return { page: 'unknown', ready: false, details: '不在什么值得买网站' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: SMZDM_PUBLISH, reason: '打开投稿页面' };
      yield { type: 'wait', target: '6000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'smzdm.com', reason: '等待登录什么值得买' };

    // Click "发布新文章"
    yield { type: 'find_and_click', target: config.newPostLink, reason: '点击发布新文章' };
    yield { type: 'wait_for_page', target: '/edit/', reason: '等待编辑器页面加载' };

    // Title
    yield { type: 'type_selector', target: config.titleSelector, value: article.title, reason: '填入标题' };

    // Body (ProseMirror)
    yield { type: 'find_and_type_rich', target: '正文', value: article.content, reason: '填入正文' };
    yield { type: 'wait', target: '2000', reason: '等待编辑器处理内容' };

    // Body image (must)
    yield { type: 'find_and_click', target: config.addImageBtn, reason: '点击添加图片' };
    yield { type: 'wait', target: '1000', reason: '等待图片弹窗' };
    yield { type: 'inject_image', target: config.fileInputSelector, value: article.title, reason: '注入正文插图' };
    yield { type: 'find_and_click', target: config.insertImageBtn, reason: '点击插入正文' };
    yield { type: 'wait', target: '2000', reason: '等待图片插入' };

    // Cover image (4-step)
    yield { type: 'find_and_click', target: config.coverBtn, reason: '点击添加方图' };
    yield { type: 'wait', target: '1000', reason: '等待封面弹窗' };
    yield { type: 'inject_image', target: config.fileInputSelector, value: article.title, reason: '注入封面图' };
    yield { type: 'find_and_click', target: config.setCoverBtn, reason: '点击设为封面图' };
    yield { type: 'wait', target: '3000', reason: '等待封面设置' };
    yield { type: 'find_and_click', target: config.coverConfirmBtn, reason: '点击确认' };
    yield { type: 'wait', target: '2000', reason: '等待弹窗关闭' };

    // Publish
    yield { type: 'find_and_click', target: config.publishText, reason: '点击发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };

    // Get URL
    yield { type: 'get_article_url', target: 'https://zhiyou.smzdm.com/user/article/', value: article.title, reason: '获取文章URL' };
  }
}
