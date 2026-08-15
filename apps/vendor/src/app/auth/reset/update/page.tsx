'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * New-password form for the vendor portal.
 *
 * The vendor arrives here after clicking the reset email, passing through
 * the /auth/reset/start interstitial, and having their Supabase token
 * exchanged by /auth/callback?type=recovery&next=/auth/reset/update.
 *
 * Password rules:
 *   - Minimum 8 characters (shown upfront, not only on error)
 *   - Maximum 72 characters (bcrypt processes only the first 72 bytes;
 *     chars beyond that are silently ignored, so we cap here)
 *
 * After success:
 *   - All other sessions revoked via signOut({ scope: 'others' })
 *   - Password-changed notification email sent via the API (fire-and-forget)
 *   - Vendor lands on a clear success state with an explicit next action
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

export default function VendorResetUpdate() {
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
      setError(updateError.message);
      setBusy(false);
      return;
    }

    // Revoke all other sessions (password reset is frequently a response to
    // suspected compromise; leaving other sessions alive defeats the purpose).
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {
      console.warn('[vendor-reset-update] signOut(others) failed; session revocation incomplete');
    });

    // Fire-and-forget: send branded password-changed confirmation email.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/v1/auth/notify-password-changed`, {
          method: 'POST',
          headers: { authorization: `Bearer ${session.access_token}` },
        }).catch(() => undefined);
      }
    } catch {
      // Non-fatal; the password is already changed.
    }

    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Link href="/sign-in" aria-label="Feastpot vendor portal">
              <Image
                src="/images/feastpot-logo.png"
                alt="Feastpot"
                width={317}
                height={100}
                className="h-10 w-auto"
              />
            </Link>
          </div>
          <div className="fp-card border border-border bg-white p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-light">
              <svg
                className="h-6 w-6 text-teal-dark"
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
            <h1 className="text-2xl font-extrabold tracking-tight text-dark">Password updated</h1>
            <p className="text-sm leading-relaxed text-mid">
              Your password has been changed and any other active sessions have been signed out. You
              will receive a confirmation email shortly.
            </p>
            <Link
              href="/sign-in"
              className="inline-block rounded-lg bg-teal px-6 py-3 text-sm font-semibold text-white hover:bg-teal-dark"
            >
              Sign in to your account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/sign-in" aria-label="Feastpot vendor portal">
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

        <div className="fp-card border border-border bg-white p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">
            Choose a new password
          </h1>

          {/* Password rules shown upfront, before submission */}
          <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-mid">
            <strong className="text-dark">Your password must have:</strong>
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
                className="mb-1.5 block text-[13px] font-semibold text-dark"
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
                className="w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm font-medium text-dark placeholder:text-mid/60 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                aria-describedby={error ? 'pw-error' : undefined}
              />
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-[13px] font-semibold text-dark">
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
                className="w-full rounded-lg border border-border bg-white px-3.5 py-3 text-sm font-medium text-dark placeholder:text-mid/60 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
            </div>

            {error && (
              <p id="pw-error" role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-teal py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Updating\u2026' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
