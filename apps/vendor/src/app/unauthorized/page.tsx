import { Button } from '@feastpot/ui';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">Vendors only</h1>
      <p className="max-w-md text-muted-foreground">
        This portal is for approved Feastpot vendors. If you think you should have
        access, contact our team.
      </p>
      <Link href="/sign-in">
        <Button variant="outline">Sign in with a different account</Button>
      </Link>
    </main>
  );
}
