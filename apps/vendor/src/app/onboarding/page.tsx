import { Button } from '@feastpot/ui';
import Link from 'next/link';

export default function OnboardingPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Your vendor profile is being reviewed</h1>
      <p className="max-w-md text-muted-foreground">
        Our compliance team is checking your application. You&apos;ll get an email
        as soon as you&apos;re approved to start taking orders.
      </p>
      <Link href="/sign-in">
        <Button variant="outline">Back to sign in</Button>
      </Link>
    </main>
  );
}
