/**
 * Contract test: WHATSAPP_PARAMS builders vs approved Twilio Content Templates.
 *
 * Meta enforces EXACT {{n}} parameter counts on approved WhatsApp Content
 * Templates - a builder returning the wrong number of values makes live sends
 * FAIL (not just render blank). There is no build-time link between the
 * template registry (templates/index.ts) and the builders in
 * notification.processor.ts, so this test is the guard rail:
 *
 *  1. Every `whatsappTemplate` name declared in TEMPLATES must have an explicit
 *     builder in WHATSAPP_PARAMS (no template may silently fall back to the
 *     3-slot generic shape, which does NOT match any approved body).
 *  2. Each builder must return exactly the slot count of the approved Twilio
 *     Content Template (verified against the Content API, Jul 2026).
 *  3. payout_statement's {{2}} is the £ net amount (amountPence/netPence) -
 *     payouts have no orderNumber.
 *
 * If this test fails after you add/edit a template or builder: update the
 * approved Twilio Content Template first, then update EXPECTED_SLOT_COUNTS
 * here to match the newly approved body.
 */
import { WHATSAPP_PARAMS } from './notification.processor';
import { getRequiredContentSidEnvVarNames } from './providers/whatsapp.provider';
import { TEMPLATES } from './templates';

/**
 * Approved slot counts per Twilio Content Template (source of truth:
 * Twilio Content API, approved bodies as of Jul 2026).
 */
const EXPECTED_SLOT_COUNTS: Record<string, number> = {
  // {{1}} = firstName, {{2}} = formatted £ net payout
  payout_statement: 2,
  // {{1}} = firstName, {{2}} = order number
  order_confirmation: 2,
  order_accepted: 2,
  order_dispatched: 2,
  delivery_confirmed: 2,
  order_amendment_proposed: 2,
  review_request: 2,
  // {{1}} = firstName
  event_quote_received: 1,
  event_reminder_72h: 1,
  event_balance_link: 1,
};

/** Every whatsappTemplate name declared in the template registry. */
const declaredWhatsappTemplates = [
  ...new Set(
    Object.values(TEMPLATES)
      .map((t) => t.whatsappTemplate)
      .filter((name): name is string => typeof name === 'string'),
  ),
].sort();

describe('WhatsApp template contract (WHATSAPP_PARAMS vs Twilio Content Templates)', () => {
  it('every whatsappTemplate in the registry has an explicit builder (no generic fallback)', () => {
    const missing = declaredWhatsappTemplates.filter((name) => !(name in WHATSAPP_PARAMS));
    expect(missing).toEqual([]);
  });

  it('every whatsappTemplate in the registry has a documented expected slot count', () => {
    const undocumented = declaredWhatsappTemplates.filter(
      (name) => !(name in EXPECTED_SLOT_COUNTS),
    );
    expect(undocumented).toEqual([]);
  });

  it('every builder / expected slot count corresponds to a template still in the registry', () => {
    // Catches drift in the other direction: a renamed/removed template leaving
    // a stale builder or stale expectation behind.
    const declared = new Set(declaredWhatsappTemplates);
    expect(
      Object.keys(WHATSAPP_PARAMS)
        .filter((n) => !declared.has(n))
        .sort(),
    ).toEqual([]);
    expect(
      Object.keys(EXPECTED_SLOT_COUNTS)
        .filter((n) => !declared.has(n))
        .sort(),
    ).toEqual([]);
  });

  const sampleData: Record<string, unknown> = {
    orderNumber: 'FP-1234',
    amountPence: 12345,
    netPence: 6789,
    totalPence: 999,
  };

  it.each(Object.entries(EXPECTED_SLOT_COUNTS))(
    '%s builder returns exactly %i slot(s)',
    (templateName, expectedCount) => {
      const builder = WHATSAPP_PARAMS[templateName];
      expect(builder).toBeDefined();
      const params = builder('Amara', sampleData);
      expect(params).toHaveLength(expectedCount);
      // Every slot must be filled - Meta rejects empty variables too.
      for (const value of params) {
        expect(String(value).length).toBeGreaterThan(0);
      }
    },
  );

  it('payout_statement uses the £ net amount (amountPence/netPence), never orderNumber', () => {
    const builder = WHATSAPP_PARAMS.payout_statement;
    expect(builder('Amara', { amountPence: 12345, orderNumber: 'FP-9999' })).toEqual([
      'Amara',
      '£123.45',
    ]);
    // netPence is the fallback when amountPence is absent.
    expect(builder('Amara', { netPence: 6789, orderNumber: 'FP-9999' })).toEqual([
      'Amara',
      '£67.89',
    ]);
    // Never leaks the order number into the amount slot.
    expect(builder('Amara', { amountPence: 100, orderNumber: 'FP-9999' })).not.toContain('FP-9999');
  });

  it('order-lifecycle builders put firstName in {{1}} and orderNumber in {{2}}', () => {
    for (const name of [
      'order_confirmation',
      'order_accepted',
      'order_dispatched',
      'delivery_confirmed',
      'order_amendment_proposed',
      'review_request',
    ]) {
      expect(WHATSAPP_PARAMS[name]('Amara', sampleData)).toEqual(['Amara', 'FP-1234']);
    }
  });

  it('event_* builders send firstName only', () => {
    for (const name of ['event_quote_received', 'event_reminder_72h', 'event_balance_link']) {
      expect(WHATSAPP_PARAMS[name]('Amara', sampleData)).toEqual(['Amara']);
    }
  });
});

/**
 * Startup SID env-var contract.
 *
 * getRequiredContentSidEnvVarNames() derives the required TWILIO_CONTENT_SID_*
 * names from the live TEMPLATES registry. This test locks the expected set so
 * that:
 *  - adding a new whatsappTemplate forces a developer to also update this list,
 *    which is the reminder to register the SID env var before deploying.
 *  - removing a template surfaces stale entries that can be cleaned up.
 *
 * Update EXPECTED_CONTENT_SID_ENV_VARS whenever you add or remove a template
 * that has a whatsappTemplate field.
 */
const EXPECTED_CONTENT_SID_ENV_VARS = [
  'TWILIO_CONTENT_SID_delivery_confirmed',
  'TWILIO_CONTENT_SID_event_balance_link',
  'TWILIO_CONTENT_SID_event_quote_received',
  'TWILIO_CONTENT_SID_event_reminder_72h',
  'TWILIO_CONTENT_SID_order_accepted',
  'TWILIO_CONTENT_SID_order_amendment_proposed',
  'TWILIO_CONTENT_SID_order_confirmation',
  'TWILIO_CONTENT_SID_order_dispatched',
  'TWILIO_CONTENT_SID_payout_statement',
  'TWILIO_CONTENT_SID_review_request',
].sort();

describe('WhatsApp Content SID env-var contract (getRequiredContentSidEnvVarNames)', () => {
  it('required SID env var names match the expected documented set', () => {
    // If this test fails you added or removed a whatsappTemplate.
    // Update EXPECTED_CONTENT_SID_ENV_VARS above AND make sure the
    // corresponding TWILIO_CONTENT_SID_<name> secret is set in the deployment
    // env before merging.
    expect(getRequiredContentSidEnvVarNames().sort()).toEqual(EXPECTED_CONTENT_SID_ENV_VARS);
  });

  it('every expected env var name corresponds to a template in the registry', () => {
    const actual = new Set(getRequiredContentSidEnvVarNames());
    const stale = EXPECTED_CONTENT_SID_ENV_VARS.filter((v) => !actual.has(v));
    expect(stale).toEqual([]);
  });
});
