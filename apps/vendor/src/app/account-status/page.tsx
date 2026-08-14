import { redirect } from 'next/navigation';

// Account status has been merged into Account and compliance.
export default function AccountStatusPage() {
  redirect('/account-and-compliance');
}
