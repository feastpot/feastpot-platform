import { redirect } from 'next/navigation';

/**
 * Legacy route. The customer auth flow was consolidated into a single
 * dynamic page at `/sign-in` with a `?mode=register` tab. Anything that
 * still links here (bookmarks, old marketing emails, SEO) lands on the
 * Create-account tab so the user sees the exact same form they expected.
 */
export default function CreateAccountLegacyRoute() {
  redirect('/sign-in?mode=register');
}
