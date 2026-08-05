import {
  baseLayout,
  brandButton,
  escapeHtml,
  h2,
  p,
} from '../../notifications/templates/base-layout';

interface VendorRecommendationInternalData {
  businessName?: string;
  instagramHandle?: string;
  phone?: string;
  outwardCode?: string;
  recommendedByEmail?: string;
}

export function vendorRecommendationInternalTemplate(data: VendorRecommendationInternalData): {
  subject: string;
  html: string;
} {
  const rows: Array<[string, string]> = [
    ['Business / name', data.businessName ?? '—'],
    ['Instagram handle', data.instagramHandle ? `@${data.instagramHandle}` : '—'],
    ['Phone', data.phone ?? '—'],
    ['Area', data.outwardCode ?? '—'],
    ['Recommended by', data.recommendedByEmail ?? 'Anonymous'],
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
    subject: `New vendor recommendation: ${data.businessName ?? data.instagramHandle ?? data.phone ?? 'unknown'}`,
    html: baseLayout(
      'New vendor recommendation',
      h2('New vendor recommendation') +
        p('Someone has recommended a cook. Review and reach out if they look promising.') +
        tableHtml +
        brandButton('Open admin', 'https://admin.feastpot.co.uk/vendor-recommendations'),
      'Vendor recommendation received',
    ),
  };
}
