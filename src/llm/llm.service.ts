import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';

export type LlmProvider = 'openai' | 'perplexity';

@Injectable()
export class LlmService {
  private openaiClient: OpenAI | null = null;
  private perplexityClient: OpenAI | null = null;

  private getOpenAIClient() {
    if (this.openaiClient) {
      return this.openaiClient;
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY is missing in .env',
      );
    }

    this.openaiClient = new OpenAI({ apiKey });
    return this.openaiClient;
  }

  private getPerplexityClient() {
    if (this.perplexityClient) {
      return this.perplexityClient;
    }

    const apiKey = process.env.PERPLEXITY_KEY;

    if (!apiKey) {
      throw new InternalServerErrorException(
        'PERPLEXITY_KEY is missing in .env',
      );
    }

    this.perplexityClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.perplexity.ai',
    });

    return this.perplexityClient;
  }

  async json(params: {
    provider?: LlmProvider;
    system: string;
    user: string;
    level?: string;
    model?: string;
    responseFormat?: Record<string, any>;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  }): Promise<Record<string, any>> {
    const provider = params.provider ?? 'openai';
    const level = params.level ?? 'detail';

    const client =
      provider === 'perplexity'
        ? this.getPerplexityClient()
        : this.getOpenAIClient();

    const model =
      params.model ??
      (provider === 'perplexity'
        ? (process.env.PERPLEXITY_MODEL ?? 'sonar-pro')
        : level === 'simple'
          ? (process.env.OPENAI_MODEL_SIMPLE ?? 'gpt-4o')
          : (process.env.OPENAI_MODEL_DETAIL ?? 'gpt-5'));

    const requestPayload: any = {
      model,
      messages: [
        {
          role: 'system',
          content:
            params.system +
            '\n\nReturn ONLY one valid JSON object. No markdown. No code fences.',
        },
        {
          role: 'user',
          content: params.user,
        },
      ],
    };

    if (params.maxTokens) {
      requestPayload.max_tokens = params.maxTokens;
    }

    /**
     * Không set mặc định temperature/top_p cho gpt-5.
     * Một số model chỉ chấp nhận default temperature.
     */
    if (params.temperature !== undefined) {
      requestPayload.temperature = params.temperature;
    }

    if (params.topP !== undefined) {
      requestPayload.top_p = params.topP;
    }

    if (params.responseFormat) {
      requestPayload.response_format = params.responseFormat;
    } else if (provider === 'openai') {
      requestPayload.response_format = {
        type: 'json_object',
      };
    }

    const response = await client.chat.completions.create(requestPayload);

    const content = response.choices[0]?.message?.content ?? '{}';

    const parsed = this.robustParseJson(content);

    if (Object.keys(parsed).length === 0) {
      console.warn('[LlmService] Empty JSON parsed', {
        provider,
        model,
        contentPreview: content.slice(0, 500),
      });
    }

    return parsed;
  }

  private robustParseJson(text: string): Record<string, any> {
    if (!text) {
      return {};
    }

    const cleaned = this.stripCodeFence(text);

    try {
      const parsed = JSON.parse(cleaned);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // continue
    }

    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');

    if (first >= 0 && last > first) {
      try {
        const parsed = JSON.parse(cleaned.slice(first, last + 1));

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // continue
      }
    }

    return {};
  }

  private stripCodeFence(value: string) {
    let text = value.trim();

    if (text.startsWith('```')) {
      text = text.replace(/^```json/i, '');
      text = text.replace(/^```/i, '');
      text = text.replace(/```$/i, '');
      text = text.trim();
    }

    return text;
  }
}
