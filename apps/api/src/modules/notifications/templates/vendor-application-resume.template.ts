import { baseLayout, brandButton, h2, p } from './base-layout';

export function vendorApplicationResumeTemplate(data: {
  firstName: string;
  resumeUrl: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  return {
    subject: 'Continue your Feastpot application',
    html: baseLayout(
      'Continue your Feastpot application',
      h2(`Your application is saved, ${data.firstName}`) +
        p(
          'You can stop at any point. Use this private link to return to the exact step where you left off.',
        ) +
        brandButton('Continue my application', data.resumeUrl) +
        p(
          `For your security, this link expires on ${data.expiresAt.toLocaleDateString('en-GB')}.`,
          '#888780',
        ),
      'Your Feastpot application is saved',
    ),
  };
}
