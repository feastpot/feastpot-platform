import { Module } from '@nestjs/common';

import { ResendWebhookModule } from './resend/resend-webhook.module';

@Module({
  imports: [ResendWebhookModule],
})
export class WebhooksModule {}
