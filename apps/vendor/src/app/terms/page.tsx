import { redirect } from 'next/navigation';

// Terms & notices has been merged into Account and compliance.
export default function TermsPage() {
  redirect('/account-and-compliance');
}
