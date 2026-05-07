import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';

export type LlmProvider = 'openai' | 'perplexity';

@Injectable()
export class LlmService {
  private openaiClient: OpenAI | null = null;
  private perplexityClient: OpenAI | null = null;

  private getOpenAIClient() {
    if (this.openaiClient) return this.openaiClient;

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
    if (this.perplexityClient) return this.perplexityClient;

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

    const kwargs: any = {
      model,
      messages: [
        {
          role: 'system',
          content: params.system,
        },
        {
          role: 'user',
          content: params.user,
        },
      ],
    };

    /**
     * Perplexity không ép response_format ở đây để tránh lỗi compatibility.
     * OpenAI gpt-5 có thể dùng json_object.
     */
    if (provider === 'openai' && model.includes('gpt-5')) {
      kwargs.response_format = { type: 'json_object' };
    }

    const response = await client.chat.completions.create(kwargs);

    const text = response.choices[0]?.message?.content ?? '{}';

    return this.robustParseJson(text);
  }

  private robustParseJson(text: string): Record<string, any> {
    try {
      return JSON.parse(text);
    } catch {
      // continue
    }

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');

    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        // continue
      }
    }

    return {};
  }
}
