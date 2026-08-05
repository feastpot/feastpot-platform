import { baseLayout, brandButton, h2, p } from '../../notifications/templates/base-layout';

interface WaitlistConfirmationData {
  postcode: string;
  outwardCode: string;
}

export function waitlistConfirmationTemplate(data: WaitlistConfirmationData): {
  subject: string;
  html: string;
} {
  return {
    subject: "You're on the Feastpot waitlist",
    html: baseLayout(
      "You're on the waitlist",
      h2("You're on the Feastpot waitlist") +
        p(
          `We have added <strong>${data.outwardCode}</strong> to our expansion list. ` +
            `As soon as a verified cook goes live in your area, we will let you know.`,
        ) +
        p('In the meantime, check if any vendors already cover your postcode on our homepage.') +
        brandButton('Browse vendors', 'https://feastpot.co.uk') +
        p('If you did not sign up for this, you can safely ignore this email.', '#888780'),
      'Added to the Feastpot waitlist',
    ),
  };
}
