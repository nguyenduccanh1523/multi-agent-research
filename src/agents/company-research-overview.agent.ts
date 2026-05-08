import { Injectable, Logger } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { LlmService } from '../llm/llm.service';
import { PromptService } from '../llm/prompt.service';
import { DbResearchStore } from '../orchestrator/db-research.store';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { EmbeddingService } from '../rag/embedding.service';
import { RagRetrievalService } from '../rag/rag-retrieval.service';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
}

interface ConductResearchResult {
  officialWebsite: string;
  corporateInitiatives: string;
  triggerEvents: string;
  techStack: string;
  financialCapacity: string;
  domain: string[];
  businessData: Record<string, any>;
  debug: Record<string, any>;
}

@Injectable()
export class CompanyResearchOverviewAgent implements BaseAgent {
  agentType = AgentType.COMPANY_RESEARCH_OVERVIEW;

  private readonly logger = new Logger(CompanyResearchOverviewAgent.name);

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly store: DbResearchStore,
    private readonly embeddingService: EmbeddingService,
    private readonly rag: RagRetrievalService,
    private readonly llm: LlmService,
    private readonly prompts: PromptService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const research = await this.researchDataRepo.createResearchCompany({
      userId: Number(input.researchInput.user_id),
      name: input.researchInput.name,
      url: input.researchInput.url,
      jobtitle: input.researchInput.jobtitle,
      focusOn: input.researchInput.focus_on,
      uploadDocs: input.researchInput.upload_docs ?? [],
      uploadDocsAi: input.researchInput.upload_docs_ai ?? [],
    });

    await this.store.updatePipelineRun(input.pipelineRunId, {
      researchCompanyId: research.researchCompanyId,
    });

    const overview = await this.conductFullResearch({
      companyName: input.researchInput.name,
      websiteUrl: input.researchInput.url,
      taxCode: input.researchInput.tax_code,
      userId: Number(input.researchInput.user_id),
    });

    if (this.isEmptyOverview(overview)) {
      throw new Error(
        `Company Research Overview is empty. companyName=${input.researchInput.name}, website=${input.researchInput.url ?? ''}`,
      );
    }

    let crawl = await this.researchDataRepo.createCrawlData({
      researchCompanyId: research.researchCompanyId,
      corporateInitiatives: overview.corporateInitiatives,
      triggerEvents: overview.triggerEvents,
      techStack: overview.techStack,
      financialCapacity: overview.financialCapacity,
      domain: overview.domain,
      businessData: overview.businessData,
    });

    if (
      ![
        crawl.corporateInitiatives,
        crawl.triggerEvents,
        crawl.techStack,
        crawl.financialCapacity,
      ].some((item) => (item ?? '').trim())
    ) {
      this.logger.warn(
        `CrawlData is empty. researchCompanyId=${research.researchCompanyId}`,
      );
    }

    const docsAi = this.safeJson<any[]>(research.uploadDocsAi, []);

