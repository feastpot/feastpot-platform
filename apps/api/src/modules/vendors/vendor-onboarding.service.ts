import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  ModerationStatus,
  VendorComplianceStatus,
  VendorOnboardingStepName,
  VendorOnboardingStepState,
  VerificationStatus,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { TermsService } from '../terms/terms.service';
import { isTaxProfileComplete } from '../vendor-tax-profile/vendor-tax-profile.service';

const MIN_INSURANCE_COVER_PENCE = 500_000_000;

type StepDefinition = {
  name: VendorOnboardingStepName;
  label: string;
  blocksProgress: boolean;
  blocksPublication: boolean;
  sourceCitation: string;
};

/**
 * Each hard gate cites the source it enforces. Keep these citations visible in
 * the Admin vendor readiness panel; changing a gate requires reviewing both
 * the source and its tests.
 */
export const ONBOARDING_STEP_DEFINITIONS: readonly StepDefinition[] = [
  {
    name: VendorOnboardingStepName.food_business_registration,
    label: 'Food business registration',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation:
      'Food Premises (Registration) Regulations 1991, regulation 2; Vendor Terms clause 2 and Annex B.',
  },
  {
    name: VendorOnboardingStepName.public_liability_insurance,
    label: 'Public liability insurance (minimum GBP 5m)',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation: 'Vendor Terms clause 2 and Annex B (current minimum GBP 5 million).',
  },
  {
    name: VendorOnboardingStepName.food_safety_certificate,
    label: 'Level 2 food safety certificate or equivalent',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation: 'Vendor Terms clause 6 and Annex B.',
  },
  {
    name: VendorOnboardingStepName.photo_id_verification,
    label: 'Photo ID verification',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation: 'Vendor Terms clause 2 and Annex B.',
  },
  {
    name: VendorOnboardingStepName.stripe_connect,
    label: 'Stripe Connect onboarding and payouts',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation: 'Vendor Terms clauses 2 and 3.',
  },
  {
    name: VendorOnboardingStepName.vendor_terms,
    label: 'Current Vendor Terms accepted',
    blocksProgress: true,
    blocksPublication: true,
    sourceCitation: 'Vendor Terms clause 1; electronic click-wrap acceptance record.',
  },
  {
    name: VendorOnboardingStepName.tax_profile,
    label: 'HMRC tax profile complete',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation:
      'Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 (SI 2023/817); Vendor Terms clause 16.',
  },
  {
    name: VendorOnboardingStepName.allergen_declared_menu_item,
    label: 'At least one publishable item with a complete allergen declaration',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation: 'Food Information Regulations 2014; Vendor Terms clauses 6 and 7.',
  },
  {
    name: VendorOnboardingStepName.fhrs_eligibility,
    label: 'FHRS eligibility',
    blocksProgress: false,
    blocksPublication: true,
    sourceCitation:
      'Vendor Terms clauses 2 and 10. Awaiting first inspection is permitted; an existing rating below 3 is not.',
  },
  {
    name: VendorOnboardingStepName.menu_photography,
    label: 'Menu photography',
    blocksProgress: false,
    blocksPublication: false,
    sourceCitation: 'Optional profile-quality step; no legal or contractual publication gate.',
  },
  {
    name: VendorOnboardingStepName.optional_profile_content,
    label: 'Optional profile content',
    blocksProgress: false,
    blocksPublication: false,
    sourceCitation: 'Optional profile-quality step; no legal or contractual publication gate.',
  },
  {
    name: VendorOnboardingStepName.vendor_pro_subscription,
    label: 'Vendor Pro subscription',
    blocksProgress: false,
    blocksPublication: false,
    sourceCitation: 'Optional commercial product; no publication gate.',
  },
] as const;

export type OnboardingReadinessStep = StepDefinition & {
  state: VendorOnboardingStepState;
  complete: boolean;
};

export type VendorOnboardingReadiness = {
  vendorId: string;
  canProgress: boolean;
  canProfileGoLive: boolean;
  blockingProgress: OnboardingReadinessStep[];
  blockingPublication: OnboardingReadinessStep[];
  steps: OnboardingReadinessStep[];
};

