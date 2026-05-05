import { Injectable } from '@nestjs/common';

interface CachedCompanyProfile {
  key: string;
  data: Record<string, any>;
  cachedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class CompanyProfileMemoryCacheService {
  private readonly ttlMs = 1000 * 60 * 30; // 30 phút
  private readonly cache = new Map<string, CachedCompanyProfile>();

  getByInput(input: {
    name?: string;
    url?: string;
  }): Record<string, any> | null {
    const key = this.buildKey(input);
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    if (item.expiresAt.getTime() < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  setByInput(
    input: { name?: string; url?: string },
    data: Record<string, any>,
  ) {
    const key = this.buildKey(input);
    const now = new Date();

    this.cache.set(key, {
      key,
      data,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    });
  }

  list() {
    return Array.from(this.cache.values()).map((item) => ({
      key: item.key,
      data: item.data,
      cachedAt: item.cachedAt,
      expiresAt: item.expiresAt,
    }));
  }

  clear() {
    this.cache.clear();
  }

  private buildKey(input: { name?: string; url?: string }) {
    const url = input.url?.trim().toLowerCase();

    if (url) {
      return url
        .replace('https://', '')
        .replace('http://', '')
        .replace('www.', '')
        .replace(/\/$/, '');
    }

    return String(input.name ?? 'unknown-company')
      .trim()
      .toLowerCase();
  }
}
