/**
 * HumanSimulator — simulates human-like browser interactions
 * to avoid bot detection by platforms.
 *
 * Replaces direct DOM manipulation with natural mouse/keyboard/scroll patterns.
 */

export interface MouseMoveConfig {
  speed: 'slow' | 'normal' | 'fast';
  overshoot: boolean;
  midPauseProbability: number;
}

export interface TypeConfig {
  wpm: number;
  variance: number;
  typoRate: number;
  pasteChunkSize: number;
}

export interface ScrollConfig {
  style: 'reading' | 'scanning' | 'searching';
  pauseProbability: number;
  backScrollProbability: number;
  minPauseMs: number;
  maxPauseMs: number;
}

const DEFAULTS: Record<string, MouseMoveConfig | TypeConfig | ScrollConfig> = {
  mouseMove: { speed: 'normal', overshoot: true, midPauseProbability: 0.1 } as MouseMoveConfig,
  type: { wpm: 40, variance: 0.3, typoRate: 0.02, pasteChunkSize: 30 } as TypeConfig,
  scroll: { style: 'scanning', pauseProbability: 0.3, backScrollProbability: 0.05, minPauseMs: 300, maxPauseMs: 1500 } as ScrollConfig,
};

export class HumanSimulator {
  private speedMultiplier: number;

  constructor(humanSpeed: 'slow' | 'normal' | 'fast' = 'normal') {
    this.speedMultiplier = { slow: 1.5, normal: 1.0, fast: 0.5 }[humanSpeed];
  }

  /** Random delay between min and max milliseconds */
  async wait(minMs: number, maxMs: number, reason?: string): Promise<void> {
    const delay = (minMs + Math.random() * (maxMs - minMs)) * this.speedMultiplier;
    if (reason) {
      console.log(`[HumanSim] Waiting ${Math.round(delay)}ms: ${reason}`);
    }
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Click an element with human-like mouse movement.
   * Phase 2: will include bezier curve mouse movement via chrome.debugger.
   */
  async click(selector: string, config?: Partial<MouseMoveConfig>): Promise<void> {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) throw new Error(`Element not found: ${selector}`);

    const cfg = { ...DEFAULTS.mouseMove as MouseMoveConfig, ...config };

    // Hover before click
    await this.wait(80, 200, 'hover');
    el.focus();
    await this.wait(50, 150, 'pre-click');
    el.click();
    await this.wait(100, 300, 'post-click');
  }

  /**
   * Type text with variable speed and occasional corrections.
   * Phase 2: will use Input.dispatchKeyEvent via chrome.debugger.
   */
  async type(selector: string, text: string, config?: Partial<TypeConfig>): Promise<void> {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (!el) throw new Error(`Element not found: ${selector}`);

    const cfg = { ...DEFAULTS.type as TypeConfig, ...config };
    el.focus();
    await this.wait(100, 300, 'focus');

    // For long text, paste in chunks
    if (text.length > cfg.pasteChunkSize * 2) {
      for (let i = 0; i < text.length; i += cfg.pasteChunkSize) {
        const chunk = text.slice(i, i + cfg.pasteChunkSize);
        el.value += chunk;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await this.wait(100, 400, `chunk ${Math.floor(i / cfg.pasteChunkSize) + 1}`);
      }
    } else {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    await this.wait(100, 300, 'after-type');
  }

  /**
   * Scroll with natural behavior.
   * Phase 2: will use Input.dispatchMouseEvent wheel events.
   */
  async scroll(
    containerSelector: string,
    direction: 'up' | 'down',
    amount: number,
    config?: Partial<ScrollConfig>
  ): Promise<void> {
    const cfg = { ...DEFAULTS.scroll as ScrollConfig, ...config };

    const el = containerSelector
      ? document.querySelector(containerSelector)
      : window;

    if (!el) throw new Error(`Container not found: ${containerSelector}`);

    const sign = direction === 'down' ? 1 : -1;
    const actualAmount = amount * (0.7 + Math.random() * 0.6); // ±30% variance

    el.scrollBy({ top: sign * actualAmount, behavior: 'smooth' });

    // Occasional pause after scroll ("reading")
    if (Math.random() < cfg.pauseProbability) {
      await this.wait(cfg.minPauseMs, cfg.maxPauseMs, 'reading pause');
    }

    // Occasional back-scroll ("confirming what was read")
    if (Math.random() < cfg.backScrollProbability) {
      el.scrollBy({ top: sign * -50 * Math.random(), behavior: 'smooth' });
      await this.wait(200, 500, 'back-scroll');
    }
  }

  /**
   * Select an option from a dropdown.
   */
  async select(selector: string, value: string): Promise<void> {
    const el = document.querySelector(selector) as HTMLSelectElement;
    if (!el) throw new Error(`Select not found: ${selector}`);

    await this.click(selector);
    await this.wait(100, 300, 'select-open');

    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Drag and drop (placeholder — Phase 2).
   */
  async dragDrop(sourceSelector: string, targetSelector: string): Promise<void> {
    console.log(`[HumanSim] dragDrop: ${sourceSelector} → ${targetSelector} (stub)`);
  }
}
