import {
  DocumentStatus,
  DocumentType,
  ModerationStatus,
  TaxEntityType,
  VendorComplianceStatus,
  VendorOnboardingStepName,
  VendorOnboardingStepState,
  VerificationStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { TermsService } from '../terms/terms.service';

import { ONBOARDING_STEP_DEFINITIONS, VendorOnboardingService } from './vendor-onboarding.service';

const future = new Date('2099-01-01T00:00:00Z');

function readyVendor() {
  return {
    id: 'vendor-1',
    description: 'A complete profile',
    coverImageUrl: 'https://example.test/cover.jpg',
    vendorStory: 'Our story',
    complianceStatus: VendorComplianceStatus.RATED,
    fsaHygieneRating: 5,
    stripeAccountId: 'acct_ready',
    payoutsEnabled: true,
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeRequirementsCurrentlyDue: [],
    stripeRequirementsPastDue: [],
    verification: {
      registrationNumber: 'FBO-123',
      registrationAuthority: 'Test Council',
      registrationConfirmedAt: new Date('2026-01-01T00:00:00Z'),
      insuranceProvider: 'Test Insurer',
      insuranceCoverPence: 500_000_000,
      insuranceValidUntil: future,
      idVerifiedAt: new Date('2026-01-01T00:00:00Z'),
    },
    taxProfile: {
      entityType: TaxEntityType.SOLE_TRADER,
      legalName: 'Vendor Owner',
      addressLine1: '1 Test Street',
      city: 'London',
      postcode: 'SE1 1AA',
      dateOfBirth: new Date('1990-01-01T00:00:00Z'),
      companyNumber: null,
      taxIdentifier: null,
      verificationStatus: VerificationStatus.PENDING,
    },
    documents: [
      { type: DocumentType.hygiene_cert, status: DocumentStatus.verified },
      { type: DocumentType.insurance, status: DocumentStatus.verified },
      { type: DocumentType.photo_id, status: DocumentStatus.verified },
    ],
    menuItems: [
      {
        isAvailable: true,
        moderationStatus: ModerationStatus.approved,
        allergens: ['milk'],
        allergensFreeFrom: false,
        imageUrls: ['https://example.test/dish.jpg'],
      },
    ],
  };
}

describe('VendorOnboardingService go-live gates', () => {
  let vendor: ReturnType<typeof readyVendor>;
  let termsAccepted: boolean;
  let service: VendorOnboardingService;

  beforeEach(() => {
    vendor = readyVendor();
    termsAccepted = true;
    const prisma = {
      vendor: { findUnique: jest.fn(async () => vendor) },
      vendorOnboardingStep: { upsert: jest.fn(async ({ create }) => create) },
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    } as unknown as PrismaService;
    const terms = {
      hasAcceptedCurrentVersion: jest.fn(async () => termsAccepted),
    } as unknown as TermsService;
    service = new VendorOnboardingService(prisma, terms);
  });

  async function expectBlocked(name: VendorOnboardingStepName) {
    const readiness = await service.getReadiness(vendor.id);
    expect(readiness.canProfileGoLive).toBe(false);
    expect(readiness.blockingPublication.map((step) => step.name)).toContain(name);
  }

  it('derives canProfileGoLive and never includes it as a persisted step field', async () => {
    const readiness = await service.getReadiness(vendor.id);
    expect(readiness.canProfileGoLive).toBe(true);
    expect(readiness.steps).toHaveLength(ONBOARDING_STEP_DEFINITIONS.length);
    expect(readiness.steps.every((step) => step.state === VendorOnboardingStepState.verified)).toBe(
      false,
    );
  });

  it('blocks publication without food business registration', async () => {
    vendor.verification.registrationNumber = '';
    await expectBlocked(VendorOnboardingStepName.food_business_registration);
  });

  it('blocks publication without current GBP 5m public liability insurance', async () => {
    vendor.verification.insuranceCoverPence = 100_000_000;
    await expectBlocked(VendorOnboardingStepName.public_liability_insurance);
  });

  it('blocks publication without a verified food safety certificate', async () => {
    vendor.documents = vendor.documents.filter((d) => d.type !== DocumentType.hygiene_cert);
    await expectBlocked(VendorOnboardingStepName.food_safety_certificate);
  });

  it('blocks publication without photo ID verification', async () => {
    vendor.verification.idVerifiedAt = null as unknown as Date;
    vendor.documents = vendor.documents.filter((d) => d.type !== DocumentType.photo_id);
    await expectBlocked(VendorOnboardingStepName.photo_id_verification);
  });

  it('blocks publication until Stripe charges and payouts are enabled', async () => {
    vendor.stripePayoutsEnabled = false;
    vendor.payoutsEnabled = false;
    await expectBlocked(VendorOnboardingStepName.stripe_connect);
  });

  it('blocks publication and progress until current Vendor Terms are accepted', async () => {
    termsAccepted = false;
    const readiness = await service.getReadiness(vendor.id);
    expect(readiness.canProgress).toBe(false);
    expect(readiness.blockingPublication.map((step) => step.name)).toContain(
      VendorOnboardingStepName.vendor_terms,
    );
  });

  it('blocks publication without a complete HMRC tax profile', async () => {
    vendor.taxProfile.legalName = '';
    await expectBlocked(VendorOnboardingStepName.tax_profile);
  });

  it('blocks publication without an approved available allergen-declared item', async () => {
    vendor.menuItems[0]!.allergens = [];
    await expectBlocked(VendorOnboardingStepName.allergen_declared_menu_item);
  });

  it('allows a registered vendor awaiting their first FHRS inspection', async () => {
    vendor.complianceStatus = VendorComplianceStatus.REGISTERED_AWAITING_INSPECTION;
    vendor.fsaHygieneRating = null as unknown as number;
    await expect(service.getReadiness(vendor.id)).resolves.toMatchObject({
      canProfileGoLive: true,
    });
  });

  it('blocks a vendor whose existing FHRS rating is below 3', async () => {
    vendor.fsaHygieneRating = 2;
    await expectBlocked(VendorOnboardingStepName.fhrs_eligibility);
  });

  it('gives every hard gate a traceable source citation', () => {
    const hardGates = ONBOARDING_STEP_DEFINITIONS.filter((step) => step.blocksPublication);
    expect(hardGates).toHaveLength(9);
    for (const gate of hardGates) {
      expect(gate.sourceCitation.length).toBeGreaterThan(20);
      expect(gate.sourceCitation).not.toContain('Optional');
    }
  });
});
