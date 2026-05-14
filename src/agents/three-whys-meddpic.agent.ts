import { Injectable, Logger } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../llm/prompt.service';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

@Injectable()
export class ThreeWhysMeddpicAgent implements BaseAgent {
  agentType = AgentType.THREE_WHYS_MEDDPIC;

  private readonly logger = new Logger(ThreeWhysMeddpicAgent.name);

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly llm: LlmService,
    private readonly prompts: PromptService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const profile = input.previousOutputs[AgentType.COMPANY_PROFILE_DB];
    const overview = input.previousOutputs[AgentType.COMPANY_RESEARCH_OVERVIEW];

    if (!profile) {
      throw new Error('COMPANY_PROFILE_DB output is missing');
    }

    if (!overview) {
      throw new Error('COMPANY_RESEARCH_OVERVIEW output is missing');
    }

    const researchCompanyId = Number(overview.researchCompanyId);

    if (!Number.isFinite(researchCompanyId)) {
      throw new Error('Invalid researchCompanyId for ThreeWhysMeddpicAgent');
    }

    const level = input.researchInput.level === 'simple' ? 'simple' : 'detail';

    const model =
      level === 'simple'
        ? (process.env.THREE_WHYS_MEDDPIC_MODEL_SIMPLE ??
          process.env.COMPARISON_MODEL_SIMPLE ??
          process.env.OPENAI_MODEL_SIMPLE ??
          'gpt-4o')
        : (process.env.THREE_WHYS_MEDDPIC_MODEL_DETAIL ??
          process.env.COMPARISON_MODEL_DETAIL ??
          process.env.OPENAI_MODEL_DETAIL ??
          'gpt-5');

    const isGpt5 = model.includes('gpt-5');

    const temperature =
      level === 'simple' && model.includes('gpt-4o') ? 0.2 : undefined;

    const focusOn =
      overview.focusOn ?? input.researchInput.focus_on ?? 'business solutions';

    const role =
      overview.role ?? input.researchInput.jobtitle ?? 'decision maker';

    const productSource = profile.productInfor ?? profile.products ?? '';

    const { productSummary } = this.summarizeProductInfo(productSource);

    const embeddedContext = this.buildEmbeddedContext({
      overview,
      focusOn,
      productSummary,
    });

    const profileText = this.safeToPromptText(profile.documentsAi);

    const companyInformation = this.safeToPromptText(
      profile.profileEmbeddingContext,
    );

    const competitorInformation = this.safeToPromptText(profile.competitors);
    const partnerInformation = this.safeToPromptText(profile.partners);

    /**
     * STEP 1:
     * Dùng đúng prompt chính của 3Whys.
     * Không dùng strict prompt để sinh nội dung 3Whys.
     */
    const threeWhysPrompt = this.prompts.threeWhysOnlyPrompt({
      level,
      focusOn,
    });

    const threeWhysUserPrompt = this.prompts.threeWhysOnlyUserPrompt({
      embeddedContext,
      focusOn,

      targetCompanyName: overview.companyName ?? input.researchInput.name ?? '',

      targetWebsite: overview.website ?? input.researchInput.url ?? '',

      corporateInitiatives: overview.corporateInitiatives ?? '',
      triggerEvents: overview.triggerEvents ?? '',
      techStack: overview.techStack ?? '',
      financialCapacity: overview.financialCapacity ?? '',

      primaryCompanyName: profile.companyName ?? '',
      primaryWebsite: profile.website ?? '',
      profile: profileText,
      companyInformation,
      competitorInformation,
      partnerInformation,
      productSummary,

      role,
      similarCompaniesContext: '',
    });

    const threeWhysStarted = Date.now();

    this.logger.log(
      `[ThreeWhysStep1Start] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} model=${model} level=${level} focusOn=${focusOn} promptChars=${threeWhysUserPrompt.length}`,
    );

    this.logger.log(
      `[ThreeWhysPromptContext] pipelineRunId=${input.pipelineRunId} targetCompany=${
        overview.companyName ?? input.researchInput.name ?? ''
      } primaryCompany=${profile.companyName ?? ''} focusOn=${focusOn} productSummaryPreview=${productSummary.slice(
        0,
        200,
      )} targetTechPreview=${this.asString(overview.techStack).slice(0, 200)}`,
    );

