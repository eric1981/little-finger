/**
 * Task Orchestrator — manages task execution lifecycle.
 * 
 * Coordinates: AI Engine → Adapter → HumanSimulator → Content Script
 */

import type { Task, TaskProgress, PlatformId } from '../core/types';
import type { IPlatformAdapter } from '../adapters/base';

export class Orchestrator {
  private activeTasks: Map<string, AbortController> = new Map();

  /**
   * Execute a task and yield progress updates.
   */
  async *execute(
    task: Task,
    adapter: IPlatformAdapter,
    tabId: number,
    onProgress: (p: TaskProgress) => void,
  ): AsyncGenerator<TaskProgress> {
    const controller = new AbortController();
    this.activeTasks.set(task.id, controller);

    try {
      yield {
        id: task.id, type: 'progress', step: 'start',
        message: `开始执行: ${task.action} on ${task.platform}`, progress: 0,
      };

      // Navigate to platform entry URL
      yield {
        id: task.id, type: 'progress', step: 'navigate',
        message: `正在打开 ${adapter.name}...`, progress: 0.1,
      };

      await this.navigate(tabId, adapter.entryUrl['creator']);

      // Wait for page to stabilize
      yield {
        id: task.id, type: 'progress', step: 'wait_ready',
        message: '等待页面加载...', progress: 0.2,
      };

      // Check page state
      const dom = await this.sampleDom(tabId);
      const state = adapter.detectState(dom);

      if (state.page === 'login') {
        yield {
          id: task.id, type: 'error', step: 'login_required',
          message: `${adapter.name} 需要登录`, progress: 0.3,
          success: false,
          error: { code: 'LOGIN_REQUIRED', message: '请先登录', recoverable: true, suggestedAction: 'open_login_page' },
        };
        return;
      }

      yield {
        id: task.id, type: 'progress', step: 'ready',
        message: `页面就绪: ${state.details}`, progress: 0.3,
      };

      // Execute adapter-specific workflow
      yield {
        id: task.id, type: 'result', success: true,
        message: `TODO: ${adapter.name} 工作流尚未实现`,
        progress: 1.0,
        data: { status: 'stub' },
      };

    } catch (err) {
      yield {
        id: task.id, type: 'error', success: false,
        message: String(err), progress: 0,
        error: { code: 'EXECUTION_ERROR', message: String(err), recoverable: false },
      };
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /** Cancel a running task */
  cancel(taskId: string): void {
    const controller = this.activeTasks.get(taskId);
    if (controller) {
      controller.abort();
      this.activeTasks.delete(taskId);
    }
  }

  // ── Helpers ──

  private async navigate(tabId: number, url: string): Promise<void> {
    await chrome.tabs.update(tabId, { url });
    // Wait for load — content script will confirm via message
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  private async sampleDom(tabId: number) {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'SAMPLE_DOM', id: 'orch_sample' });
    return response.data;
  }
}
