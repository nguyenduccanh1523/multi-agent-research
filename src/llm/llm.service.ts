import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import OpenAI from 'openai';

export type LlmProvider = 'openai' | 'perplexity';

@Injectable()
export class LlmService {
  private openaiClient: OpenAI | null = null;
  private perplexityClient: OpenAI | null = null;
  private readonly logger = new Logger(LlmService.name);

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
    label?: string;
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

    this.applyTokenLimit(requestPayload, model, params.maxTokens);

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

    const llmStartedAt = Date.now();

    this.logger.log(
      `[LLMStart] label=${params.label ?? 'unknown'} provider=${provider} model=${model} promptChars=${
        params.user.length
      } systemChars=${params.system.length} maxTokens=${
        params.maxTokens ?? 'default'
      } responseFormat=${params.responseFormat ? 'yes' : 'no'}`,
    );

    let response;

    try {
      response = await client.chat.completions.create(requestPayload);
    } catch (error) {
      this.logger.error(
        `[LLMFailed] label=${params.label ?? 'unknown'} provider=${provider} model=${model} took=${
          Date.now() - llmStartedAt
        }ms error=${error instanceof Error ? error.message : String(error)}`,
        error as any,
      );

      throw error;
    }

    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    const finishReason = choice?.finish_reason ?? 'unknown';
    const usage = response.usage;

    this.logger.log(
      `[LLMDone] label=${params.label ?? 'unknown'} provider=${provider} model=${model} took=${
        Date.now() - llmStartedAt
      }ms finishReason=${finishReason} responseChars=${content.length} promptTokens=${
        usage?.prompt_tokens ?? 'n/a'
      } completionTokens=${usage?.completion_tokens ?? 'n/a'} totalTokens=${
        usage?.total_tokens ?? 'n/a'
      }`,
    );

    if (!content.trim()) {
      this.logger.warn(
        `[LLMEmptyContent] label=${params.label ?? 'unknown'} provider=${provider} model=${model} finishReason=${finishReason} promptTokens=${
          usage?.prompt_tokens ?? 'n/a'
        } completionTokens=${usage?.completion_tokens ?? 'n/a'} maxTokens=${
          params.maxTokens ?? 'default'
        }`,
      );
    }

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

  private applyTokenLimit(payload: any, model: string, limit?: number) {
    if (!limit) return;

    delete payload.max_tokens;
    delete payload.max_completion_tokens;

    if (model.includes('gpt-5')) {
      payload.max_completion_tokens = limit;
      return;
    }

    payload.max_tokens = limit;
  }

  async text(params: {
    provider?: LlmProvider;
    system: string;
    user: string;
    level?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    label?: string;
  }): Promise<string> {
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
          content: params.system,
        },
        {
          role: 'user',
          content: params.user,
        },
      ],
    };

    this.applyTokenLimit(requestPayload, model, params.maxTokens);

    if (params.temperature !== undefined) {
      requestPayload.temperature = params.temperature;
    }

    if (params.topP !== undefined) {
      requestPayload.top_p = params.topP;
    }

    const llmStartedAt = Date.now();

    this.logger.log(
      `[LLMTextStart] label=${params.label ?? 'unknown'} provider=${provider} model=${model} promptChars=${
        params.user.length
      } systemChars=${params.system.length} maxTokens=${
        params.maxTokens ?? 'default'
      }`,
    );

    try {
      const response = await client.chat.completions.create(requestPayload);

      const content = response.choices[0]?.message?.content ?? '';

      const usage = response.usage;

      this.logger.log(
        `[LLMTextDone] label=${params.label ?? 'unknown'} provider=${provider} model=${model} took=${
          Date.now() - llmStartedAt
        }ms responseChars=${content.length} promptTokens=${
          usage?.prompt_tokens ?? 'n/a'
        } completionTokens=${usage?.completion_tokens ?? 'n/a'} totalTokens=${
          usage?.total_tokens ?? 'n/a'
        }`,
      );

      return content;
    } catch (error) {
      this.logger.error(
        `[LLMTextFailed] label=${params.label ?? 'unknown'} provider=${provider} model=${model} took=${
          Date.now() - llmStartedAt
        }ms error=${error instanceof Error ? error.message : String(error)}`,
        error as any,
      );

      throw error;
    }
  }
}
