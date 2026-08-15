'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * New-password form - the final step of the password reset journey.
 *
 * The user arrives here after:
 *   1. Clicking the reset email (which goes to /auth/reset/start)
 *   2. Clicking "Set new password" on the interstitial
 *   3. Supabase validating the token and redirecting to /auth/callback?type=recovery
 *   4. The callback exchanging the code for a session and redirecting here
 *
 * At this point, the user has an active Supabase session with the
 * `password_recovery` AMR claim. They can call updateUser() to set a new
 * password without re-entering their old one.
 *
 * After a successful update:
 *   - All other sessions are revoked via signOut({ scope: 'others' })
 *   - A password-changed notification email is fired via the API
 *   - The user lands on a clear success state, not auto-redirected somewhere
 *
 * PASSWORD RULES (enforced here and on the server):
 *   - Minimum 8 characters
 *   - Maximum 72 characters (bcrypt processes only the first 72 bytes;
 *     characters beyond that are silently ignored by bcrypt, so we cap it
 *     here to avoid a confusing "password works but is shorter than you think"
 *     situation)
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // bcrypt boundary

function validate(password: string, confirm: string): string | null {
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Password must be ${MAX_LENGTH} characters or fewer.`;
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^a-zA-Z0-9]/.test(password))
    return 'Password must contain at least one symbol (e.g. !, @, #, $).';
  if (password !== confirm) return 'Passwords do not match. Please check and try again.';
  return null;
}

export default function ResetUpdate() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // Surface the Supabase error. Common cases: "Password should be different
      // from the old password" (if leaked-password check or same-password
      // rejection is enabled), "New password should be different from the old
      // password", session expired.
      setError(updateError.message);
      setBusy(false);
      return;
    }

    // Revoke all other active sessions. A password reset is frequently a
    // response to suspected account compromise; leaving other sessions alive
    // would defeat the purpose.
    // 'others' keeps the current session so the user remains signed in here.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {
      // Non-fatal: if revocation fails (e.g. network glitch) the password is
      // still changed. Log for ops but do not block the user.
      console.warn('[reset-update] signOut(others) failed; session revocation incomplete');
    });

    // Fire-and-forget: ask the API to send the branded password-changed
    // confirmation email. The user should not be blocked if this fails.
    // Pass the current session's access token so the auth-guarded endpoint
    // can identify the user without requiring cookie forwarding.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch('/v1/auth/notify-password-changed', {
          method: 'POST',
          headers: { authorization: `Bearer ${session.access_token}` },
        }).catch(() => undefined);
      }
    } catch {
      // Non-fatal.
    }

    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Link href="/" aria-label="Feastpot home">
              <Image
                src="/images/feastpot-logo.png"
                alt="Feastpot"
                width={317}
                height={100}
                className="h-10 w-auto"
              />
            </Link>
          </div>
          <div className="rounded-2xl bg-white p-8 shadow-card text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-light">
              <svg
                className="h-6 w-6 text-brand"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
              Password updated
            </h1>
            <p className="text-sm leading-relaxed text-charcoal-mid">
              Your password has been changed and any other active sessions have been signed out. You
              will receive a confirmation email shortly.
            </p>
            <Link
              href="/"
              className="inline-block rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Go to Feastpot
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Feastpot home">
            <Image
              src="/images/feastpot-logo.png"
              alt="Feastpot"
              width={317}
              height={100}
              className="h-10 w-auto"
              priority
            />
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-card">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            Choose a new password
          </h1>

          {/* Password rules shown upfront, before submission */}
          <div className="mt-3 rounded-lg bg-cream-warm px-4 py-3 text-xs leading-relaxed text-charcoal-mid">
            <strong className="text-charcoal">Your password must have:</strong>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li>
                At least {MIN_LENGTH} characters (up to {MAX_LENGTH})
              </li>
              <li>Uppercase and lowercase letters</li>
              <li>At least one number</li>
              <li>At least one symbol (e.g. !, @, #, $)</li>
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[13px] font-semibold text-charcoal"
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                maxLength={MAX_LENGTH}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-lg border border-cream-deep bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                aria-describedby={error ? 'pw-error' : undefined}
              />
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-1.5 block text-[13px] font-semibold text-charcoal"
              >
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_LENGTH}
                maxLength={MAX_LENGTH}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-lg border border-cream-deep bg-white px-3.5 py-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {error && (
              <p id="pw-error" role="alert" className="text-sm text-scotch">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Updating password\u2026' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
