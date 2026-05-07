import { Global, Module } from '@nestjs/common';

import { CompanyProfileRedisCacheService } from './company-profile-redis-cache.service';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  providers: [RedisCacheService, CompanyProfileRedisCacheService],
  exports: [RedisCacheService, CompanyProfileRedisCacheService],
})
export class RedisCacheModule {}
