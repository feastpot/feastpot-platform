import {
  vendorApplicationReceivedTemplate,
  VendorApplicationReceivedData,
} from './vendor-application-received.template';

const baseData: VendorApplicationReceivedData = {
  applicationId: 'app-123',
  fullName: 'Ada Okafor',
  kitchenName: "Ada's Kitchen",
  email: 'ada@example.com',
  phone: '+447700900000',
  postcode: 'SE1 2AB',
  cuisineType: 'Nigerian',
  kitchenType: 'home',
  hasFsaRegistration: true,
  hygieneRegNumber: 'FHRS-123456',
  deliveryRadiusMiles: 5,
  orderTypes: ['family_pots', 'event_catering'],
  foodStory: 'Cooking for over ten years.',
  instagram: 'adaskitchen',
  adminUrl: 'https://admin.feastpot.co.uk/vendor-applications/app-123',
};

describe('vendorApplicationReceivedTemplate', () => {
  it('includes hygiene registration number, delivery radius and order types', () => {
    const { html } = vendorApplicationReceivedTemplate(baseData);
    expect(html).toContain('Hygiene registration number');
    expect(html).toContain('FHRS-123456');
    expect(html).toContain('Delivery radius');
    expect(html).toContain('5 miles');
    expect(html).toContain('Order types');
    expect(html).toContain('family pots, event catering');
  });

  it('falls back to "Not provided" when radius and order types are omitted', () => {
    const { html } = vendorApplicationReceivedTemplate({
      ...baseData,
      deliveryRadiusMiles: null,
      orderTypes: null,
    });
    expect(html).toContain('Delivery radius');
    expect(html).toContain('Order types');
    expect(html.match(/Not provided/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('treats an empty order-types array as not provided', () => {
    const { html } = vendorApplicationReceivedTemplate({
      ...baseData,
      orderTypes: [],
    });
    expect(html).toContain('Not provided');
  });

  it('escapes HTML in the hygiene number', () => {
    const { html } = vendorApplicationReceivedTemplate({
      ...baseData,
      hygieneRegNumber: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
