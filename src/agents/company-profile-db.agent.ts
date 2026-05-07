import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { ResearchDataRepository } from '../orchestrator/research-data.repository';
import { RagRetrievalService } from '../rag/rag-retrieval.service';
import { CompanyProfileRedisCacheService } from '../redis/company-profile-redis-cache.service';
import { BaseAgent } from './base-agent.interface';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';

@Injectable()
export class CompanyProfileDbAgent implements BaseAgent {
  agentType = AgentType.COMPANY_PROFILE_DB;

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly rag: RagRetrievalService,
    private readonly companyProfileCache: CompanyProfileRedisCacheService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const userId = Number(input.researchInput.user_id);

    /**
     * Level 1:
     * Nếu cùng user + cùng name/url/jobtitle/focus_on
     * thì trả thẳng output từ Redis.
     */
    const cachedAgentOutput = await this.companyProfileCache.getAgentOutput({
      userId,
      input: input.researchInput,
    });

    if (cachedAgentOutput) {
      return {
        rawOutput: {
          agent: this.agentType,
          source: 'redis-agent-output-cache',
          cacheHit: true,
        },
        normalizedOutput: {
          ...cachedAgentOutput,
          cacheHit: true,
          cacheSource: 'redis-agent-output-cache',
        },
        metadata: {
          model: 'redis-cache',
          latencyMs: Date.now() - started,
        },
      };
    }

    /**
     * Level 2:
     * Nếu chưa có full output cache,
     * thử lấy structured profile từ Redis để tránh query nhiều bảng.
     */
    let structuredProfile =
      await this.companyProfileCache.getStructuredProfile(userId);

    let structuredProfileCacheHit = true;

    if (!structuredProfile) {
      structuredProfileCacheHit = false;

      const profile =
        await this.researchDataRepo.getCompanyProfileByUser(userId);

      structuredProfile = {
        companyId: profile.companyId,
        companyName: profile.companyName,
        website: profile.website,

        documentsAi: profile.documentsAi,
        productInfor: profile.productInfor,
        products: profile.products,

        partners: profile.partners,
        competitors: profile.competitors,
      };

      await this.companyProfileCache.setStructuredProfile({
        userId,
        profile: structuredProfile,
      });
    }

    /**
     * Profile embedding context vẫn phụ thuộc query/focus_on.
     * Nếu full output cache miss thì cần search embedding lại để context đúng hơn.
     */
    const query = [
      input.researchInput.name,
      input.researchInput.url,
      input.researchInput.jobtitle,
      input.researchInput.focus_on,
      JSON.stringify(
        structuredProfile.productInfor ?? structuredProfile.products ?? [],
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const profileEmbeddingContext = await this.rag.getCompanyProfileContext({
      companyId: Number(structuredProfile.companyId),
      query,
      limit: 10,
      maxChars: 5000,
    });

    const normalizedOutput = {
      ...structuredProfile,
      profileEmbeddingContext,

      cacheHit: false,
      structuredProfileCacheHit,
      cacheSource: structuredProfileCacheHit
        ? 'redis-structured-profile-cache'
        : 'database',
    };

    /**
     * Lưu full output để lần sau cùng search input trả nhanh nhất.
     */
    await this.companyProfileCache.setAgentOutput({
      userId,
      input: input.researchInput,
      normalizedOutput,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        source: structuredProfileCacheHit
          ? 'redis-structured-profile-cache+tb_embeddings'
          : 'database+tb_embeddings',
        cacheHit: false,
        structuredProfileCacheHit,
      },
      normalizedOutput,
      metadata: {
        model: 'database+tb_embeddings+redis-cache',
        latencyMs: Date.now() - started,
      },
    };
  }
}
