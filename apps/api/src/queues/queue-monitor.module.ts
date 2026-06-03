import { Module } from '@nestjs/common';

import { QueueDepthMonitorService } from './queue-depth-monitor.service';

/**
 * Hosts the proactive queue-depth alarm. Kept separate from QueuesModule to
 * avoid a circular import: the monitor imports the queue-name constants from
 * queues.module, so queues.module must not import the monitor back. The Bull
 * queue providers (registered+exported by the @Global QueuesModule) and
 * RedisCacheService (also @Global) are injectable here without extra imports.
 */
@Module({
  providers: [QueueDepthMonitorService],
})
export class QueueMonitorModule {}
