import { z } from 'zod';

// ============================================================
// Reusable primitives
// ============================================================

const uuid = () => z.string().uuid();
const ukPostcode = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/,
      'Invalid UK postcode',
    );
const phone = () =>
  z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Invalid phone number');
const pricePence = () => z.number().int().nonnegative();
const ratingStars = () => z.number().int().min(1).max(5);

const ItemCategoryEnum = z.enum([
  'tray',
  'soup',
  'protein',
  'swallow',
  'snack',
  'frozen',
  'bundle',
  'event',
]);
const DeliveryTypeEnum = z.enum(['local', 'collection', 'nationwide']);
const OrderTypeEnum = z.enum(['standard', 'event', 'subscription']);
const IssueTypeEnum = z.enum([
  'missing_items',
  'wrong_order',
  'quality',
  'not_delivered',
  'other',
]);
const SeverityEnum = z.enum(['low', 'medium', 'high']);

// ============================================================
// Auth
// ============================================================

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: phone().optional(),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof LoginSchema>;

// ============================================================
// User
// ============================================================

export const UpdateUserSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: phone().optional(),
  })
  .strict();
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

export const CreateAddressSchema = z.object({
  label: z.string().max(100).optional(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  postcode: ukPostcode(),
  country: z.string().length(2).default('GB'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false),
});
export type CreateAddressDto = z.infer<typeof CreateAddressSchema>;

// ============================================================
// Vendor
// ============================================================

export const CreateVendorSchema = z.object({
  businessName: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with dashes'),
  description: z.string().max(2000).optional(),
  cuisines: z.array(z.string().max(64)).min(1).max(20),
});
export type CreateVendorDto = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = CreateVendorSchema.partial().strict();
export type UpdateVendorDto = z.infer<typeof UpdateVendorSchema>;

// ============================================================
// Menu / MenuItem
// ============================================================

export const CreateMenuSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateMenuDto = z.infer<typeof CreateMenuSchema>;

export const CreateMenuItemSchema = z.object({
  menuId: uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  category: ItemCategoryEnum,
  pricePence: pricePence(),
  servingsCount: z.number().int().positive().optional(),
  preparationHours: z.number().int().min(1).max(720).default(24),
  imageUrls: z.array(z.string().url().max(500)).max(10).default([]),
  allergens: z.array(z.string().max(64)).default([]),
  tags: z.array(z.string().max(64)).default([]),
  isAvailable: z.boolean().default(true),
  stockCount: z.number().int().nonnegative().optional(),
});
export type CreateMenuItemDto = z.infer<typeof CreateMenuItemSchema>;

export const UpdateMenuItemSchema = CreateMenuItemSchema.partial()
  .omit({ menuId: true })
  .strict();
export type UpdateMenuItemDto = z.infer<typeof UpdateMenuItemSchema>;

// ============================================================
// Delivery
// ============================================================

export const CreateDeliveryConfigSchema = z.object({
  types: z.array(DeliveryTypeEnum).min(1),
  localRadiusMiles: z.number().int().min(0).max(100).default(5),
  localFeePence: pricePence().default(0),
  collectionAddress: z.string().max(500).optional(),
  nationwideEnabled: z.boolean().default(false),
  nationwideFeePence: pricePence().default(0),
  minOrderPence: pricePence().default(0),
  freeDeliveryOverPence: pricePence().optional(),
  postcodes: z.array(ukPostcode()).max(500).default([]),
});
export type CreateDeliveryConfigDto = z.infer<typeof CreateDeliveryConfigSchema>;

// ============================================================
// Orders
// ============================================================

export const CreateOrderItemSchema = z.object({
  menuItemId: uuid(),
  quantity: z.number().int().positive().max(999),
  notes: z.string().max(500).optional(),
});

export const CreateOrderSchema = z.object({
  vendorId: uuid(),
  addressId: uuid().optional(),
  type: OrderTypeEnum.default('standard'),
  deliveryType: DeliveryTypeEnum,
  items: z.array(CreateOrderItemSchema).min(1).max(100),
  notes: z.string().max(2000).optional(),
  scheduledFor: z.coerce.date().optional(),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const CreateRefundSchema = z.object({
  orderId: uuid(),
  amountPence: pricePence().optional(),
  reason: z.string().min(1).max(1000),
  partial: z.boolean().default(false),
});
export type CreateRefundDto = z.infer<typeof CreateRefundSchema>;

// ============================================================
// Disputes
// ============================================================

export const CreateDisputeSchema = z.object({
  orderId: uuid(),
  issueType: IssueTypeEnum,
  severity: SeverityEnum.default('low'),
  description: z.string().min(10).max(5000),
  evidenceUrls: z.array(z.string().url().max(500)).max(10).default([]),
});
export type CreateDisputeDto = z.infer<typeof CreateDisputeSchema>;

// ============================================================
// Reviews
// ============================================================

export const CreateReviewSchema = z.object({
  orderId: uuid(),
  rating: ratingStars(),
  title: z.string().max(255).optional(),
  body: z.string().max(2000).optional(),
});
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;

// ============================================================
// Events
// ============================================================

export const CreateEventEnquirySchema = z.object({
  eventType: z.string().min(1).max(100),
  guestCount: z.number().int().min(1).max(10000),
  eventDate: z.coerce.date(),
  postcode: ukPostcode(),
  budgetPence: pricePence().optional(),
  cuisines: z.array(z.string().max(64)).max(20).default([]),
  notes: z.string().max(5000).optional(),
});
export type CreateEventEnquiryDto = z.infer<typeof CreateEventEnquirySchema>;

export const CreateEventQuoteSchema = z.object({
  enquiryId: uuid(),
  pricePence: pricePence(),
  message: z.string().max(5000).optional(),
  menuOutline: z.unknown().optional(),
  expiresAt: z.coerce.date().optional(),
});
export type CreateEventQuoteDto = z.infer<typeof CreateEventQuoteSchema>;
