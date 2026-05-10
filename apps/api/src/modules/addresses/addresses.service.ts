import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AddressesRepository } from './addresses.repository';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';

interface PostcodesIoResult {
  status: number;
  result?: { latitude?: number; longitude?: number } | null;
}

/**
 * Saved customer delivery addresses.
 *
 * Business rules enforced here:
 * - A user can have at most one default address — set/update operations
 *   atomically clear the previous default in the same transaction.
 * - Addresses in use by an "active" order (pending/accepted/preparing/
 *   dispatched) cannot be deleted; we surface a 409 with a code the UI can
 *   match on.
 * - Postcodes are best-effort geocoded via postcodes.io. The address is
 *   still saved if the geocode fails (stored without lat/lng) so a flaky
 *   third party never blocks a customer from checking out.
 */
@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(private readonly repo: AddressesRepository) {}

  findAll(userId: string) {
    return this.repo.findManyForUser(userId);
  }

  async create(userId: string, dto: CreateAddressDto) {
    const { latitude, longitude } = await this.geocodePostcode(dto.postcode);

    return this.repo.tx.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.repo.clearDefaultsForUser(userId, undefined, tx);
      }
      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? null,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          city: dto.city,
          postcode: dto.postcode,
          isDefault: dto.isDefault ?? false,
          latitude,
          longitude,
        },
      });
    });
  }

  async update(id: string, userId: string, dto: UpdateAddressDto) {
    const existing = await this.repo.findOneOwned(id, userId);
    if (!existing) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' });
    }

    // Re-geocode only if the postcode actually changed; cheap optimisation
    // that also avoids spamming postcodes.io with no-op lookups.
    let latitude = existing.latitude;
    let longitude = existing.longitude;
    if (dto.postcode && dto.postcode !== existing.postcode) {
      const geocoded = await this.geocodePostcode(dto.postcode);
      latitude = geocoded.latitude;
      longitude = geocoded.longitude;
    }

    return this.repo.tx.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.repo.clearDefaultsForUser(userId, id, tx);
      }
      return tx.address.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label || null } : {}),
          ...(dto.line1 !== undefined ? { line1: dto.line1 } : {}),
          ...(dto.line2 !== undefined ? { line2: dto.line2 || null } : {}),
          ...(dto.city !== undefined ? { city: dto.city } : {}),
          ...(dto.postcode !== undefined ? { postcode: dto.postcode } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          latitude,
          longitude,
        },
      });
    });
  }

  async delete(id: string, userId: string) {
    const existing = await this.repo.findOneOwned(id, userId);
    if (!existing) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' });
    }

    const activeCount = await this.repo.countActiveOrdersUsingAddress(id);
    if (activeCount > 0) {
      throw new ConflictException({
        code: 'ADDRESS_IN_USE',
        message: 'This address is used by an active order and cannot be deleted',
      });
    }

    await this.repo.delete(id);
    return { deleted: true };
  }

  /**
   * Convenience helper. Wired through `update` so the same single-default
   * invariant + ownership check apply.
   */
  setDefault(id: string, userId: string) {
    return this.update(id, userId, { isDefault: true });
  }

  /**
   * Best-effort UK geocoding via postcodes.io (free, no auth, ~50ms). On
   * any failure we log and return nulls so the caller can still persist
   * the address — the user's experience trumps a perfect lat/lng.
   */
  private async geocodePostcode(postcode: string): Promise<{ latitude: number | null; longitude: number | null }> {
    try {
      const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2_500) });
      if (!res.ok) {
        return { latitude: null, longitude: null };
      }
      const json = (await res.json()) as PostcodesIoResult;
      const lat = json.result?.latitude ?? null;
      const lng = json.result?.longitude ?? null;
      return { latitude: typeof lat === 'number' ? lat : null, longitude: typeof lng === 'number' ? lng : null };
    } catch (err) {
      this.logger.warn(`postcodes.io geocode failed for ${postcode}: ${(err as Error).message}`);
      return { latitude: null, longitude: null };
    }
  }
}
