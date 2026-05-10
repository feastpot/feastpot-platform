import { Button } from '@feastpot/ui';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Staff only</h1>
      <p className="max-w-md text-muted-foreground">
        This console is for Feastpot operations staff (admin, support, finance, compliance).
        If you believe you should have access, contact engineering.
      </p>
      <Link href="/sign-in">
        <Button variant="outline">Sign in with a different account</Button>
      </Link>
    </main>
  );
}
