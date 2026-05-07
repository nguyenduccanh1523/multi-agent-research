import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);

  private client!: RedisClient;

  private readonly namespace = process.env.REDIS_NAMESPACE ?? 'app';

  async onModuleInit() {
    const host = process.env.REDIS_HOST ?? 'localhost';
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const db = Number(process.env.REDIS_DB ?? 0);

    const url = `redis://${host}:${port}/${db}`;

    this.client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 100, 3000);
          return delay;
        },
      },
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`, error.stack);
    });

    this.client.on('connect', () => {
      this.logger.log(`Redis connecting: ${host}:${port}/${db}`);
    });

    this.client.on('ready', () => {
      this.logger.log(`Redis ready namespace=${this.namespace}`);
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async getString(key: string): Promise<string | null> {
    return this.client.get(this.toKey(key));
  }

  async setString(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(this.toKey(key), value, {
        EX: ttlSeconds,
      });
      return;
    }

    await this.client.set(this.toKey(key), value);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.getString(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.del(key);
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.setString(key, JSON.stringify(value), ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.toKey(key));
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.toKey(key));
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    const result = await this.client.incr(this.toKey(key));
    return Number(result);
  }

  async incrWithExpire(key: string, expireSeconds: number): Promise<number> {
    const defaultLua =
      "local v = redis.call('incr', KEYS[1]); if tonumber(v) == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return v";

    const lua = process.env.INCR_WITH_EXPIRE_LUA || defaultLua;

    const result = await this.client.eval(lua, {
      keys: [this.toKey(key)],
      arguments: [String(expireSeconds)],
    });

    return Number(result);
  }

  async getNumber(key: string): Promise<number | null> {
    const value = await this.getString(key);

    if (value === null) {
      return null;
    }

    const n = Number(value);

    if (!Number.isFinite(n)) {
      return null;
    }

    return n;
  }

  getRawClient() {
    return this.client;
  }

  buildNamespacedKey(key: string) {
    return this.toKey(key);
  }

  private toKey(key: string) {
    return `${this.namespace}:${key}`;
  }
}
