'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { Check, Clock, ExternalLink, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { useCreateStripeConnectLink } from '@/hooks/use-stripe-connect';
import {
  useUploadDocument,
  useVendorDocuments,
  type VendorDocumentType,
} from '@/hooks/use-vendor-documents';
import { formatDate } from '@/lib/format';

interface VendorSummary {
  id: string;
  businessName: string;
  status: string;
  description: string | null;
  cuisines: string[];
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
}

const REQUIRED_DOCS: Array<{ type: VendorDocumentType; label: string; description: string }> = [
  { type: 'hygiene_cert', label: 'Food hygiene certificate', description: 'Level 2 or above, in date.' },
  { type: 'insurance', label: 'Public liability insurance', description: 'Minimum £5m cover.' },
  { type: 'photo_id', label: 'Photo ID', description: 'Passport or driving license of the registered owner.' },
];

export function OnboardingClient({ vendor }: { vendor: VendorSummary }) {
  const search = useSearchParams();
  const stripeReturned = search?.get('stripe') === 'return';
  const docs = useVendorDocuments(vendor.id);
  const upload = useUploadDocument(vendor.id);
  const stripe = useCreateStripeConnectLink();
  const { toast } = useToast();

  const docByType = new Map(docs.data?.map((d) => [d.type, d]) ?? []);
  const allDocsUploaded = REQUIRED_DOCS.every((d) => docByType.has(d.type));
  const stripeReady = !!vendor.stripeAccountId && vendor.payoutsEnabled;
  const canGoLive = allDocsUploaded && stripeReady;

  const profileDone = !!vendor.description && vendor.cuisines.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Welcome to Feastpot, {vendor.businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Finish these four steps and our compliance team will approve you to start taking orders.
          Status:{' '}
          <Badge variant={vendor.status === 'live' ? 'default' : 'secondary'}>{vendor.status}</Badge>
        </p>
        {stripeReturned && (
          <Card className="mt-3 border-teal/40 bg-teal/5">
            <CardContent className="p-3 text-sm">
              You&apos;re back from Stripe — give it a moment to update, then refresh this page.
            </CardContent>
          </Card>
        )}
      </header>

      <Step
        n={1}
        title="Business details"
        done={profileDone}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {profileDone
                ? 'Looks good — your description and cuisines are set.'
                : 'Add a short description and at least one cuisine type from your profile.'}
            </p>
            <Link href="/settings/delivery" className="mt-2 inline-block">
              <Button variant="outline" size="sm">Open delivery settings</Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Profile editing UI is on the roadmap — for now this lives in the admin app.
            </p>
          </>
        }
      />

      <Step
        n={2}
        title="Compliance documents"
        done={allDocsUploaded}
        body={
          <div className="space-y-2">
            {REQUIRED_DOCS.map((d) => {
              const doc = docByType.get(d.type);
              return (
                <DocumentRow
                  key={d.type}
                  label={d.label}
                  description={d.description}
                  state={
                    doc
                      ? {
                          status: doc.status,
                          fileName: doc.fileName ?? '(file)',
                          expiresAt: doc.expiresAt,
                        }
                      : null
                  }
                  uploading={upload.isPending}
                  onPick={(file, expiresAt) => {
                    upload.mutate(
                      { file, type: d.type, expiresAt },
                      {
                        onSuccess: () => toast({ title: `${d.label} uploaded` }),
                        onError: (err) =>
                          toast({
                            title: 'Upload failed',
                            description: err instanceof Error ? err.message : '',
                            variant: 'destructive',
                          }),
                      },
                    );
                  }}
                />
              );
            })}
          </div>
        }
      />

      <Step
        n={3}
        title="Set up payouts (Stripe)"
        done={stripeReady}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {stripeReady
                ? 'Your Stripe account is connected and ready for payouts.'
                : 'Stripe will collect your bank details, ID, and tax info. The window opens in a new tab.'}
            </p>
            <Button
              className="mt-3 gap-2"
              variant={stripeReady ? 'outline' : 'default'}
              disabled={stripe.isPending}
              onClick={() =>
                stripe.mutate(undefined, {
                  onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
                  onError: (err) =>
                    toast({
                      title: 'Could not open Stripe',
                      description: err instanceof Error ? err.message : '',
                      variant: 'destructive',
                    }),
                })
              }
            >
              <ExternalLink className="h-4 w-4" />
              {stripe.isPending
                ? 'Opening…'
                : stripeReady
                  ? 'Update Stripe details'
                  : 'Connect with Stripe'}
            </Button>
          </>
        }
      />

      <Step
        n={4}
        title="Add your first menu items"
        done={false}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              You need at least 3 items live before compliance can approve you. The full editor
              is in the menu section.
            </p>
            <Link href="/menu" className="mt-2 inline-block">
              <Button variant="outline" size="sm" className="gap-2"><Upload className="h-4 w-4" /> Open menu builder</Button>
            </Link>
          </>
        }
      />

      {canGoLive && (
        <Card className="border-teal/40 bg-teal/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Check className="mt-0.5 h-4 w-4 text-teal" />
            <div>
              <p className="font-medium">All set!</p>
              <p className="text-muted-foreground">
                Compliance will review your documents and approve you within 1–2 business days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  done,
  body,
}: {
  n: number;
  title: string;
  done: boolean;
  body: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${done ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'}`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : n}
          </span>
          <h2 className="font-medium">{title}</h2>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  label,
  description,
  state,
  uploading,
  onPick,
}: {
  label: string;
  description: string;
  state: { status: string; fileName: string; expiresAt: string | null } | null;
  uploading: boolean;
  onPick: (file: File, expiresAt?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expiresAt, setExpiresAt] = useState('');

  return (
    <div className="rounded-md border border-input p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {state ? (
          <Badge variant={state.status === 'verified' ? 'default' : 'secondary'} className="capitalize">
            {state.status === 'pending' && <Clock className="mr-1 h-3 w-3" />}
            {state.status}
          </Badge>
        ) : (
          <Badge variant="secondary">Missing</Badge>
        )}
      </div>
      {state && (
        <p className="mt-1 text-xs text-muted-foreground">
          {state.fileName} · {state.expiresAt ? `expires ${formatDate(state.expiresAt)}` : 'no expiry set'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Expires (optional)</Label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <Upload className="h-3.5 w-3.5" />
          {state ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f, expiresAt ? new Date(expiresAt).toISOString() : undefined);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
