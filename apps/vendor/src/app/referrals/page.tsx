/**
 * /referrals is retired. "Bring your own customers" and "Share your kitchen"
 * have been merged into a single "Share and customers" screen at /share.
 *
 * This redirect preserves all existing bookmarks and nav links.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ReferralsPage() {
  redirect('/share');
}
