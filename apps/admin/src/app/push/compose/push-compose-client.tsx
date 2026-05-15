'use client';

import { Button } from '@feastpot/ui';
import { Bell } from 'lucide-react';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { ApiError, useApi } from '@/hooks/use-api';

type Audience = 'all' | 'by_city' | 'by_cuisine';

interface BroadcastResult {
  audience: Audience;
  recipients: number;
  delivered: number;
  failed: number;
}

/**
 * Operator composer for one-shot web-push broadcasts. Mirrors the JSON the
 * service worker expects ({ title, body, url }) so the preview pane is a
 * faithful approximation of what the user will actually see on lockscreen.
 *
 * Hard guard: when audience='all' we make the operator type the literal
 * word "BROADCAST" before the Send button enables. This is the only push
 * that goes to *every* registered device and it cannot be undone.
 */
export function PushComposeClient() {
  const { request, ready } = useApi();

  const [audience, setAudience] = useState<Audience>('by_city');
  const [city, setCity] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audienceValid = useMemo(() => {
    if (audience === 'by_city') return city.trim().length >= 2;
    if (audience === 'by_cuisine') return cuisine.trim().length >= 2;
    return true;
  }, [audience, city, cuisine]);

  const allConfirmed = audience !== 'all' || confirmText === 'BROADCAST';

  const canSend =
    ready &&
    !submitting &&
    title.trim().length >= 3 &&
    body.trim().length >= 3 &&
    audienceValid &&
    allConfirmed;

  async function send() {
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { audience, title, body };
      if (url.trim()) payload.url = url.trim();
      if (audience === 'by_city') payload.city = city.trim();
      if (audience === 'by_cuisine') payload.cuisine = cuisine.trim();
      const res = await request<BroadcastResult>('/admin/push/broadcast', {
        method: 'POST',
        body: payload,
      });
      setResult(res);
      setConfirmText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Broadcast failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compose push broadcast"
        description="Send a one-shot web-push notification to a targeted audience."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-dark">Audience</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All subscribers</option>
              <option value="by_city">By city</option>
              <option value="by_cuisine">By cuisine</option>
            </select>
          </div>

          {audience === 'by_city' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-dark">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="London"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {audience === 'by_cuisine' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-dark">Cuisine</label>
              <input
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
                placeholder="Nigerian"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-dark">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Weekend slots opening soon"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-mid">{title.length}/80</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-dark">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={240}
              placeholder="Tap to browse this Saturday's available vendors near you."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-mid">{body.length}/240</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-dark">Click-through URL (optional)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://feastpot.co.uk/vendors"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {audience === 'all' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">This will notify every registered device.</p>
              <p className="mt-1">
                Type <code className="font-mono">BROADCAST</code> to enable the send button.
              </p>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="BROADCAST"
                className="mt-2 w-full rounded-md border border-amber-400 bg-white px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-teal/40 bg-teal/10 p-3 text-sm text-dark">
              Sent to <strong>{result.recipients}</strong> device
              {result.recipients === 1 ? '' : 's'} — delivered {result.delivered}, failed{' '}
              {result.failed}.
            </div>
          )}

          <div className="pt-2">
            <Button onClick={send} disabled={!canSend}>
              {submitting ? 'Sending…' : 'Send broadcast'}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-mid">Preview</p>
          <div className="rounded-2xl bg-zinc-900 p-4 text-white shadow-xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-vendor">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Feastpot · now</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {title || 'Notification title'}
                </p>
                <p className="mt-1 line-clamp-3 text-sm text-zinc-200">
                  {body || 'Notification body preview will appear here.'}
                </p>
                {url && <p className="mt-2 truncate text-xs text-zinc-400">{url}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
