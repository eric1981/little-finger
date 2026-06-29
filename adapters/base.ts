import type { DomSnapshot, PageState, Article, Step, StepResult, ScrapeParams } from '../core/types';
import type { HumanSimulator } from '../core/human-simulator';

/**
 * Every platform adapter must implement this interface.
 * Each adapter encapsulates all knowledge about one platform:
 * DOM structure, workflows, error states, and login flows.
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
  publish(article: Article, sim: HumanSimulator): AsyncGenerator<Step, StepResult<{ url: string }>>;

  /** Scrape content — yields steps, returns results */
  scrape(params: ScrapeParams, sim: HumanSimulator): AsyncGenerator<Step, StepResult<unknown[]>>;

  /** Trigger login flow */
  login(sim: HumanSimulator): AsyncGenerator<Step, boolean>;
}
