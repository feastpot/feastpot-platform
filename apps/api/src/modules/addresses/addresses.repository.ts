import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Thin Prisma façade for the `addresses` table. Keeping queries here means
 * the service stays focused on business rules (single-default invariant,
 * delete-when-unused, etc) and unit tests can stub the repo cleanly.
 */
@Injectable()
export class AddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyForUser(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      // Default address always sits at the top so the UI's first-radio
      // selection lands on the right row without extra client work.
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  findOneOwned(id: string, userId: string) {
    return this.prisma.address.findFirst({ where: { id, userId } });
  }

  create(data: Prisma.AddressUncheckedCreateInput) {
    return this.prisma.address.create({ data });
  }

  update(id: string, data: Prisma.AddressUncheckedUpdateInput) {
    return this.prisma.address.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.address.delete({ where: { id } });
  }

  /**
   * Used inside a transaction to enforce the single-default invariant: any
   * other addresses for the same user are flipped to `isDefault=false`
   * before the new/updated one is saved as default.
   */
  clearDefaultsForUser(userId: string, excludeId?: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.address.updateMany({
      where: { userId, isDefault: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      data: { isDefault: false },
    });
  }

  /** Count active orders that point at this address. Used to gate deletes. */
  countActiveOrdersUsingAddress(addressId: string) {
    return this.prisma.order.count({
      where: {
        addressId,
        status: { in: ['pending', 'accepted', 'preparing', 'dispatched'] },
      },
    });
  }

  /** Expose the Prisma client so the service can wrap multi-step writes in a transaction. */
  get tx() {
    return this.prisma;
  }
}
