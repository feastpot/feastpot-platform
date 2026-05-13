import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisCacheService } from './redis-cache.service';

/**
 * Global cache module — RedisCacheService is injectable from anywhere
 * without re-importing CacheModule per feature module.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