    if (docsAi.length > 0) {
      try {
        const enriched = await this.enrichCrawlWithDocs({
          crawl: {
            corporateInitiatives: crawl.corporateInitiatives ?? '',
            triggerEvents: crawl.triggerEvents ?? '',
            techStack: crawl.techStack ?? '',
            financialCapacity: crawl.financialCapacity ?? '',
            domain: this.safeJson<string[]>(crawl.domain, []),
            businessData: crawl.businessData ?? {},
          },
          uploadDocsAi: docsAi,
          level: input.researchInput.level,
        });

        crawl = await this.researchDataRepo.updateCrawlData({
          crawDataId: crawl.crawDataId,
          corporateInitiatives: enriched.corporate_initiatives ?? '',
          triggerEvents: enriched.trigger_events ?? '',
          techStack: enriched.tech_stack ?? '',
          financialCapacity: enriched.financial_capacity ?? '',
          domain: this.normalizeDomains(enriched.domain ?? []),
          businessData: {
            ...(enriched.business_data ?? {}),
            enrichment_meta: enriched.enrichment_meta ?? {
              sources: {},
              conflicts: [],
            },
          },
        });
      } catch (error) {
        this.logger.warn(
          `enrichCrawlWithDocs failed. researchCompanyId=${research.researchCompanyId}, error=${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.embeddingService.insertCrawlDataEmbeddings({
      researchCompanyId: research.researchCompanyId,
      crawlDataId: crawl.crawDataId,
      crawl: {
        corporateInitiatives: crawl.corporateInitiatives,
        triggerEvents: crawl.triggerEvents,
        techStack: crawl.techStack,
        financialCapacity: crawl.financialCapacity,
        businessData: crawl.businessData,
      },
    });

    const researchEmbeddingContext = await this.rag.getResearchContext({
      researchCompanyId: research.researchCompanyId,
      query: [
        input.researchInput.name,
        input.researchInput.focus_on,
        crawl.corporateInitiatives,
        crawl.triggerEvents,
        crawl.techStack,
        crawl.financialCapacity,
      ]
        .filter(Boolean)
        .join('\n'),
      limit: 8,
      maxChars: 5000,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        research,
        crawl,
        overview,
        researchEmbeddingContext,
      },
      normalizedOutput: {
        researchCompanyId: research.researchCompanyId,
        crawlDataId: crawl.crawDataId,

        companyName: research.companyName,
        website: research.website,
        role: research.role,
        focusOn: research.focusOn,

        officialWebsite: overview.officialWebsite || research.website,

        corporateInitiatives: crawl.corporateInitiatives,
        triggerEvents: crawl.triggerEvents,
        techStack: crawl.techStack,
        financialCapacity: crawl.financialCapacity,
        businessData: crawl.businessData,

        domain: this.safeJson<string[]>(crawl.domain, []),

        createdAt: crawl.createdAt,
        researchCreatedAt: research.createdAt,

        researchEmbeddingContext,
      },
      metadata: {
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        latencyMs: Date.now() - started,
      },
    };
  }

  private async conductFullResearch(params: {
    companyName: string;
    websiteUrl?: string | null;
    taxCode?: string | null;
    userId?: number | null;
  }): Promise<ConductResearchResult> {
    if (!params.companyName) {
      throw new Error('companyName is required');
    }

    const domainFromUrl = params.websiteUrl
      ? this.extractDomain(params.websiteUrl)
      : null;

    const domainSeed = domainFromUrl ? [domainFromUrl] : [];

    const websitePromise = params.websiteUrl
      ? this.fetchWebsiteText(params.websiteUrl)
      : Promise.resolve('');

    const urlSearchPromise = domainFromUrl
      ? this.pplxSearch(`site:${domainFromUrl} "${params.companyName}"`, 5)
      : Promise.resolve<SearchResultItem[]>([]);

    const nameSearchPromise = this.pplxSearch(
      `"${params.companyName}" official website company technology financial initiatives`,
      8,
    );

    const [websiteContent, urlResults, nameResults] = await Promise.all([
      websitePromise.catch((error) => {
        this.logger.warn(`fetchWebsiteText failed: ${String(error)}`);
        return '';
      }),
      urlSearchPromise.catch((error) => {
        this.logger.warn(`urlSearch failed: ${String(error)}`);
        return [];
      }),
      nameSearchPromise.catch((error) => {
        this.logger.warn(`nameSearch failed: ${String(error)}`);
        return [];
      }),
    ]);

    let sourceResults = this.mergeSearchResults(urlResults, nameResults);

    /**
     * Fallback 1: nếu Perplexity search không trả source,
     * dùng SerpAPI để lấy organic results.
     */
    if (sourceResults.length === 0) {
      sourceResults = await this.serpApiSearch({
        companyName: params.companyName,
        websiteUrl: params.websiteUrl,
        limit: 8,
      }).catch((error) => {
        this.logger.warn(`serpApiSearch failed: ${String(error)}`);
        return [];
      });
    }

    const prompt = this.prompts.researchOverviewPrompt();

    /**
     * Attempt 1: gọi Perplexity có response_format.
     */
    let llmResult = await this.llm.json({
      provider: 'perplexity',
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      system: prompt.system,
      maxTokens: 2500,
      responseFormat: this.researchOverviewResponseFormat(),
      user: this.buildResearchOverviewUserPrompt({
        companyName: params.companyName,
        websiteUrl: params.websiteUrl ?? '',
        taxCode: params.taxCode ?? '',
        domainFromUrl: domainFromUrl ?? '',
        websiteContent,
        sourceResults,
      }),
    });

    /**
     * Attempt 2: nếu schema mode trả rỗng, gọi lại không response_format.
     * Nhiều lúc sonar-pro trả tốt hơn khi không ép json_schema.
     */
    if (this.isEmptyResearchLlmResult(llmResult)) {
      this.logger.warn(
        `Research overview schema response is empty. Retrying without response_format. company=${params.companyName}`,
      );

      llmResult = await this.llm.json({
        provider: 'perplexity',
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        system: prompt.system,
        maxTokens: 2500,
        user: this.buildResearchOverviewUserPrompt({
          companyName: params.companyName,
          websiteUrl: params.websiteUrl ?? '',
          taxCode: params.taxCode ?? '',
          domainFromUrl: domainFromUrl ?? '',
          websiteContent,
          sourceResults,
        }),
      });
    }

    /**
     * Attempt 3: nếu vẫn rỗng, ép prompt đơn giản hơn.
     */
    if (this.isEmptyResearchLlmResult(llmResult)) {
      this.logger.warn(
        `Research overview raw response is empty. Retrying simplified prompt. company=${params.companyName}`,
      );

      llmResult = await this.llm.json({
        provider: 'perplexity',
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        system: `
You are a company research agent.
Return ONLY JSON with:
{
  "official_website": "",
  "corporate_initiatives": "",
  "trigger_events": "",
  "tech_stack": "",
  "financial_capacity": "",
  "domain": [],
  "business_data": {}
}
Do not return empty fields unless no public information exists.
`,
        maxTokens: 1800,
        user: JSON.stringify({
          company_name: params.companyName,
          website_url: params.websiteUrl ?? '',
          search_results: sourceResults,
          website_content: this.truncate(websiteContent, 5000),
        }),
      });
    }

    const officialWebsite =
      this.asString(llmResult.official_website) ||
      params.websiteUrl ||
      this.firstValidLink(sourceResults) ||
      '';

    const mergedDomains = this.normalizeDomains([
      ...domainSeed,
      officialWebsite,
      ...(Array.isArray(llmResult.domain) ? llmResult.domain : []),
      ...sourceResults.map((item) => item.link),
    ]);

    const result: ConductResearchResult = {
      officialWebsite,
      corporateInitiatives: this.sanitizeNarrative(
        llmResult.corporate_initiatives,
      ),
      triggerEvents: this.sanitizeNarrative(llmResult.trigger_events),
      techStack: this.sanitizeNarrative(llmResult.tech_stack),
      financialCapacity: this.sanitizeNarrative(llmResult.financial_capacity),
      domain: mergedDomains,
      businessData: {
        ...(this.isPlainObject(llmResult.business_data)
          ? llmResult.business_data
          : {}),
        official_website: officialWebsite,
        source_results: sourceResults,
        source_summary: {
          website_content_chars: websiteContent.length,
          url_search_count: urlResults.length,
          name_search_count: nameResults.length,
          total_source_count: sourceResults.length,
        },
      },
      debug: {
        domainFromUrl,
        sourceResults,
        llmKeys: Object.keys(llmResult ?? {}),
      },
    };

    if (this.isEmptyOverview(result)) {
      this.logger.error(
        `conductFullResearch produced empty overview after retries. company=${params.companyName}, sources=${sourceResults.length}, websiteChars=${websiteContent.length}`,
      );
    }

    return result;
  }

  private async enrichCrawlWithDocs(params: {
    crawl: {
      corporateInitiatives: string;
      triggerEvents: string;
      techStack: string;
      financialCapacity: string;
      domain: string[];
      businessData: Record<string, any>;
    };
    uploadDocsAi: any[];
    level?: string;
  }): Promise<Record<string, any>> {
    const docs = this.truncateDocsForEnrichment(params.uploadDocsAi);

    const prompt = this.prompts.researchOverviewEnrichPrompt();

    return this.llm.json({
      provider: 'perplexity',
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      system: prompt.system,
      maxTokens: 1600,
      responseFormat: this.researchEnrichResponseFormat(),
      user: JSON.stringify({
        crawl_data: {
          corporate_initiatives: params.crawl.corporateInitiatives,
          trigger_events: params.crawl.triggerEvents,
          tech_stack: params.crawl.techStack,
          financial_capacity: params.crawl.financialCapacity,
          domain: params.crawl.domain,
          business_data: params.crawl.businessData,
        },
        upload_docs_ai: docs,
      }),
    });
  }

  private async pplxSearch(
    query: string,
    numResults: number,
  ): Promise<SearchResultItem[]> {
    const prompt = this.prompts.researchSearchPrompt(numResults);

    let result = await this.llm.json({
      provider: 'perplexity',
      model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
      system: prompt.system,
      maxTokens: 1200,
      responseFormat: this.searchResponseFormat(),
      user: JSON.stringify({
        query,
        max_results: numResults,
      }),
    });

    let results = Array.isArray(result.results) ? result.results : [];

    if (results.length === 0) {
      result = await this.llm.json({
        provider: 'perplexity',
        model: process.env.PERPLEXITY_MODEL ?? 'sonar-pro',
        system: prompt.system,
        maxTokens: 1200,
        user: JSON.stringify({
          query,
          max_results: numResults,
          instruction:
            'Return real web search results as JSON. Include title, link, snippet.',
        }),
      });

      results = Array.isArray(result.results) ? result.results : [];
    }

    return results.slice(0, numResults).map((item) => ({
      title: this.asString(item.title),
      link: this.asString(item.link),
      snippet: this.asString(item.snippet),
    }));
  }

  private async fetchWebsiteText(url: string): Promise<string> {
    const normalized = url.startsWith('http') ? url : `https://${url}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(normalized, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      if (!response.ok) {
        return '';
      }

      const html = await response.text();

      return this.htmlToText(html);
    } catch {
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20_000);
  }

