import { Injectable, Logger } from '@nestjs/common';

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

  private readonly logger = new Logger(CompanyProfileDbAgent.name);

  constructor(
    private readonly researchDataRepo: ResearchDataRepository,
    private readonly rag: RagRetrievalService,
    private readonly companyProfileCache: CompanyProfileRedisCacheService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const userId = Number(input.researchInput.user_id);

    if (!Number.isFinite(userId)) {
      throw new Error('Invalid user_id for CompanyProfileDbAgent');
    }

    /**
     * Quan trọng:
     * Luôn đọc DB trước để biết profile hiện tại có đổi chưa.
     * Không được check agent-output cache trước DB, vì user có thể vừa update profile.
     */
    const latestProfile =
      await this.researchDataRepo.getCompanyProfileByUser(userId);

    const structuredProfile = {
      companyId: latestProfile.companyId,
      companyName: latestProfile.companyName,
      website: latestProfile.website,

      documentsAi: latestProfile.documentsAi,
      productInfor: latestProfile.productInfor,
      products: latestProfile.products,

      partners: latestProfile.partners,
      competitors: latestProfile.competitors,
    };

    const latestProfileHash =
      this.companyProfileCache.buildProfileHash(structuredProfile);

    const cachedStructured =
      await this.companyProfileCache.getStructuredProfileWithMeta(userId);

    let structuredProfileCacheHit = false;

    if (!cachedStructured) {
      this.logger.log(
        `[CompanyProfileDbAgent] structured cache MISS userId=${userId}`,
      );

      await this.companyProfileCache.setStructuredProfile({
        userId,
        profile: structuredProfile,
        profileHash: latestProfileHash,
      });
    } else if (cachedStructured.profileHash !== latestProfileHash) {
      this.logger.warn(
        `[CompanyProfileDbAgent] profile changed userId=${userId} oldHash=${cachedStructured.profileHash} newHash=${latestProfileHash}`,
      );

      await this.companyProfileCache.setStructuredProfile({
        userId,
        profile: structuredProfile,
        profileHash: latestProfileHash,
      });
    } else {
      structuredProfileCacheHit = true;

      this.logger.log(
        `[CompanyProfileDbAgent] structured cache HIT userId=${userId} profileHash=${latestProfileHash}`,
      );
    }

    /**
     * Sau khi đã có latestProfileHash, mới được check full output cache.
     * Cache key lúc này phụ thuộc cả research input + profileHash.
     */
    const cachedAgentOutput = await this.companyProfileCache.getAgentOutput({
      userId,
      input: input.researchInput,
      profileHash: latestProfileHash,
    });

    if (cachedAgentOutput) {
      return {
        rawOutput: {
          agent: this.agentType,
          source: 'redis-agent-output-cache',
          cacheHit: true,
          profileHash: latestProfileHash,
        },
        normalizedOutput: {
          ...cachedAgentOutput,
          cacheHit: true,
          structuredProfileCacheHit,
          cacheSource: 'redis-agent-output-cache',
          profileHash: latestProfileHash,
        },
        metadata: {
          model: 'redis-cache',
          latencyMs: Date.now() - started,
        },
      };
    }

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

      profileHash: latestProfileHash,

      cacheHit: false,
      structuredProfileCacheHit,
      cacheSource: structuredProfileCacheHit
        ? 'redis-structured-profile-cache'
        : 'database',
    };

    await this.companyProfileCache.setAgentOutput({
      userId,
      input: input.researchInput,
      normalizedOutput,
      profileHash: latestProfileHash,
    });

    return {
      rawOutput: {
        agent: this.agentType,
        source: structuredProfileCacheHit
          ? 'redis-structured-profile-cache+tb_embeddings'
          : 'database+tb_embeddings',
        cacheHit: false,
        structuredProfileCacheHit,
        profileHash: latestProfileHash,
      },
      normalizedOutput,
      metadata: {
        model: 'database+tb_embeddings+redis-cache',
        latencyMs: Date.now() - started,
      },
    };
  }
}
