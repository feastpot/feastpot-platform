'use client';

import { Button, Card, CardContent, Input } from '@feastpot/ui';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Next 15 requires `useSearchParams()` to be wrapped in a `<Suspense>`
 * boundary so the page can statically prerender the chrome while the
 * search-params-dependent inner content streams in.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInChrome>{null}</SignInChrome>}>
      <SignInForm />
    </Suspense>
  );
}

function SignInChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950 p-6">
      {/* soft brand-orange glow in the background to echo the FeastPot palette */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-3xl"
      />

      <Card className="relative w-full max-w-md border-emerald-100/60 shadow-2xl">
        <CardContent className="p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <Image
              src="/feastpot-logo.png"
              alt="FeastPot"
              width={56}
              height={56}
              className="h-14 w-14"
              priority
            />
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Admin console
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your FeastPot staff account.
            </p>
          </div>
          {children}
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            Internal use only · 2FA enforced after sign-in
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chrome / Safari aggressively autofill credential fields even with
  // autoComplete="off". Rendering the inputs as read-only on first paint
  // and unlocking them on focus is the reliable, cross-browser way to
  // keep an admin console from showing the previous user's credentials
  // on a shared workstation. autoComplete="off" + new-password also
  // tells password managers not to offer to fill.
  const [locked, setLocked] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SignInChrome>
      <form onSubmit={submit} className="space-y-4" autoComplete="off">
        {/* Honeypot fields - some browsers will autofill the first
            email/password pair they see; sacrificing hidden ones here
            keeps the real inputs clean. */}
        <input type="text" name="fakeusernameremembered" className="hidden" tabIndex={-1} aria-hidden />
        <input type="password" name="fakepasswordremembered" className="hidden" tabIndex={-1} aria-hidden />

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <div className="relative">
            <Mail
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setLocked(false)}
              readOnly={locked}
              autoComplete="off"
              name="admin-email"
              placeholder="you@feastpot.co.uk"
              required
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <div className="relative">
            <Lock
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setLocked(false)}
              readOnly={locked}
              autoComplete="new-password"
              name="admin-password"
              placeholder="Enter your password"
              required
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={busy}
          className="w-full bg-emerald-700 text-white hover:bg-emerald-800"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </SignInChrome>
  );
}