  private mergeSearchResults(
    first: SearchResultItem[],
    second: SearchResultItem[],
  ): SearchResultItem[] {
    const map = new Map<string, SearchResultItem>();

    for (const item of [...first, ...second]) {
      if (!item.link) {
        continue;
      }

      const key = this.extractDomain(item.link) || item.link;

      if (!map.has(key)) {
        map.set(key, item);
      }
    }

    return Array.from(map.values()).slice(0, 10);
  }

  private truncateDocsForEnrichment(docs: any[], maxDocs = 6, maxChars = 6000) {
    return docs.slice(0, maxDocs).map((doc, index) => {
      const content = this.asString(doc.content).slice(0, maxChars);

      return {
        id: doc.id ?? index + 1,
        filename: doc.filename ?? '',
        url: doc.url ?? '',
        ext: doc.ext ?? '',
        content,
        chars: content.length,
      };
    });
  }

  private extractDomain(raw?: string | null): string | null {
    if (!raw) {
      return null;
    }

    try {
      const url = raw.startsWith('http') ? raw : `https://${raw}`;
      const parsed = new URL(url);

      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      const cleaned = raw
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .trim()
        .toLowerCase();

      return cleaned || null;
    }
  }

  private normalizeDomains(input: any[]): string[] {
    const output = new Set<string>();

    for (const item of input) {
      const domain = this.extractDomain(String(item ?? ''));

      if (domain) {
        output.add(domain);
      }
    }

    return Array.from(output).sort();
  }

