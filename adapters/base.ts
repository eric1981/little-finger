import type { DomSnapshot, PageState, Article, Step, StepResult, ScrapeParams } from '../core/types';

/**
 * Platform adapter interface — documents the contract every adapter follows.
 *
 * Note: concrete adapters (ZhihuAdapter, etc.) currently use a simplified form
 * (Generator<Step> instead of AsyncGenerator<Step, StepResult>), and are wired
 * directly in entrypoints/background.ts. This interface documents the full
 * contract for future refactors (e.g. re-introducing a registry).
 */
export interface IPlatformAdapter {
  // Metadata
  id: string;
  name: string;
  domains: string[];

  // Capabilities
  capabilities: {
    publish: 'markdown' | 'richtext' | 'video' | null;
    scrapeArticles: boolean;
    scrapeComments: boolean;
    scrapeStats: boolean;
    login: 'qrcode' | 'password' | 'sms' | 'auto' | null;
  };

  // Entry URLs for different contexts
  entryUrl: Record<string, string>;

  /** Determine what page we're on from a DOM snapshot */
  detectState(dom: DomSnapshot): PageState;

  /** Publish an article — yields steps, returns result */
  publish(article: Article, state?: PageState): Generator<Step>;

  /** Scrape content — yields steps, returns results (future) */
  scrape?(params: ScrapeParams): AsyncGenerator<Step, StepResult<unknown[]>>;

  /** Trigger login flow (future) */
  login?(): AsyncGenerator<Step, boolean>;
}
