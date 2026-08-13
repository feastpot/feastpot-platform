/**
 * Legacy item editor route - superseded by the slide-over panel in the
 * unified /menu dishes screen. Redirect any direct or bookmarked links.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyItemEditorPage() {
  redirect('/menu');
}