  private sanitizeNarrative(value: any): string {
    const text = this.asString(value).replace(/\s+/g, ' ').trim();

    if (!text) {
      return '';
    }

    if (/^(https?:\/\/)?(www\.)?[^\s/$.?#].[^\s]*$/i.test(text)) {
      return '';
    }

    return text;
  }

  private firstValidLink(results: SearchResultItem[]) {
    return results.find((item) => item.link)?.link ?? '';
  }

  private truncate(value: string, maxChars: number) {
    return (value ?? '').slice(0, maxChars);
  }

  private asString(value: any) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isPlainObject(value: any): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private safeJson<T>(raw: any, fallback: T): T {
    if (!raw) {
      return fallback;
    }

    if (Array.isArray(raw) || typeof raw === 'object') {
      return raw;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  private searchResponseFormat() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'research_search_results',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string' },
                  link: { type: 'string' },
                  snippet: { type: 'string' },
                },
                required: ['title', 'link', 'snippet'],
              },
            },
          },
          required: ['results'],
        },
      },
    };
  }

  private researchOverviewResponseFormat() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'research_overview_response',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            official_website: { type: 'string' },
            corporate_initiatives: { type: 'string' },
            trigger_events: { type: 'string' },
            tech_stack: { type: 'string' },
            financial_capacity: { type: 'string' },
            domain: {
              type: 'array',
              items: { type: 'string' },
            },
            business_data: {
              type: 'object',
            },
          },
          required: [
            'official_website',
            'corporate_initiatives',
            'trigger_events',
            'tech_stack',
            'financial_capacity',
            'domain',
            'business_data',
          ],
        },
      },
    };
  }

  private researchEnrichResponseFormat() {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'research_enrich_response',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            corporate_initiatives: { type: 'string' },
            trigger_events: { type: 'string' },
            tech_stack: { type: 'string' },
            financial_capacity: { type: 'string' },
            domain: {
              type: 'array',
              items: { type: 'string' },
            },
            business_data: {
              type: 'object',
            },
            enrichment_meta: {
              type: 'object',
            },
          },
          required: [
            'corporate_initiatives',
            'trigger_events',
            'tech_stack',
            'financial_capacity',
            'domain',
            'business_data',
            'enrichment_meta',
          ],
        },
      },
    };
  }

  private buildResearchOverviewUserPrompt(params: {
    companyName: string;
    websiteUrl: string;
    taxCode: string;
    domainFromUrl: string;
    websiteContent: string;
    sourceResults: SearchResultItem[];
  }) {
    return JSON.stringify({
      company_name: params.companyName,
      website_url: params.websiteUrl,
      tax_code: params.taxCode,
      website_domain: params.domainFromUrl,
      website_content: this.truncate(params.websiteContent, 8000),
      search_results: params.sourceResults,
      instruction: `
Analyze this company and return complete crawl_data.
You must fill corporate_initiatives, trigger_events, tech_stack, and financial_capacity.
Use website_content and search_results.
If exact data is limited, infer carefully from public evidence and clearly state uncertainty.
Do not return empty strings unless absolutely no information exists.
`,
    });
  }

  private isEmptyOverview(overview: ConductResearchResult) {
    return ![
      overview.corporateInitiatives,
      overview.triggerEvents,
      overview.techStack,
      overview.financialCapacity,
    ].some((item) => (item ?? '').trim());
  }

  private isEmptyResearchLlmResult(result: Record<string, any>) {
    if (!result || Object.keys(result).length === 0) {
      return true;
    }

    return ![
      result.corporate_initiatives,
      result.trigger_events,
      result.tech_stack,
      result.financial_capacity,
    ].some((item) => this.asString(item));
  }

  private async serpApiSearch(params: {
    companyName: string;
    websiteUrl?: string | null;
    limit?: number;
  }): Promise<SearchResultItem[]> {
    const apiKey = process.env.SERPAPI_KEY || process.env.SERPAPI;

    if (!apiKey) {
      return [];
    }

    const domain = this.extractDomain(params.websiteUrl ?? '');

    const query = domain
      ? `site:${domain} ${params.companyName} company initiatives technology financial`
      : `${params.companyName} official website company initiatives technology financial`;

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('num', String(params.limit ?? 8));

    const response = await fetch(url.toString());

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const organicResults = Array.isArray(data.organic_results)
      ? data.organic_results
      : [];

    return organicResults.slice(0, params.limit ?? 8).map((item: any) => ({
      title: this.asString(item.title),
      link: this.asString(item.link),
      snippet: this.asString(item.snippet),
    }));
  }
}
