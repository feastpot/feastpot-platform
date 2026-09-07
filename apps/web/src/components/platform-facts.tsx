import { ALLERGEN_LABELS } from '@feastpot/config/allergens';
import {
  CATERING_CANCELLATION_TIERS,
  CATERING_DEPOSIT_PERCENT,
} from '@feastpot/config/catering-deposit';
import { PLATFORM_FACTS, type PlatformFactsModel } from '@feastpot/config/platform-facts';

async function getCurrentTermsVersion(): Promise<string> {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(
    `${apiUrl.replace(/\/$/, '')}/v1/terms/current?documentType=VENDOR_TERMS`,
    { cache: 'no-store' },
  );
  if (!response.ok) throw new Error(`Current Vendor Terms API returned ${response.status}.`);
  const current = (await response.json()) as { version?: unknown } | null;
  if (!current || typeof current.version !== 'string') {
    throw new Error('Current Vendor Terms API returned no effective version.');
  }
  return current.version;
}

function buildWebPlatformFactsModel(currentVendorTermsVersion: string): PlatformFactsModel {
  return {
    commissionRates: PLATFORM_FACTS.commission,
    customerServiceFee: PLATFORM_FACTS.serviceFee,
    feastPassPricing: PLATFORM_FACTS.feastPass,
    cateringPolicy: {
      depositPercent: CATERING_DEPOSIT_PERCENT,
      cancellationTiers: CATERING_CANCELLATION_TIERS,
    },
    payoutSchedule: PLATFORM_FACTS.payouts,
    vendorEligibilityRequirements: PLATFORM_FACTS.vendorRequirements,
    currentVendorTermsVersion,
    support: {
      hours: PLATFORM_FACTS.support.hours,
      email: PLATFORM_FACTS.support.email,
      complianceEmail: PLATFORM_FACTS.contact.complianceEmail,
      appealsEmail: PLATFORM_FACTS.contact.appealsEmail,
    },
    allergens: ALLERGEN_LABELS,
  };
}

export async function PlatformFacts() {
  const facts = buildWebPlatformFactsModel(await getCurrentTermsVersion());
  const json = JSON.stringify(facts).replace(/</g, '\\u003c');
  return (
    <>
      <div data-testid="platform-facts-visible" className="mt-8 space-y-8">
        <PlatformFactsView facts={facts} />
      </div>
      <script
        id="platform-facts-model"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: json }}
      />
    </>
  );
}

function PlatformFactsView({ facts }: { facts: PlatformFactsModel }) {
  return (
    <>
      <Section title="Commission rates per segment">
        <dl>
          <Fact
            label="Marketplace first order"
            value={`${facts.commissionRates.marketplaceFirst}%`}
          />
          <Fact
            label="Marketplace repeat order"
            value={`${facts.commissionRates.marketplaceRepeat}%`}
          />
          <Fact label="Vendor referred" value={`${facts.commissionRates.vendorReferred}%`} />
          <Fact label="Catering" value={`${facts.commissionRates.catering}%`} />
          <Fact label="Basis" value={facts.commissionRates.basis} />
        </dl>
      </Section>
      <Section title="Customer service fee">
        <dl>
          <Fact label="Percentage" value={`${facts.customerServiceFee.percent}%`} />
          <Fact label="Cap" value={`£${(facts.customerServiceFee.capPence / 100).toFixed(2)}`} />
        </dl>
      </Section>
      <Section title="FeastPass pricing">
        <dl>
          <Fact
            label="Monthly"
            value={`£${(facts.feastPassPricing.monthlyPence / 100).toFixed(2)}`}
          />
          <Fact
            label="Annual"
            value={`£${(facts.feastPassPricing.annualPence / 100).toFixed(2)}`}
          />
        </dl>
      </Section>
      <Section title="Catering deposit and cancellation">
        <p>Deposit: {facts.cateringPolicy.depositPercent}%</p>
        <ul className="list-disc pl-6">
          {facts.cateringPolicy.cancellationTiers.map((tier) => (
            <li key={tier.minimumDaysBeforeEvent}>
              At least {tier.minimumDaysBeforeEvent} days before: {tier.refundPercent}% refund
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Payout schedule">
        <p>
          {facts.payoutSchedule.frequency}, every {facts.payoutSchedule.day}
        </p>
      </Section>
      <Section title="Vendor eligibility requirements">
        <ul className="list-disc pl-6">
          {facts.vendorEligibilityRequirements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>
      <Section title="Current effective Vendor Terms">
        <p>Version {facts.currentVendorTermsVersion}</p>
      </Section>
      <Section title="Support hours and contact addresses">
        <dl>
          <Fact label="Hours" value={facts.support.hours} />
          <Fact label="Support" value={facts.support.email} />
          <Fact label="Compliance" value={facts.support.complianceEmail} />
          <Fact label="Appeals" value={facts.support.appealsEmail} />
        </dl>
      </Section>
      <Section title="The 14 allergens">
        <ol className="list-decimal pl-6">
          {facts.allergens.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 py-1">
      <dt className="font-medium">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