    const threeWhysText = await this.llm.text({
      label: 'ThreeWhysMeddpic.step1.3whys',
      provider: 'openai',
      model,
      level,
      system: threeWhysPrompt.system,
      user: threeWhysUserPrompt,
      maxTokens: isGpt5 ? 7000 : level === 'simple' ? 900 : 2200,
      temperature,
    });

    this.logger.log(
      `[ThreeWhysStep1Done] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} took=${
        Date.now() - threeWhysStarted
      }ms responseChars=${threeWhysText.length}`,
    );

    let whyThis = this.extractTagContent(threeWhysText, 'why_this');
    let whyUs = this.extractTagContent(threeWhysText, 'why_us');
    let whyNow = this.extractTagContent(threeWhysText, 'why_now');

    let whyValidation = this.validateThreeWhys({
      whyThis,
      whyUs,
      whyNow,
    });

    if (!whyValidation.valid) {
      this.logger.warn(
        `[ThreeWhysStep1Invalid] pipelineRunId=${input.pipelineRunId} missing=${whyValidation.missing.join(
          ',',
        )}`,
      );

      this.logger.log(
        `[ThreeWhysPromptContext] pipelineRunId=${input.pipelineRunId} targetCompany=${
          overview.companyName ?? input.researchInput.name ?? ''
        } primaryCompany=${profile.companyName ?? ''} focusOn=${focusOn} productSummaryPreview=${productSummary.slice(
          0,
          200,
        )} targetTechPreview=${this.asString(overview.techStack).slice(0, 200)}`,
      );

      const retryText = await this.llm.text({
        label: 'ThreeWhysMeddpic.step1.3whys.retry',
        provider: 'openai',
        model,
        level,
        system:
          threeWhysPrompt.system +
          `

The previous output was invalid because these tags were missing or empty:
${whyValidation.missing.join(', ')}

Return ONLY these tags exactly once:
<why_this>...</why_this>
<why_us>...</why_us>
<why_now>...</why_now>

Do not return JSON.
Do not return markdown.
Do not add text outside the tags.`,
        user: threeWhysUserPrompt,
        maxTokens: isGpt5 ? 8000 : level === 'simple' ? 900 : 2400,
        temperature,
      });

      whyThis = this.extractTagContent(retryText, 'why_this');
      whyUs = this.extractTagContent(retryText, 'why_us');
      whyNow = this.extractTagContent(retryText, 'why_now');

      whyValidation = this.validateThreeWhys({
        whyThis,
        whyUs,
        whyNow,
      });
    }

    if (!whyValidation.valid) {
      throw new Error(
        `ThreeWhys step returned invalid format. Missing fields: ${whyValidation.missing.join(
          ', ',
        )}`,
      );
    }

    /**
     * STEP 2:
     * Dùng đúng prompt chính của MEDDPICS.
     * Strict chỉ nằm ở responseFormat để ép JSON shape.
     */
    const meddpicsPrompt = this.prompts.meddpicsOnlyPrompt({
      level,
      focusOn,
    });

    const meddpicsUserPrompt = this.prompts.meddpicsOnlyUserPrompt({
      whyThis,
      whyUs,
      whyNow,
      focusOn,
      productSummary,
      role,
      embeddedContext,
    });

    this.logger.log(
      `[ThreeWhysStep2Start] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} model=${model} level=${level} focusOn=${focusOn} promptChars=${meddpicsUserPrompt.length}`,
    );

    let meddpicsResult = await this.llm.json({
      label: 'ThreeWhysMeddpic.step2.meddpics',
      provider: 'openai',
      model,
      level,
      system: meddpicsPrompt.system,
      user: meddpicsUserPrompt,
      responseFormat: this.prompts.meddpicsOnlyResponseFormat(),
      maxTokens: isGpt5 ? 9000 : level === 'simple' ? 1400 : 3600,
      temperature,
    });

    let meddpics = this.normalizeMeddpics(meddpicsResult?.meddpics);

    let meddpicsValidation = this.validateMeddpics(meddpics);

