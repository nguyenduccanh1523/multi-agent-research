import { Injectable } from '@nestjs/common';

import { AgentType } from '../common/enums/agent-type.enum';
import { CompanyProfileMemoryCacheService } from '../memory/company-profile-memory-cache.service';
import {
  AgentRunInput,
  AgentRunOutput,
} from '../orchestrator/types/agent-run.types';
import { BaseAgent } from './base-agent.interface';

@Injectable()
export class CompanyProfileDbAgent implements BaseAgent {
  agentType = AgentType.COMPANY_PROFILE_DB;

  constructor(
    private readonly companyCache: CompanyProfileMemoryCacheService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();

    const name = input.researchInput.name;
    const url = input.researchInput.url;

    const cachedProfile = this.companyCache.getByInput({ name, url });

    if (cachedProfile) {
      return {
        rawOutput: {
          agent: this.agentType,
          source: 'ram-cache',
          cacheHit: true,
          profile: cachedProfile,
        },
        normalizedOutput: {
          ...cachedProfile,
          cacheHit: true,
          source: 'ram-cache',
        },
        metadata: {
          model: 'ram-cache',
          latencyMs: Date.now() - started,
          cacheHit: true,
        },
      };
    }

    await this.fakeDelay(500);

    /**
     * Hiện tại mock DB.
     * Sau này bạn thay đoạn này bằng query database thật.
     */
    const profile = input.researchInput.companyProfile ?? {
      companyName: name,
      website: url,
      industry: 'Unknown',
      partners: [],
      competitors: [],
      description: null,
    };

    const normalizedProfile = {
      companyName: profile.companyName ?? name,
      website: profile.website ?? url,
      industry: profile.industry ?? null,
      description: profile.description ?? null,
      partners: profile.partners ?? [],
      competitors: profile.competitors ?? [],
      rawProfile: profile,
    };

    this.companyCache.setByInput({ name, url }, normalizedProfile);

    return {
      rawOutput: {
        agent: this.agentType,
        source: 'mock-db',
        cacheHit: false,
        profile,
      },
      normalizedOutput: {
        ...normalizedProfile,
        cacheHit: false,
        source: 'mock-db',
      },
      metadata: {
        model: 'mock-db-agent',
        latencyMs: Date.now() - started,
        cacheHit: false,
      },
    };
  }

  private fakeDelay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
