import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { CreateDiscountCodeDto } from './dto/create-discount-code.dto';

export interface ValidatedDiscount {
  discountCodeId: string;
  discountPence: number;
  message: string;
}

/**
 * FR-DISC-001 - discount code lifecycle.
 *
 * The service deliberately splits validation (called both from the
 * customer-facing /validate endpoint AND from OrdersService.createOrder so
 * the price the customer sees on screen is the same one the order is
 * created at) from `applyToOrder` (the atomic redemption-counter bump,
 * which only runs once Stripe has confirmed payment in confirmOrder).
 *
 * Splitting these two avoids a class of bug where a customer who never
 * completes payment still consumes one of the code's `maxUses`.
 */
@Injectable()
export class DiscountCodesService {
  private readonly logger = new Logger(DiscountCodesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns `{ discountCodeId, discountPence, message }` if the code is
   * usable for this basket, or throws BadRequest with a customer-friendly
   * message that the checkout UI surfaces verbatim.
   *
   * Lookup is case-insensitive - store as the user typed but accept any
   * casing. Discounts can never reduce the order below £0.
   */
  async validate(code: string, vendorId: string, subtotalPence: number): Promise<ValidatedDiscount> {
    const normalised = code.trim().toUpperCase();
    if (!normalised) {
      throw new BadRequestException({ code: 'DISCOUNT_INVALID', message: 'Invalid discount code' });
    }

    // Codes are stored uppercase (see adminCreate) + the DB has a functional
    // unique index on LOWER(code), so a single exact-match lookup is both
    // case-insensitive and deterministic.
    const dc = await this.prisma.discountCode.findUnique({ where: { code: normalised } });

    if (!dc) {
      throw new BadRequestException({ code: 'DISCOUNT_INVALID', message: 'Invalid discount code' });
    }
    if (!dc.isActive) {
      throw new BadRequestException({ code: 'DISCOUNT_INACTIVE', message: 'This code is no longer active' });
    }
    if (dc.expiresAt && dc.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'DISCOUNT_EXPIRED', message: 'This discount code has expired' });
    }
    if (dc.maxUses !== null && dc.usedCount >= dc.maxUses) {
      throw new BadRequestException({
        code: 'DISCOUNT_EXHAUSTED',
        message: 'This code has reached its usage limit',
      });
    }
    if (subtotalPence < dc.minOrderPence) {
      const min = (dc.minOrderPence / 100).toFixed(0);
      throw new BadRequestException({
        code: 'DISCOUNT_BELOW_MIN',
        message: `Minimum order of £${min} required`,
      });
    }
    if (dc.vendorId && dc.vendorId !== vendorId) {
      throw new BadRequestException({
        code: 'DISCOUNT_WRONG_VENDOR',
        message: 'This code is not valid for this vendor',
      });
    }

    const rawDiscount =
      dc.type === DiscountType.flat
        ? dc.value
        : Math.round((subtotalPence * dc.value) / 10_000);

    // Cap so the discount can never exceed the subtotal - shipping/service
    // are excluded from the cap because basket pricing already separates
    // them. The caller (orders.service) re-clamps against the full total
    // for safety.
    const discountPence = Math.max(0, Math.min(rawDiscount, subtotalPence));

    return {
      discountCodeId: dc.id,
      discountPence,
      message: `£${(discountPence / 100).toFixed(2)} discount applied`,
    };
  }

  /**
   * Atomic, cap-respecting increment of `used_count`. Runs only after
   * payment confirmation so an abandoned checkout doesn't burn a slot.
   *
   * The single UPDATE with the `(max_uses IS NULL OR used_count < max_uses)`
   * predicate guarantees we never exceed the cap even under concurrent
   * confirms - Prisma's `update` would do a read-then-write, opening a
   * race window. Returns true iff a row was actually incremented; the
   * caller logs but does NOT fail the order if we were already at cap
   * (the customer already paid the discounted price).
   */
  async applyToOrder(discountCodeId: string): Promise<boolean> {
    const rows = await this.prisma.$executeRaw`
      UPDATE "discount_codes"
         SET "used_count" = "used_count" + 1
       WHERE "id" = ${discountCodeId}::uuid
         AND ("max_uses" IS NULL OR "used_count" < "max_uses")
    `;
    return rows > 0;
  }

  // ----- admin -----

  async adminCreate(dto: CreateDiscountCodeDto, adminUserId: string) {
    const data: Prisma.DiscountCodeUncheckedCreateInput = {
      code: dto.code.trim().toUpperCase(),
      type: dto.type,
      value: dto.value,
      minOrderPence: dto.minOrderPence ?? 0,
      maxUses: dto.maxUses ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      vendorId: dto.vendorId ?? null,
      isActive: dto.isActive ?? true,
      createdByUserId: adminUserId,
    };
    try {
      return await this.prisma.discountCode.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException({
          code: 'DISCOUNT_CODE_EXISTS',
          message: 'A discount code with that name already exists',
        });
      }
      throw e;
    }
  }

  async adminList(page = 1, limit = 20) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const [data, total] = await Promise.all([
      this.prisma.discountCode.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: {
          vendor: { select: { id: true, businessName: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.discountCode.count(),
    ]);
    return { data, total, page: safePage, limit: safeLimit };
  }

  async adminToggle(id: string, isActive: boolean) {
    return this.prisma.discountCode.update({
      where: { id },
      data: { isActive },
    });
  }
}
