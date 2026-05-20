import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';
import { PaymentsModule } from '../payments/payments.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { OrderSlotsService } from './order-slots.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  // forwardRef on Payments because future webhook flows may inject OrdersService.
  imports: [PrismaModule, AuthModule, StripeModule, VendorMembersModule, forwardRef(() => PaymentsModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrderSlotsService],
  exports: [OrdersService],
})
export class OrdersModule {}
