import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TaxEntityType, VerificationStatus } from '@prisma/client';
import type Stripe from 'stripe';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

import type { UpsertTaxProfileDto } from './dto/upsert-tax-profile.dto';
import type { VerifyTaxProfileDto } from './dto/verify-tax-profile.dto';

// ─── Required fields by entity type ──────────────────────────────────────────

/** Check whether a tax profile has all the fields needed before a vendor can go live. */
export function isTaxProfileComplete(
  profile:
    | {
        entityType: TaxEntityType;
        legalName: string;
        addressLine1: string;
        city: string;
        postcode: string;
        dateOfBirth: Date | null;
        companyNumber: string | null;
        taxIdentifier: string | null;
        financialAccountId?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!profile) return false;
  if (!profile.legalName || !profile.addressLine1 || !profile.city || !profile.postcode) {
    return false;
  }
  if (profile.entityType === TaxEntityType.SOLE_TRADER && !profile.dateOfBirth) return false;
  if (profile.entityType === TaxEntityType.LIMITED_COMPANY && !profile.companyNumber) return false;
  if (!profile.taxIdentifier || !profile.financialAccountId) return false;
  return true;
}

// ─── Stripe → TaxProfile field mapping ───────────────────────────────────────

export function mapStripeAccount(account: Stripe.Account): Partial<{
  entityType: TaxEntityType;
  legalName: string;
  tradingName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  dateOfBirth: Date;
  companyNumber: string;
  financialAccountId: string;
  accountHolderName: string;
}> {
  const result: ReturnType<typeof mapStripeAccount> = {};

  // Entity type
  if (account.business_type === 'individual') {
    result.entityType = TaxEntityType.SOLE_TRADER;
  } else if (account.business_type === 'company') {
    result.entityType = TaxEntityType.LIMITED_COMPANY;
  }

  // Trading name from business profile
  if (account.business_profile?.name) {
    result.tradingName = account.business_profile.name;
  }

  // Company details
  const company = account.company;
  if (company) {
    if (company.name) result.legalName = company.name;
    // registration_number is not in the typed Stripe SDK for Company but is
    // present in the raw UK account response. Cast to access safely.
    const regNum = (company as unknown as { registration_number?: string }).registration_number;
    if (regNum) result.companyNumber = regNum;
    const addr = company.address;
    if (addr) {
      if (addr.line1) result.addressLine1 = addr.line1;
      if (addr.line2) result.addressLine2 = addr.line2 ?? '';
      if (addr.city) result.city = addr.city;
      if (addr.postal_code) result.postcode = addr.postal_code;
      if (addr.country) result.country = addr.country;
    }
  }

  // Individual details (sole trader)
  const individual = account.individual;
  if (individual) {
    const fullName = [individual.first_name, individual.last_name].filter(Boolean).join(' ');
    if (fullName) result.legalName = fullName;
    const dob = individual.dob;
    if (dob?.year && dob.month && dob.day) {
      result.dateOfBirth = new Date(Date.UTC(dob.year, dob.month - 1, dob.day));
    }
    const addr = individual.address;
    if (addr) {
      if (addr.line1) result.addressLine1 = addr.line1;
      if (addr.line2) result.addressLine2 = addr.line2 ?? '';
      if (addr.city) result.city = addr.city;
      if (addr.postal_code) result.postcode = addr.postal_code;
      if (addr.country) result.country = addr.country;
    }
  }

  // Stripe only exposes a bank account's safe display fields. Keep the
  // local reconciliation identifier masked: never persist account numbers.
  const externalAccounts = account.external_accounts;
  const banks = externalAccounts?.data?.filter((item) => item.object === 'bank_account') ?? [];
  const bank = banks.find((item) => item.default_for_currency) ?? banks[0];
  if (bank && bank.object === 'bank_account') {
    if (bank.last4) {
      result.financialAccountId = [
        bank.country ?? 'unknown',
        bank.routing_number ?? 'unknown',
        `****${bank.last4}`,
      ].join(':');
    }
    if (bank.account_holder_name) result.accountHolderName = bank.account_holder_name;
  }

  return result;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class VendorTaxProfileService {
  private readonly logger = new Logger(VendorTaxProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Vendor responses never expose UTRs or NI numbers. */
  private vendorView<T extends { taxIdentifier: string | null }>(profile: T | null) {
    if (!profile) return null;
    const taxIdentifier = profile.taxIdentifier?.trim() || null;
    return {
      ...profile,
      taxIdentifier: null,
      taxIdentifierProvided: Boolean(taxIdentifier),
      taxIdentifierMasked: taxIdentifier ? `****${taxIdentifier.slice(-4)}` : null,
    };
  }

  // ── Vendor-facing ─────────────────────────────────────────────────────────

  async getMyProfile(user: AuthUser) {
    const vendor = await this.resolveVendor(user.id);
    const profile = await this.prisma.vendorTaxProfile.findUnique({
      where: { vendorId: vendor.id },
    });
    return this.vendorView(profile);
  }

  async upsertMyProfile(user: AuthUser, dto: UpsertTaxProfileDto) {
    const vendor = await this.resolveVendor(user.id);
    const existing = await this.prisma.vendorTaxProfile.findUnique({
      where: { vendorId: vendor.id },
      select: { taxIdentifier: true },
    });
    const suppliedTaxIdentifier = dto.taxIdentifier?.trim();
    const taxIdentifier = suppliedTaxIdentifier || existing?.taxIdentifier || null;
    const profile = await this.prisma.vendorTaxProfile.upsert({
      where: { vendorId: vendor.id },
      create: {
        vendorId: vendor.id,
        entityType: dto.entityType,
        legalName: dto.legalName,
        tradingName: dto.tradingName,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country ?? 'GB',
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        companyNumber: dto.companyNumber,
        taxIdentifier,
        taxIdCountry: dto.taxIdCountry ?? 'GB',
        vatNumber: dto.vatNumber,
        // Reset verification when the vendor self-edits
        verificationStatus: VerificationStatus.PENDING,
      },
      update: {
        entityType: dto.entityType,
        legalName: dto.legalName,
        tradingName: dto.tradingName,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country ?? 'GB',
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        companyNumber: dto.companyNumber,
        taxIdentifier: suppliedTaxIdentifier || undefined,
        taxIdCountry: dto.taxIdCountry ?? 'GB',
        vatNumber: dto.vatNumber,
        // Reset to PENDING when vendor self-edits so compliance re-reviews
        verificationStatus: VerificationStatus.PENDING,
        verifiedAt: null,
        verifiedById: null,
        verificationMethod: null,
        lastReviewedAt: new Date(),
      },
    });
    this.logger.log(`Tax profile upserted for vendor ${vendor.id}`);
    return this.vendorView(profile);
  }

  /**
   * Pre-fill from the vendor's Stripe Express account so they don't retype
   * address/name that Stripe KYC already collected. Only overwrites fields
   * that are still null on the existing profile (never silently overwrites
   * manually entered data).
   */
  async prefillFromStripe(user: AuthUser) {
    const vendor = await this.resolveVendor(user.id);
    if (!vendor.stripeAccountId) {
      throw new BadRequestException({
        code: 'NO_STRIPE_ACCOUNT',
        message: 'Complete Stripe onboarding first before importing your details',
      });
    }

    let stripeAccount: Stripe.Account;
    try {
      stripeAccount = await this.stripe.retrieveAccount(vendor.stripeAccountId, true);
    } catch {
      throw new BadRequestException({
        code: 'STRIPE_FETCH_FAILED',
        message: 'Could not retrieve your Stripe account details - try again in a moment',
      });
    }

    const mapped = mapStripeAccount(stripeAccount);
    const existing = await this.prisma.vendorTaxProfile.findUnique({
      where: { vendorId: vendor.id },
    });

    // Only fill gaps - never overwrite what the vendor has already confirmed.
    // This prevents a Stripe name change from silently corrupting the
    // self-reported tax record that compliance have already reviewed.
    const fillIfBlank = <K extends keyof typeof mapped>(
      key: K,
      current: typeof existing,
    ): (typeof mapped)[K] | undefined => {
      if (!current || !current[key as keyof typeof current]) return mapped[key];
      return undefined;
    };

    if (!existing) {
      const profile = await this.prisma.vendorTaxProfile.create({
        data: {
          vendorId: vendor.id,
          entityType: mapped.entityType ?? TaxEntityType.SOLE_TRADER,
          legalName: mapped.legalName ?? vendor.businessName,
          tradingName: mapped.tradingName,
          addressLine1: mapped.addressLine1 ?? '',
          addressLine2: mapped.addressLine2,
          city: mapped.city ?? '',
          postcode: mapped.postcode ?? '',
          country: mapped.country ?? 'GB',
          dateOfBirth: mapped.dateOfBirth,
          companyNumber: mapped.companyNumber,
          financialAccountId: mapped.financialAccountId,
          accountHolderName: mapped.accountHolderName,
          verificationStatus: VerificationStatus.PENDING,
        },
      });
      this.logger.log(`Tax profile pre-filled from Stripe for vendor ${vendor.id}`);
      return this.vendorView(profile);
    }

    const updateData = {
      entityType: fillIfBlank('entityType', existing),
      legalName: fillIfBlank('legalName', existing),
      tradingName: fillIfBlank('tradingName', existing),
      addressLine1: fillIfBlank('addressLine1', existing),
      addressLine2: fillIfBlank('addressLine2', existing),
      city: fillIfBlank('city', existing),
      postcode: fillIfBlank('postcode', existing),
      dateOfBirth: fillIfBlank('dateOfBirth', existing),
      companyNumber: fillIfBlank('companyNumber', existing),
      financialAccountId: fillIfBlank('financialAccountId', existing),
      accountHolderName: fillIfBlank('accountHolderName', existing),
    };
    const hasChanges = Object.values(updateData).some((value) => value !== undefined);
    if (!hasChanges) return this.vendorView(existing);

    const profile = await this.prisma.vendorTaxProfile.update({
      where: { vendorId: vendor.id },
      data: updateData,
    });

    this.logger.log(`Tax profile pre-filled from Stripe for vendor ${vendor.id}`);
    return this.vendorView(profile);
  }

  // ── Admin-facing ──────────────────────────────────────────────────────────

  async adminGetProfile(vendorId: string) {
    const profile = await this.prisma.vendorTaxProfile.findUnique({
      where: { vendorId },
    });
    return profile;
  }

  async adminVerify(vendorId: string, dto: VerifyTaxProfileDto, admin: AuthUser) {
    const profile = await this.prisma.vendorTaxProfile.findUnique({ where: { vendorId } });
    if (!profile) {
      throw new NotFoundException({
        code: 'TAX_PROFILE_NOT_FOUND',
        message: 'No tax profile found for this vendor',
      });
    }

    const updated = await this.prisma.vendorTaxProfile.update({
      where: { vendorId },
      data: {
        verificationStatus: dto.status,
        verificationMethod: dto.verificationMethod,
        verifiedAt: dto.status === VerificationStatus.VERIFIED ? new Date() : null,
        verifiedById: dto.status === VerificationStatus.VERIFIED ? admin.id : null,
        lastReviewedAt: new Date(),
      },
    });

    // If verification fails, notify the vendor so they can correct and resubmit
    if (dto.status === VerificationStatus.FAILED) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { userId: true, businessName: true },
      });
      if (vendor) {
        await this.notifications.enqueue(NotificationEvent.hmrc_verification_failed, {
          userId: vendor.userId,
          businessName: vendor.businessName,
          note: dto.note ?? '',
        });
      }
    }

    this.logger.log(
      `Tax profile verification updated for vendor ${vendorId}: ${dto.status} by admin ${admin.id}`,
    );
    return updated;
  }

  /**
   * Get all vendors with incomplete or unverified tax profiles.
   * Used by the admin compliance view.
   */
  async listIncomplete() {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        OR: [
          { taxProfile: null },
          { taxProfile: { verificationStatus: { not: VerificationStatus.VERIFIED } } },
        ],
        status: { in: ['pending', 'approved', 'live'] },
      },
      select: {
        id: true,
        businessName: true,
        status: true,
        taxProfile: {
          select: {
            verificationStatus: true,
            legalName: true,
            entityType: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return vendors;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async resolveVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true, businessName: true, stripeAccountId: true },
    });
    if (!vendor) {
      throw new ForbiddenException({
        code: 'VENDOR_NOT_FOUND',
        message: 'No vendor account found',
      });
    }
    return vendor;
  }
}
