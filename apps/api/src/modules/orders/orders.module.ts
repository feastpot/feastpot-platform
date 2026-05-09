import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';

import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrderSlotsService } from './order-slots.service';
import { NOTIFICATIONS_QUEUE, OrdersService } from './orders.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    StripeModule,
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderSlotsService],
  exports: [OrdersService],
})
export class OrdersModule {}
