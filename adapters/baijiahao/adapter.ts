/**
 * Baijiahao (百家号) Adapter
 * Title: contenteditable div with data-lexical-editor
 * Body: iframe#ueditor_0 (UEditor)
 */

import type { Article, DomSnapshot, PageState, Step } from '../../core/types';

const BJH_INDEX = 'https://baijiahao.baidu.com/builder/rc/home';
const BJH_PUBLISH = 'https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1';

let config = {
  titleSelector: '[data-lexical-editor="true"]',
  bodyIframe: '#ueditor_0',
  publishText: '发布',
  coverBtnXPath: '//*[@id="bjhNewsCover"]/div/div/div[2]/div/div/div[2]/div/div/div/div/div/div[2]',
  coverInput: 'input[name="media"][type="file"]',
  loggedOutSignals: ['登录', '短信登录', '账号登录'],
};

export function updateBaijiahaoConfig(c: Partial<typeof config>) {
  Object.assign(config, c);
}

export class BaijiahaoAdapter {
  readonly id = 'baijiahao';
  readonly name = '百家号';

  detectState(dom: DomSnapshot): PageState {
    if (dom.signals.some(s => config.loggedOutSignals.includes(s))) {
      return { page: 'login', ready: false, details: '需要登录百家号' };
    }
    if (dom.url.includes('/edit')) {
      return { page: 'editor', ready: true, details: '已在编辑器' };
    }
    if (dom.url.includes('baijiahao.baidu.com')) {
      return { page: 'dashboard', ready: true, details: '百家号后台' };
    }
    return { page: 'unknown', ready: false, details: '不在百家号网站' };
  }

  *publish(article: Article, state?: PageState): Generator<Step> {
    if (!state || state.page === 'unknown') {
      yield { type: 'navigate', target: BJH_INDEX, reason: '打开百家号' };
      yield { type: 'wait', target: '3000', reason: '等待页面加载' };
    }

    yield { type: 'wait_for_login', target: 'baijiahao.baidu.com', reason: '等待登录百家号' };

    if (state?.page !== 'editor') {
      yield { type: 'navigate', target: BJH_PUBLISH, reason: '打开发文编辑器' };
      yield { type: 'wait', target: '5000', reason: '等待编辑器加载' };
    }

    // Title: Lexical contenteditable (not input/textarea)
    yield {
      type: 'type_selector',
      target: config.titleSelector,
      value: article.title,
      reason: '填入标题',
    };

    // Body: iframe UEditor or docx import
    if (article.docxB64) {
      yield { type: 'type_iframe', target: config.bodyIframe, value: ' ', reason: '唤醒UEditor编辑器' };
      yield { type: 'wait', target: '2000', reason: '等待编辑器就绪' };
      yield { type: 'import_docx_bjh', target: '', value: article.docxB64, reason: '导入docx文件' };
      yield { type: 'wait', target: '8000', reason: '等待docx解析' };
    } else {
      yield { type: 'type_iframe', target: config.bodyIframe, value: article.content, reason: '填入正文' };
    }

    yield { type: 'wait', target: '2000', reason: '等待编辑器处理内容' };

    // Cover image (百家号也需要封面)
    yield { type: 'upload_cover', target: article.title, value: config.coverInput, reason: '搜索并上传封面图' };
    yield { type: 'wait', target: '2000', reason: '等待封面上传完成' };

    yield { type: 'find_and_click', target: config.publishText, reason: '点击发布' };
    yield { type: 'wait', target: '5000', reason: '等待发布完成' };
    yield { type: 'get_article_url', target: 'https://baijiahao.baidu.com/builder/rc/content?currentPage=1&pageSize=10&search=&type=&collection=&startDate=&endDate=', value: article.title, reason: '获取文章URL' };
  }
}
