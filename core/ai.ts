/**
 * AI Engine — DeepSeek API wrapper for intent parsing and decision-making.
 * 
 * Currently text-only. Future: may extend to vision models for
 * screenshot-based page understanding.
 */

const DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

interface AIConfig {
  apiKey: string;
  apiUrl?: string;
  model?: string;
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class AIEngine {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = {
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      ...config,
    };
  }

  /**
   * Send a prompt to DeepSeek and get the response.
   */
  async chat(messages: AIMessage[]): Promise<AIResponse> {
    const response = await fetch(this.config.apiUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${err}`);
    }

    const json = await response.json();
    return {
      content: json.choices?.[0]?.message?.content || '',
      usage: json.usage,
    };
  }

  /**
   * Parse user intent from natural language into a structured action.
   */
  async parseIntent(userInput: string, availableActions: string[], availablePlatforms: string[]): Promise<{
    intent: string;
    platform: string;
    params: Record<string, unknown>;
    confidence: number;
  }> {
    const systemPrompt = `You are Little Finger's intent parser. Convert user input to JSON.

Available actions: ${availableActions.join(', ')}
Available platforms: ${availablePlatforms.join(', ')}

Return ONLY valid JSON:
{
  "intent": "<action>",
  "platform": "<platform>",
  "params": {},
  "confidence": 0.0-1.0
}`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
    ]);

    try {
      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback: return a default with low confidence
      return {
        intent: 'unknown',
        platform: '',
        params: {},
        confidence: 0,
      };
    }
  }

  /**
   * Handle an unexpected page state — ask AI what to do.
   */
  async handleUnexpectedState(
    intent: string,
    currentState: string,
    domSnapshot: string,
  ): Promise<string> {
    const systemPrompt = `You are Little Finger's error handler. 
The user wanted to ${intent}, but the page shows: "${currentState}".
Decide what to do next: retry, login, skip, or abort. Return only the decision word.`;

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: domSnapshot.slice(0, 3000) },
    ]);

    return response.content.trim().toLowerCase();
  }
}