    if (!meddpicsValidation.valid) {
      this.logger.warn(
        `[ThreeWhysStep2Invalid] pipelineRunId=${input.pipelineRunId} missing=${meddpicsValidation.missing.join(
          ',',
        )} resultKeys=${Object.keys(meddpicsResult ?? {}).join(',')}`,
      );

      meddpicsResult = await this.llm.json({
        label: 'ThreeWhysMeddpic.step2.meddpics.retry',
        provider: 'openai',
        model,
        level,
        system:
          meddpicsPrompt.system +
          `

The previous MEDDPICS output was invalid because these fields were missing or empty:
${meddpicsValidation.missing.join(', ')}

Return the same MEDDPICS JSON shape again.
Do not leave any field empty.
Do not add extra keys.
Do not return markdown.`,
        user: meddpicsUserPrompt,
        responseFormat: this.prompts.meddpicsOnlyResponseFormat(),
        maxTokens: isGpt5 ? 11000 : level === 'simple' ? 1600 : 4200,
        temperature,
      });

      meddpics = this.normalizeMeddpics(meddpicsResult?.meddpics);
      meddpicsValidation = this.validateMeddpics(meddpics);
    }

    if (!meddpicsValidation.valid) {
      throw new Error(
        `MEDDPICS step returned invalid format. Missing fields: ${meddpicsValidation.missing.join(
          ', ',
        )}`,
      );
    }

    const comparison = await this.researchDataRepo.upsertThreeWhysMeddpic({
      researchCompanyId,
      whyThis,
      whyUs,
      whyNow,
      meddics: meddpics,
      detailLevel: level,
    });

    this.logger.log(
      `[ThreeWhysMeddpicDone] pipelineRunId=${input.pipelineRunId} researchCompanyId=${researchCompanyId} took=${
        Date.now() - started
      }ms whyThisWords=${this.wordCount(comparison.whyThis)} whyUsWords=${this.wordCount(
        comparison.whyUs,
      )} whyNowWords=${this.wordCount(comparison.whyNow)} meddpicsEmpty=${this.isEmptyMeddics(
        meddpics,
      )}`,
    );

