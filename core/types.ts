// ─── Core type definitions for Little Finger ───

// ── Page State ──
export interface DomSnapshot {
  url: string;
  title: string;
  bodyText: string;
  buttons: InteractiveElement[];
  inputs: InteractiveElement[];
  selects: InteractiveElement[];
  signals: string[];
  alerts: string[];
  errors: string[];
}

export interface InteractiveElement {
  text: string;
  tag: string;
  id: string;
  className: string;
  type: string;
  placeholder: string;
  visible: boolean;
  selector: string;
}

// ── Article / Content ──
export interface Article {
  title: string;
  content: string;       // Markdown
  tags?: string[];
  coverImage?: string;
  summary?: string;
  docxB64?: string;      // base64-encoded .docx for import
  publishType: 'public' | 'draft' | 'private';
}

// ── Task Instructions ──
export interface Task {
  id: string;
  action: ActionType;
  platform: PlatformId;
  params: Record<string, unknown>;
  options?: TaskOptions;
}

// Platform IDs — kept in sync with the 7 adapters registered in
// entrypoints/background.ts → resolveAdapter()
export type PlatformId =
  | 'zhihu'
  | 'toutiao'
  | 'baijiahao'
  | 'qiehao'      // 企鹅号
  | 'smzdm'
  | 'xiaohongshu'
  | 'douyin';

export type ActionType =
  | 'publish_article'
  | 'get_article_url'
  | 'scrape_articles'
  | 'scrape_comments'
  | 'scrape_stats'
  | 'login'
  | 'check_status'
  | 'custom';

export interface TaskOptions {
  humanSpeed?: 'slow' | 'normal' | 'fast';
  headless?: boolean;
  timeout?: number;
}

// ── Task Progress ──
export interface TaskProgress {
  id: string;
  type: 'progress' | 'result' | 'error';
  step?: string;
  message: string;
  progress: number;     // 0..1
  success?: boolean;
  data?: Record<string, unknown>;
  error?: TaskError;
}

export interface TaskError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestedAction?: string;
}

// ── Page State (Adapter return) ──
export interface PageState {
  page: 'editor' | 'dashboard' | 'login' | 'unknown' | 'error';
  ready: boolean;
  details: string;
}

// ── Step (async generator yield) ──
export interface Step {
  type: 'navigate' | 'click' | 'type' | 'select' | 'scroll' | 'wait' | 'sample' | 'check'
       | 'find_and_click' | 'find_and_type' | 'find_and_type_rich'
       | 'find_and_click_optional'
       | 'type_selector'
       | 'wait_for_login'
       | 'upload_cover'
       | 'type_iframe'
       | 'import_docx'
       | 'import_docx_bjh'
       | 'import_docx_zhihu'
       | 'get_article_url'
       | 'inject_image'
       | 'wait_for_page'
       | 'key_press'
       | 'inject_file';     // inject base64 content into file input (docx/images)

  // ═══ 新增 Step 类型需同步修改 4 个文件 ═══
  // 1. 本文件 (types.ts) — 加 type 字面量
  // 2. core/executor.ts     — 加 case 分支处理
  // 3. entrypoints/content.ts — 加 message handler (if direct DOM)
  // 4. adapters/{platform}/adapter.ts — 在 publish() 中 yield
  // ═══════════════════════════════════════

  target: string;        // selector, URL, or text to find
  value?: string;        // text to type
  reason: string;
}

export type StepResult<T = unknown> = {
  success: boolean;
  data?: T;
  nextState: PageState;
};

// ── Scrape ──
export interface ScrapeParams {
  platform: PlatformId;
  account?: string;
  count: number;
  dateRange?: { from: string; to: string };
}

// ── Agent Protocol ──
export interface AgentCommand {
  id: string;
  action: ActionType;
  platform: PlatformId;
  params: Record<string, unknown>;
  options?: TaskOptions;
}

export interface AgentResponse {
  id: string;
  type: 'progress' | 'result' | 'error';
  success: boolean;
  data?: Record<string, unknown>;
  error?: TaskError;
  step?: string;
  message: string;
  progress: number;
}
