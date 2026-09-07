/** Persisted status values for the legacy varchar catering_enquiries.status column. */
export const CATERING_ENQUIRY_STATUSES = [
  'NEW',
  'UNASSIGNED',
  'ASSIGNED',
  'QUALIFIED',
  'MATCHED',
  'WON',
  'LOST',
  'EXPIRED',
] as const;

export type CateringEnquiryStatus = (typeof CATERING_ENQUIRY_STATUSES)[number];

export function isCateringEnquiryStatus(value: string): value is CateringEnquiryStatus {
  return (CATERING_ENQUIRY_STATUSES as readonly string[]).includes(value);
}
