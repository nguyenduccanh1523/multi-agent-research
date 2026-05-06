import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import { RedisCacheService } from './redis-cache.service';

export interface CompanyProfileStructuredCache {
  userId: number;
  profile: Record<string, any>;
  cachedAt: string;
}

export interface CompanyProfileAgentOutputCache {
  userId: number;
  requestHash: string;
  normalizedOutput: Record<string, any>;
  cachedAt: string;
}

@Injectable()
export class CompanyProfileRedisCacheService {
  /**
   * Có thể thêm vào .env:
   * COMPANY_PROFILE_CACHE_TTL_SECONDS=1800
   */
  private readonly ttlSeconds = Number(
    process.env.COMPANY_PROFILE_CACHE_TTL_SECONDS ?? 1800,
  );

  constructor(private readonly redis: RedisCacheService) {}

  async getStructuredProfile(
    userId: number,
  ): Promise<Record<string, any> | null> {
    const version = await this.getVersion(userId);

    const cached = await this.redis.getJson<CompanyProfileStructuredCache>(
      this.structuredProfileKey(userId, version),
    );

    return cached?.profile ?? null;
  }

  async setStructuredProfile(params: {
    userId: number;
    profile: Record<string, any>;
  }): Promise<void> {
    const version = await this.getVersion(params.userId);

    await this.redis.setJson<CompanyProfileStructuredCache>(
      this.structuredProfileKey(params.userId, version),
      {
        userId: params.userId,
        profile: params.profile,
        cachedAt: new Date().toISOString(),
      },
      this.ttlSeconds,
    );
  }

  async getAgentOutput(params: {
    userId: number;
    input: Record<string, any>;
  }): Promise<Record<string, any> | null> {
    const version = await this.getVersion(params.userId);
    const requestHash = this.buildRequestHash(params.input);

    const cached = await this.redis.getJson<CompanyProfileAgentOutputCache>(
      this.agentOutputKey(params.userId, version, requestHash),
    );

    return cached?.normalizedOutput ?? null;
  }

  async setAgentOutput(params: {
    userId: number;
    input: Record<string, any>;
    normalizedOutput: Record<string, any>;
  }): Promise<void> {
    const version = await this.getVersion(params.userId);
    const requestHash = this.buildRequestHash(params.input);

    await this.redis.setJson<CompanyProfileAgentOutputCache>(
      this.agentOutputKey(params.userId, version, requestHash),
      {
        userId: params.userId,
        requestHash,
        normalizedOutput: params.normalizedOutput,
        cachedAt: new Date().toISOString(),
      },
      this.ttlSeconds,
    );
  }

  /**
   * Gọi hàm này sau khi user update company profile:
   * - upload file mới
   * - update product
   * - update partner/enemy
   * - re-embed company profile
   *
   * Cơ chế:
   * - tăng version
   * - key cũ không cần delete ngay, tự hết hạn theo TTL
   */
  async invalidateUser(userId: number) {
    const newVersion = await this.redis.incr(this.versionKey(userId));

    return {
      message: 'Company profile Redis cache invalidated',
      userId,
      newVersion,
    };
  }

  async getDebugInfo(userId: number) {
    const version = await this.getVersion(userId);

    return {
      userId,
      version,
      namespace: process.env.REDIS_NAMESPACE ?? 'app',
      ttlSeconds: this.ttlSeconds,
      structuredProfileKey: this.redis.buildNamespacedKey(
        this.structuredProfileKey(userId, version),
      ),
      note: 'Agent output keys include request hash, so they are generated per search input.',
    };
  }

  buildRequestHash(input: Record<string, any>) {
    /**
     * Chỉ hash các field ảnh hưởng đến profile context.
     * Không hash selected_tools vì Company Profile Agent không phụ thuộc tool selection.
     */
    const payload = {
      name: input.name ?? null,
      url: input.url ?? null,
      jobtitle: input.jobtitle ?? null,
      focus_on: input.focus_on ?? null,
    };

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 24);
  }

  private async getVersion(userId: number): Promise<number> {
    const version = await this.redis.getNumber(this.versionKey(userId));
    return version ?? 0;
  }

  private versionKey(userId: number) {
    return `company-profile:version:user:${userId}`;
  }

  private structuredProfileKey(userId: number, version: number) {
    return `company-profile:structured:user:${userId}:v:${version}`;
  }

  private agentOutputKey(userId: number, version: number, requestHash: string) {
    return `company-profile:agent-output:user:${userId}:v:${version}:h:${requestHash}`;
  }
}
