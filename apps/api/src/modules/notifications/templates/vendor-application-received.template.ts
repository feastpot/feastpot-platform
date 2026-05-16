import { baseLayout, brandButton, escapeHtml, h2, p } from './base-layout';

export interface VendorApplicationReceivedData {
  applicationId: string;
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  postcode: string;
  cuisineType: string;
  kitchenType: string;
  hasFsaRegistration: boolean;
  foodStory: string;
  instagram?: string | null;
  adminUrl: string;
}

/**
 * Internal-facing email sent to the admin inbox the moment a new vendor
 * application lands. Includes the full application payload so the reviewer
 * can triage from email without opening the admin panel.
 */
export function vendorApplicationReceivedTemplate(
  data: VendorApplicationReceivedData,
): { subject: string; html: string } {
  const rows: Array<[string, string]> = [
    ['Kitchen name', data.kitchenName],
    ['Contact name', data.fullName],
    ['Email', data.email],
    ['Phone', data.phone],
    ['Postcode', data.postcode],
    ['Cuisine type', data.cuisineType],
    ['Kitchen type', data.kitchenType],
    ['FSA registered', data.hasFsaRegistration ? 'Yes' : 'No'],
    ['Instagram', data.instagram ? `@${data.instagram}` : 'Not provided'],
  ];

  const tableHtml = `
    <table style="width:100%;border-collapse:separate;border-spacing:0 4px;margin:16px 0;font-size:14px">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;background:#F4F4F4;border-radius:4px;font-weight:600;color:#1A1A1A;width:40%">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;color:#5F5E5A">${escapeHtml(value)}</td>
        </tr>
      `,
        )
        .join('')}
    </table>
  `;

  return {
    subject: `New vendor application: ${data.kitchenName} (${data.cuisineType})`,
    html: baseLayout(
      'New vendor application',
      h2('New vendor application received') +
        p(
          `A new vendor has submitted an interest form. Review and approve or reject within 1-2 business days.`,
        ) +
        tableHtml +
        p(`<strong>Their food story:</strong><br>${escapeHtml(data.foodStory)}`) +
        brandButton('Review application in admin', data.adminUrl) +
        p(
          'SLA: Respond within 1-2 business days. The applicant has been sent an acknowledgement.',
          '#888780',
        ),
      'New vendor — action required',
    ),
  };
}