    return {
      rawOutput: {
        agent: this.agentType,
        step1: {
          text: threeWhysText,
          whyThis,
          whyUs,
          whyNow,
        },
        step2: {
          result: meddpicsResult,
          meddpics,
        },
        comparison,
      },
      normalizedOutput: {
        whyThis: comparison.whyThis,
        whyUs: comparison.whyUs,
        whyNow: comparison.whyNow,
        meddpics: comparison.meddics,
        detailLevel: comparison.detailLevel,
      },
      metadata: {
        model,
        latencyMs: Date.now() - started,
      },
    };
  }

  private extractTagContent(text: string, tag: string): string {
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = text.match(pattern);

    return match?.[1]?.trim() ?? '';
  }

  private validateThreeWhys(params: {
    whyThis: string;
    whyUs: string;
    whyNow: string;
  }) {
    const missing: string[] = [];

    if (!this.asString(params.whyThis)) {
      missing.push('why_this');
    }

    if (!this.asString(params.whyUs)) {
      missing.push('why_us');
    }

    if (!this.asString(params.whyNow)) {
      missing.push('why_now');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private validateMeddpics(value: Record<string, string>) {
    const missing: string[] = [];

    for (const key of [
      'metrics',
      'economic_buyer',
      'decision_criteria',
      'decision_process',
      'paper_process',
      'identify_pain',
      'champion',
    ] as const) {
      if (!this.asString(value?.[key])) {
        missing.push(`meddpics.${key}`);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private normalizeMeddpics(value: any) {
    const input = value && typeof value === 'object' ? value : {};

    return {
      metrics: this.asString(input.metrics),
      economic_buyer: this.asString(input.economic_buyer),
      decision_criteria: this.asString(input.decision_criteria),
      decision_process: this.asString(input.decision_process),
      paper_process: this.asString(input.paper_process),
      identify_pain: this.asString(input.identify_pain),
      champion: this.asString(input.champion),
    };
  }

  private buildEmbeddedContext(params: {
    overview: Record<string, any>;
    focusOn: string;
    productSummary: string;
  }) {
    const existingContext = this.asString(
      params.overview.researchEmbeddingContext,
    );

    if (existingContext.trim()) {
      return existingContext;
    }

    const parts: string[] = [];

    if (params.focusOn) {
      parts.push(`Focus area: ${params.focusOn}`);
    }

    if (params.overview.corporateInitiatives) {
      parts.push(
        `Corporate initiatives: ${params.overview.corporateInitiatives}`,
      );
    }

    if (params.overview.triggerEvents) {
      parts.push(`Trigger events: ${params.overview.triggerEvents}`);
    }

    if (params.overview.techStack) {
      parts.push(`Technology stack: ${params.overview.techStack}`);
    }

    if (params.overview.financialCapacity) {
      parts.push(`Financial capacity: ${params.overview.financialCapacity}`);
    }

    if (params.productSummary) {
      parts.push(`Our product: ${params.productSummary}`);
    }

    return parts.join('\n');
  }

  private summarizeProductInfo(value: any): {
    productSummary: string;
    productLabel: string;
  } {
    const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');

    if (!raw.trim()) {
      return {
        productSummary: '',
        productLabel: 'our solution suite',
      };
    }

    let parsed: any = null;

    try {
      parsed = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      const clean = this.cleanText(raw).slice(0, 450);

      return {
        productSummary: clean,
        productLabel: 'our solution suite',
      };
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];

    const names: string[] = [];
    const features: string[] = [];

    for (const item of items.slice(0, 6)) {
      if (!item || typeof item !== 'object') continue;

      const name = this.asString(
        item.product_name ?? item.productName ?? item.name,
      );

      if (name && !names.includes(name)) {
        names.push(name);
      }

      const keyFeatures =
        item.key_features ??
        item.features ??
        item.unique_features_summary ??
        item.uniqueFeaturesSummary ??
        [];

      if (Array.isArray(keyFeatures)) {
        for (const feature of keyFeatures.slice(0, 3)) {
          const text = this.asString(feature);

          if (text && !features.includes(text)) {
            features.push(text);
          }
        }
      } else {
        const text = this.asString(keyFeatures);

        if (text && !features.includes(text)) {
          features.push(text);
        }
      }
    }

    const productLabel = names.slice(0, 3).join(', ') || 'our solution suite';

    const parts: string[] = [];

    if (names.length > 0) {
      parts.push(`Portfolio: ${names.join(', ')}`);
    }

    if (features.length > 0) {
      parts.push(`Core capabilities: ${features.slice(0, 6).join(', ')}`);
    }

    return {
      productSummary: this.cleanText(parts.join('. ')).slice(0, 450),
      productLabel,
    };
  }

  private safeToPromptText(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return this.cleanText(value);
    }

    return this.cleanText(JSON.stringify(value));
  }

  private cleanText(value: string): string {
    return String(value ?? '')
      .replace(/[\\[\]\\{\\}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private asString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private wordCount(value: string | null | undefined): number {
    return String(value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  private isEmptyMeddics(value: Record<string, string>): boolean {
    return ![
      value.metrics,
      value.economic_buyer,
      value.decision_criteria,
      value.decision_process,
      value.paper_process,
      value.identify_pain,
      value.champion,
    ].some((item) => String(item ?? '').trim());
  }

  private validateThreeWhysMeddpicResult(result: Record<string, any>) {
    const missing: string[] = [];

    if (!this.asString(result?.why_this)) {
      missing.push('why_this');
    }

    if (!this.asString(result?.why_us)) {
      missing.push('why_us');
    }

    if (!this.asString(result?.why_now)) {
      missing.push('why_now');
    }

    if (!result?.meddpics || typeof result.meddpics !== 'object') {
      missing.push('meddpics');
    }

    const meddpics = this.normalizeMeddpics(result?.meddpics);

    for (const key of [
      'metrics',
      'economic_buyer',
      'decision_criteria',
      'decision_process',
      'paper_process',
      'identify_pain',
      'champion',
    ] as const) {
      if (!this.asString(meddpics[key])) {
        missing.push(`meddpics.${key}`);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
