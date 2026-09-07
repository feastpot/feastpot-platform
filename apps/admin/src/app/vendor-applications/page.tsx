import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function VendorApplicationsPage() {
  redirect('/supply-pipeline?status=Applied');
}
