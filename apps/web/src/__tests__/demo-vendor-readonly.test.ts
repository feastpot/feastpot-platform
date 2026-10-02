import { DemoVendorBasketError, useBasketStore, type BasketVendor } from '@/store/basket.store';

const sampleItem = {
  menuItemId: 'sample-dish',
  menuItemName: 'Sample jollof',
  quantity: 1,
  unitPricePence: 1200,
};

describe('view-only demo vendor basket guard', () => {
  beforeEach(() => {
    useBasketStore.getState().clearBasket();
  });

  it('rejects adding a publicly flagged demo vendor', () => {
    const vendor: BasketVendor = {
      id: 'demo-vendor',
      name: 'Demo Kitchen',
      slug: 'demo-kitchen',
      publicDemo: true,
      canOrder: false,
    };

    expect(() => useBasketStore.getState().addItem(sampleItem, vendor)).toThrow(
      DemoVendorBasketError,
    );
    expect(useBasketStore.getState().items).toHaveLength(0);
    expect(useBasketStore.getState().vendor).toBeNull();
  });

  it('rejects vendors explicitly marked as unable to order', () => {
    const vendor: BasketVendor = {
      id: 'closed-vendor',
      name: 'Closed Kitchen',
      slug: 'closed-kitchen',
      canOrder: false,
    };

    expect(() => useBasketStore.getState().addItem(sampleItem, vendor)).toThrow(
      DemoVendorBasketError,
    );
    expect(useBasketStore.getState().items).toHaveLength(0);
  });

  it('keeps the public order flags on an orderable basket vendor', () => {
    const vendor: BasketVendor = {
      id: 'real-vendor',
      name: 'Real Kitchen',
      slug: 'real-kitchen',
      publicDemo: false,
      canOrder: true,
    };

    useBasketStore.getState().addItem(sampleItem, vendor);

    expect(useBasketStore.getState().vendor).toMatchObject({
      publicDemo: false,
      canOrder: true,
    });
  });
});
