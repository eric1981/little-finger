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

export type ActionType =
  | 'publish_article'
  | 'scrape_articles'
  | 'scrape_comments'
  | 'scrape_stats'
  | 'login'
  | 'check_status'
  | 'custom';

export type PlatformId = 'zhihu' | 'wechat' | 'juejin' | 'douyin' | 'xiaohongshu' | 'kuaishou';

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
       | 'import_docx_zhihu';  // Zhihu 2-step import
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
