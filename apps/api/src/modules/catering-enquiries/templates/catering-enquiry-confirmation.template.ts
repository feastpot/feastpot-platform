import { baseLayout, brandButton, h2, p } from '../../notifications/templates/base-layout';

interface CateringEnquiryConfirmationData {
  contactName: string;
  postcode: string;
  eventDate?: string | null;
  guestCountBand: string;
  cuisineStyle?: string | null;
}

export function cateringEnquiryConfirmationTemplate(data: CateringEnquiryConfirmationData): {
  subject: string;
  html: string;
} {
  return {
    subject: 'Your feast request has been received',
    html: baseLayout(
      'Feast request received',
      h2(`Hi ${data.contactName.split(' ')[0]}, your feast request has been received`) +
        p(
          'Your feast request has been received. We will use your postcode, date, guest count ' +
            'and food preferences to help match you with suitable vendors.',
        ) +
        p(
          'Our team will review your request and be in touch within 48 hours. ' +
            'If you have any questions, reply to this email.',
        ) +
        brandButton('Browse vendors while you wait', 'https://feastpot.co.uk/vendors') +
        p('If you did not make this request, you can safely ignore this email.', '#888780'),
      'Your feast request is in. We will match you soon.',
    ),
  };
}
