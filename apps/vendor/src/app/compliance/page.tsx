import { redirect } from 'next/navigation';

// Compliance has been merged into Account and compliance.
export default function CompliancePage() {
  redirect('/account-and-compliance');
}
