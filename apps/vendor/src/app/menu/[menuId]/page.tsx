import { redirect } from 'next/navigation';

/**
 * The per-menu detail route is no longer used. All dish management now lives
 * at /menu. Redirect any bookmarked or linked URLs gracefully.
 */
export default function LegacyMenuDetailPage() {
  redirect('/menu');
}
