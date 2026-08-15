import {
  baseLayout,
  brandButton,
  escapeHtml,
  h2,
  p,
} from '../../notifications/templates/base-layout';

interface CateringEnquiryInternalData {
  id: string;
  contactName: string;
  email: string;
  phone?: string | null;
  occasionType: string;
  guestCountBand: string;
  cuisineStyle?: string | null;
  postcode: string;
  eventDate?: string | null;
  budgetBand?: string | null;
  notes?: string | null;
}

export function cateringEnquiryInternalTemplate(data: CateringEnquiryInternalData): {
  subject: string;
  html: string;
} {
  const rows: Array<[string, string]> = [
    ['Contact', data.contactName],
    ['Email', data.email],
    ['Phone', data.phone ?? '-'],
    ['Occasion', data.occasionType],
    ['Guests', data.guestCountBand],
    ['Cuisine style', data.cuisineStyle ?? '-'],
    ['Postcode', data.postcode],
    ['Event date', data.eventDate ?? '-'],
    ['Budget', data.budgetBand ?? '-'],
  ];

  const tableHtml = `
    <table style="width:100%;border-collapse:separate;border-spacing:0 4px;margin:16px 0;font-size:14px">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;background:#F4F4F4;border-radius:4px;font-weight:600;color:#1A1A1A;width:40%">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;color:#5F5E5A">${escapeHtml(value)}</td>
        </tr>`,
        )
        .join('')}
    </table>`;

  return {
    subject: `New catering enquiry: ${data.occasionType} for ${data.guestCountBand} guests (${data.postcode})`,
    html: baseLayout(
      'New catering enquiry',
      h2('New catering enquiry') +
        p('A customer has submitted a feast request. Qualify and match within 48 hours.') +
        tableHtml +
        (data.notes ? p(`<strong>Notes:</strong><br>${escapeHtml(data.notes)}`) : '') +
        brandButton('Open in admin', `https://admin.feastpot.co.uk/catering-enquiries/${data.id}`),
      'Catering enquiry - action required',
    ),
  };
}
