import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

import { RedisCacheService } from './redis-cache.service';

export interface CompanyProfileStructuredCache {
  userId: number;
  profile: Record<string, any>;
  profileHash: string;
  version: number;
  cachedAt: string;
}

export interface CompanyProfileAgentOutputCache {
  userId: number;
  requestHash: string;
  profileHash: string | null;
  normalizedOutput: Record<string, any>;
  cachedAt: string;
}

@Injectable()
export class CompanyProfileRedisCacheService {
  private readonly logger = new Logger(CompanyProfileRedisCacheService.name);

  private readonly ttlSeconds = Number(
    process.env.COMPANY_PROFILE_CACHE_TTL_SECONDS ?? 1800,
  );

  constructor(private readonly redis: RedisCacheService) {}

  async getStructuredProfile(
    userId: number,
  ): Promise<Record<string, any> | null> {
    const cached = await this.getStructuredProfileWithMeta(userId);
    return cached?.profile ?? null;
  }

  async getStructuredProfileWithMeta(userId: number): Promise<{
    profile: Record<string, any>;
    profileHash: string;
    version: number;
    cachedAt: string;
  } | null> {
    const version = await this.getVersion(userId);
    const key = this.structuredProfileKey(userId, version);

    const cached = await this.redis.getJson<CompanyProfileStructuredCache>(key);

    if (!cached?.profile) {
      this.logger.log(
        `[CompanyProfileCache] structured MISS userId=${userId} version=${version}`,
      );
      return null;
    }

    this.logger.log(
      `[CompanyProfileCache] structured HIT userId=${userId} version=${version} profileHash=${cached.profileHash}`,
    );

    return {
      profile: cached.profile,
      profileHash: cached.profileHash,
      version,
      cachedAt: cached.cachedAt,
    };
  }

  async setStructuredProfile(params: {
    userId: number;
    profile: Record<string, any>;
    profileHash?: string;
  }): Promise<void> {
    const version = await this.getVersion(params.userId);
    const profileHash =
      params.profileHash ?? this.buildProfileHash(params.profile);

    await this.redis.setJson<CompanyProfileStructuredCache>(
      this.structuredProfileKey(params.userId, version),
      {
        userId: params.userId,
        profile: params.profile,
        profileHash,
        version,
        cachedAt: new Date().toISOString(),
      },
      this.ttlSeconds,
    );

    this.logger.log(
      `[CompanyProfileCache] structured SET userId=${params.userId} version=${version} profileHash=${profileHash}`,
    );
  }

  async getAgentOutput(params: {
    userId: number;
    input: Record<string, any>;
    profileHash?: string | null;
  }): Promise<Record<string, any> | null> {
    const version = await this.getVersion(params.userId);
    const requestHash = this.buildRequestHash({
      ...params.input,
      profileHash: params.profileHash ?? null,
    });

    const key = this.agentOutputKey(params.userId, version, requestHash);

    const cached =
      await this.redis.getJson<CompanyProfileAgentOutputCache>(key);

    if (!cached?.normalizedOutput) {
      this.logger.log(
        `[CompanyProfileCache] agent-output MISS userId=${params.userId} version=${version} requestHash=${requestHash} profileHash=${params.profileHash ?? 'null'}`,
      );
      return null;
    }

    this.logger.log(
      `[CompanyProfileCache] agent-output HIT userId=${params.userId} version=${version} requestHash=${requestHash} profileHash=${cached.profileHash ?? 'null'}`,
    );

    return cached.normalizedOutput;
  }

  async setAgentOutput(params: {
    userId: number;
    input: Record<string, any>;
    normalizedOutput: Record<string, any>;
    profileHash?: string | null;
  }): Promise<void> {
    const version = await this.getVersion(params.userId);
    const requestHash = this.buildRequestHash({
      ...params.input,
      profileHash: params.profileHash ?? null,
    });

    await this.redis.setJson<CompanyProfileAgentOutputCache>(
      this.agentOutputKey(params.userId, version, requestHash),
      {
        userId: params.userId,
        requestHash,
        profileHash: params.profileHash ?? null,
        normalizedOutput: params.normalizedOutput,
        cachedAt: new Date().toISOString(),
      },
      this.ttlSeconds,
    );

    this.logger.log(
      `[CompanyProfileCache] agent-output SET userId=${params.userId} version=${version} requestHash=${requestHash} profileHash=${params.profileHash ?? 'null'}`,
    );
  }

  async invalidateUser(userId: number) {
    const newVersion = await this.redis.incr(this.versionKey(userId));

    this.logger.warn(
      `[CompanyProfileCache] INVALIDATED userId=${userId} newVersion=${newVersion}`,
    );

    return {
      message: 'Company profile Redis cache invalidated',
      userId,
      newVersion,
    };
  }

  async getDebugInfo(userId: number) {
    const version = await this.getVersion(userId);
    const structuredKey = this.structuredProfileKey(userId, version);
    const cached =
      await this.redis.getJson<CompanyProfileStructuredCache>(structuredKey);

    return {
      userId,
      version,
      namespace: process.env.REDIS_NAMESPACE ?? 'app',
      ttlSeconds: this.ttlSeconds,
      structuredProfileKey: this.redis.buildNamespacedKey(structuredKey),
      structuredProfileCached: Boolean(cached),
      structuredProfileHash: cached?.profileHash ?? null,
      structuredProfileCachedAt: cached?.cachedAt ?? null,
      note: 'Agent output keys include request hash + profileHash, so profile updates will not reuse stale agent output.',
    };
  }

  buildRequestHash(input: Record<string, any>) {
    const payload = {
      name: input.name ?? null,
      url: input.url ?? null,
      jobtitle: input.jobtitle ?? null,
      focus_on: input.focus_on ?? null,

      // Quan trọng: profileHash giúp cache tự đổi khi user update profile
      profileHash: input.profileHash ?? null,
    };

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex')
      .slice(0, 24);
  }

  buildProfileHash(profile: Record<string, any>) {
    return createHash('sha256')
      .update(this.stableStringify(profile ?? {}))
      .digest('hex')
      .slice(0, 24);
  }

  private stableStringify(value: any): string {
    if (value === null || value === undefined) {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value).sort();

      return `{${keys
        .map(
          (key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`,
        )
        .join(',')}}`;
    }

    return JSON.stringify(value);
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