function documentState(
  document:
    | {
        status: DocumentStatus;
      }
    | undefined,
  verified: boolean,
): VendorOnboardingStepState {
  if (verified) return VendorOnboardingStepState.verified;
  if (!document) return VendorOnboardingStepState.not_started;
  if (document.status === DocumentStatus.rejected) return VendorOnboardingStepState.rejected;
  if (document.status === DocumentStatus.pending) return VendorOnboardingStepState.submitted;
  return VendorOnboardingStepState.in_progress;
}

@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terms: TermsService,
  ) {}

  async getReadiness(vendorId: string): Promise<VendorOnboardingReadiness> {
    const now = new Date();
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        description: true,
        coverImageUrl: true,
        vendorStory: true,
        complianceStatus: true,
        fsaHygieneRating: true,
        stripeAccountId: true,
        payoutsEnabled: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeRequirementsCurrentlyDue: true,
        stripeRequirementsPastDue: true,
        verification: {
          select: {
            registrationNumber: true,
            registrationAuthority: true,
            registrationConfirmedAt: true,
            insuranceProvider: true,
            insuranceCoverPence: true,
            insuranceValidUntil: true,
            idVerifiedAt: true,
          },
        },
        taxProfile: {
          select: {
            entityType: true,
            legalName: true,
            addressLine1: true,
            city: true,
            postcode: true,
            dateOfBirth: true,
            companyNumber: true,
            taxIdentifier: true,
            financialAccountId: true,
            accountHolderName: true,
            verificationStatus: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          select: { type: true, status: true },
        },
        menuItems: {
          select: {
            isAvailable: true,
            moderationStatus: true,
            allergens: true,
            allergensFreeFrom: true,
            imageUrls: true,
          },
        },
      },
    });
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }

    const latestDocument = new Map<DocumentType, { status: DocumentStatus }>();
    for (const document of vendor.documents) {
      if (!latestDocument.has(document.type)) latestDocument.set(document.type, document);
    }

    const registrationComplete = Boolean(
      vendor.verification?.registrationNumber.trim() &&
      vendor.verification.registrationAuthority.trim() &&
      vendor.verification.registrationConfirmedAt,
    );
    const registrationState = registrationComplete
      ? VendorOnboardingStepState.verified
      : vendor.verification
        ? VendorOnboardingStepState.in_progress
        : VendorOnboardingStepState.not_started;

    const insuranceValid = Boolean(
      vendor.verification?.insuranceProvider?.trim() &&
      (vendor.verification.insuranceCoverPence ?? 0) >= MIN_INSURANCE_COVER_PENCE &&
      vendor.verification.insuranceValidUntil &&
      vendor.verification.insuranceValidUntil > now,
    );
    const insuranceState = documentState(
      latestDocument.get(DocumentType.insurance),
      insuranceValid,
    );

    const hygieneDocument = latestDocument.get(DocumentType.hygiene_cert);
    const hygieneState = documentState(
      hygieneDocument,
      hygieneDocument?.status === DocumentStatus.verified,
    );

    const photoIdDocument = latestDocument.get(DocumentType.photo_id);
    const photoIdComplete =
      Boolean(vendor.verification?.idVerifiedAt) ||
      photoIdDocument?.status === DocumentStatus.verified;
    const photoIdState = documentState(photoIdDocument, photoIdComplete);

    const stripeStarted = Boolean(vendor.stripeAccountId);
    const stripeComplete = Boolean(
      vendor.stripeAccountId &&
      vendor.payoutsEnabled &&
      vendor.stripeChargesEnabled &&
      vendor.stripePayoutsEnabled &&
      vendor.stripeRequirementsCurrentlyDue.length === 0 &&
      vendor.stripeRequirementsPastDue.length === 0,
    );
    const stripeState = stripeComplete
      ? VendorOnboardingStepState.verified
      : stripeStarted
        ? VendorOnboardingStepState.in_progress
        : VendorOnboardingStepState.not_started;

    const termsComplete = await this.terms.hasAcceptedCurrentVersion(vendorId);
    const termsState = termsComplete
      ? VendorOnboardingStepState.verified
      : VendorOnboardingStepState.not_started;

    const taxComplete = isTaxProfileComplete(vendor.taxProfile);
    const taxState = taxComplete
      ? VendorOnboardingStepState.verified
      : vendor.taxProfile?.verificationStatus === VerificationStatus.FAILED
        ? VendorOnboardingStepState.rejected
        : vendor.taxProfile
          ? VendorOnboardingStepState.in_progress
          : VendorOnboardingStepState.not_started;

    const qualifyingMenuItem = vendor.menuItems.some(
      (item) =>
        item.isAvailable &&
        (item.moderationStatus === ModerationStatus.approved ||
          item.moderationStatus === ModerationStatus.auto_approved) &&
        (item.allergens.length > 0 || item.allergensFreeFrom),
    );
    const menuState = qualifyingMenuItem
      ? VendorOnboardingStepState.verified
      : vendor.menuItems.length > 0
        ? VendorOnboardingStepState.in_progress
        : VendorOnboardingStepState.not_started;

    // A registered vendor awaiting their first inspection may publish. Once a
    // rating exists, Vendor Terms clauses 2 and 10 require a rating of 3+.
    const fhrsComplete =
      vendor.complianceStatus === VendorComplianceStatus.REGISTERED_AWAITING_INSPECTION ||
      (vendor.complianceStatus === VendorComplianceStatus.RATED &&
        (vendor.fsaHygieneRating ?? 0) >= 3);
    const fhrsState = fhrsComplete
      ? VendorOnboardingStepState.verified
      : vendor.complianceStatus === VendorComplianceStatus.RATED
        ? VendorOnboardingStepState.rejected
        : VendorOnboardingStepState.not_started;

    const hasMenuPhotography = vendor.menuItems.some((item) => item.imageUrls.length > 0);
    const hasAnyOptionalProfile = Boolean(
      vendor.description || vendor.coverImageUrl || vendor.vendorStory,
    );
    const optionalProfileComplete = Boolean(
      vendor.description && vendor.coverImageUrl && vendor.vendorStory,
    );

    const states: Record<VendorOnboardingStepName, VendorOnboardingStepState> = {
      food_business_registration: registrationState,
      public_liability_insurance: insuranceState,
      food_safety_certificate: hygieneState,
      photo_id_verification: photoIdState,
      stripe_connect: stripeState,
      vendor_terms: termsState,
      tax_profile: taxState,
      allergen_declared_menu_item: menuState,
      fhrs_eligibility: fhrsState,
      menu_photography: hasMenuPhotography
        ? VendorOnboardingStepState.verified
        : VendorOnboardingStepState.not_started,
      optional_profile_content: optionalProfileComplete
        ? VendorOnboardingStepState.verified
        : hasAnyOptionalProfile
          ? VendorOnboardingStepState.in_progress
          : VendorOnboardingStepState.not_started,
      vendor_pro_subscription: VendorOnboardingStepState.not_started,
    };

    const steps = ONBOARDING_STEP_DEFINITIONS.map((definition) => ({
      ...definition,
      state: states[definition.name],
      complete: states[definition.name] === VendorOnboardingStepState.verified,
    }));

    await this.prisma.$transaction(
      steps.map((step) =>
        this.prisma.vendorOnboardingStep.upsert({
          where: { vendorId_name: { vendorId, name: step.name } },
          create: {
            vendorId,
            name: step.name,
            state: step.state,
            blocksProgress: step.blocksProgress,
            blocksPublication: step.blocksPublication,
            sourceCitation: step.sourceCitation,
          },
          update: {
            state: step.state,
            blocksProgress: step.blocksProgress,
            blocksPublication: step.blocksPublication,
            sourceCitation: step.sourceCitation,
          },
        }),
      ),
    );

    const blockingProgress = steps.filter((step) => step.blocksProgress && !step.complete);
    const blockingPublication = steps.filter((step) => step.blocksPublication && !step.complete);

    return {
      vendorId,
      canProgress: blockingProgress.length === 0,
      canProfileGoLive: blockingPublication.length === 0,
      blockingProgress,
      blockingPublication,
      steps,
    };
  }

  async assertCanProfileGoLive(vendorId: string): Promise<VendorOnboardingReadiness> {
    const readiness = await this.getReadiness(vendorId);
    if (!readiness.canProfileGoLive) {
      throw new BadRequestException({
        code: 'GO_LIVE_GATES_INCOMPLETE',
        message: 'This vendor cannot go live until every publication gate is complete.',
        blockingSteps: readiness.blockingPublication.map((step) => ({
          name: step.name,
          label: step.label,
          state: step.state,
          sourceCitation: step.sourceCitation,
        })),
      });
    }
    return readiness;
  }
}
