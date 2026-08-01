import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { APPLICATION_ORDER_TYPES, RegisterVendorInterestDto } from './register-vendor-interest.dto';

/**
 * Guards the vendor-application DTO rules (hygiene number, delivery radius,
 * order types) so a future refactor can't silently drop them. Runs each
 * payload through a ValidationPipe configured EXACTLY like main.ts
 * (whitelist + transform + enableImplicitConversion) so behaviour matches
 * production, not just bare class-validator defaults.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const metadata = {
  type: 'body' as const,
  metatype: RegisterVendorInterestDto,
};

/** Minimal payload that satisfies every required field. */
const validPayload = () => ({
  fullName: 'Ada Balogun',
  kitchenName: "Ada's Kitchen",
  email: 'ada@example.com',
  phone: '07123456789',
  postcode: 'SE15 4AB',
  cuisineType: 'Nigerian',
  kitchenType: 'home',
  hasFoodHygieneRegistration: true,
  hygieneRegNumber: 'FHRS-123456',
  deliveryRadiusMiles: 10,
  orderTypes: ['family_pots', 'party_trays'],
  foodStory: 'I have been cooking jollof for my community for ten years.',
});

const expectRejected = async (payload: Record<string, unknown>, fragment: string) => {
  try {
    await pipe.transform(payload, metadata);
    fail(`expected validation to reject payload but it passed (${fragment})`);
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    const body = (err as BadRequestException).getResponse() as { message: string[] };
    expect(JSON.stringify(body.message)).toContain(fragment);
  }
};

describe('RegisterVendorInterestDto validation', () => {
  it('accepts a fully valid payload and keeps the new fields', async () => {
    const dto = await pipe.transform(validPayload(), metadata);
    expect(dto).toBeInstanceOf(RegisterVendorInterestDto);
    expect(dto.hygieneRegNumber).toBe('FHRS-123456');
    expect(dto.deliveryRadiusMiles).toBe(10);
    expect(dto.orderTypes).toEqual(['family_pots', 'party_trays']);
  });

  describe('hygieneRegNumber', () => {
    it('rejects a missing hygiene number', async () => {
      const { hygieneRegNumber: _omit, ...rest } = validPayload();
      await expectRejected(rest, 'hygieneRegNumber');
    });

    it('rejects an empty string', async () => {
      await expectRejected({ ...validPayload(), hygieneRegNumber: '' }, 'hygieneRegNumber');
    });

    it('rejects a whitespace-only hygiene number', async () => {
      await expectRejected(
        { ...validPayload(), hygieneRegNumber: '    ' },
        'hygieneRegNumber must not be blank',
      );
    });

    it('rejects a single-character value (min length 2)', async () => {
      await expectRejected({ ...validPayload(), hygieneRegNumber: 'X' }, 'hygieneRegNumber');
    });

    it('rejects values over 64 chars', async () => {
      await expectRejected(
        { ...validPayload(), hygieneRegNumber: 'A'.repeat(65) },
        'hygieneRegNumber',
      );
    });

    it('coerces numeric input to a string (production enableImplicitConversion)', async () => {
      // main.ts runs the pipe with enableImplicitConversion, so a bare
      // number arrives as its string form rather than 400ing. Documented
      // here so nobody "fixes" it into a rejection without realising the
      // production pipe would never see the raw number.
      const dto = await pipe.transform({ ...validPayload(), hygieneRegNumber: 12345 }, metadata);
      expect(dto.hygieneRegNumber).toBe('12345');
    });
  });

  describe('deliveryRadiusMiles', () => {
    it.each([0, -5, 101, 1000])('rejects out-of-range radius %p', async (radius) => {
      await expectRejected(
        { ...validPayload(), deliveryRadiusMiles: radius },
        'deliveryRadiusMiles',
      );
    });

    it('rejects a non-integer radius', async () => {
      await expectRejected({ ...validPayload(), deliveryRadiusMiles: 2.5 }, 'deliveryRadiusMiles');
    });

    it('rejects a non-numeric radius', async () => {
      await expectRejected(
        { ...validPayload(), deliveryRadiusMiles: 'ten' },
        'deliveryRadiusMiles',
      );
    });

    it.each([1, 100])('accepts boundary radius %p', async (radius) => {
      const dto = await pipe.transform(
        { ...validPayload(), deliveryRadiusMiles: radius },
        metadata,
      );
      expect(dto.deliveryRadiusMiles).toBe(radius);
    });

    it('accepts an omitted radius (optional field)', async () => {
      const { deliveryRadiusMiles: _omit, ...rest } = validPayload();
      const dto = await pipe.transform(rest, metadata);
      expect(dto.deliveryRadiusMiles).toBeUndefined();
    });
  });

  describe('orderTypes', () => {
    it('rejects an unknown order type', async () => {
      await expectRejected(
        { ...validPayload(), orderTypes: ['family_pots', 'sushi_boats'] },
        'orderTypes',
      );
    });

    it('rejects a non-array value', async () => {
      await expectRejected({ ...validPayload(), orderTypes: 'family_pots' }, 'orderTypes');
    });

    it('rejects arrays longer than the known set', async () => {
      await expectRejected(
        {
          ...validPayload(),
          orderTypes: Array(APPLICATION_ORDER_TYPES.length + 1).fill('family_pots'),
        },
        'orderTypes',
      );
    });

    it('accepts every known order type', async () => {
      const dto = await pipe.transform(
        { ...validPayload(), orderTypes: [...APPLICATION_ORDER_TYPES] },
        metadata,
      );
      expect(dto.orderTypes).toEqual([...APPLICATION_ORDER_TYPES]);
    });

    it('accepts an omitted orderTypes (optional field)', async () => {
      const { orderTypes: _omit, ...rest } = validPayload();
      const dto = await pipe.transform(rest, metadata);
      expect(dto.orderTypes).toBeUndefined();
    });
  });
});
