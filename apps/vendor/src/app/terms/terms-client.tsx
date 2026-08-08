'use client';

import { CheckCircle2, Clock, ExternalLink, FileText, History } from 'lucide-react';
import { useEffect, useState } from 'react';

import { KeyTermsSummary, RateCard } from '@feastpot/ui';
import type { RateRow } from '@feastpot/ui';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

interface TermsVersion {
  id: string;
  documentType: string;
  version: string;
  summary: string;
  publishedAt: string;
  effectiveAt: string;
  accepted: boolean;
}

interface HistoryEntry extends Omit<TermsVersion, 'accepted'> {
  acceptedAt: string | null;
}

interface TermsViewData {
  current: TermsVersion | null;
  pending: TermsVersion | null;
}

interface TermsClientProps {
  view: TermsViewData;
  history: HistoryEntry[];
}

export function TermsClient({ view, history }: TermsClientProps) {
  const { token } = useAccessToken();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  // Layer 2: commission rates (public endpoint, no token required).
  const [rates, setRates] = useState<RateRow[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  useEffect(() => {
    apiRequest<RateRow[]>('/terms/rate-schedule')
      .then(setRates)
      .catch(() => null)
      .finally(() => setRatesLoading(false));
  }, []);

  async function handleAccept(versionId: string) {
    if (!token) return;
    setAccepting(versionId);
    try {
      await apiRequest(`/terms/versions/${versionId}/accept`, {
        method: 'POST',
        accessToken: token,
      });
      setAccepted((prev) => new Set([...prev, versionId]));
    } catch {
      // No-op; user can retry
    } finally {
      setAccepting(null);
    }
  }

  const isPending = (v: TermsVersion) =>
    !v.accepted && !accepted.has(v.id) && new Date(v.effectiveAt) > new Date();

  return (
    <div className="space-y-8">
      {/* Layer 1 + Layer 2 -- legal resources always visible on the Legal tab */}
      <section aria-labelledby="legal-resources-heading">
        <h2
          id="legal-resources-heading"
          className="mb-4 text-base font-semibold text-dark"
        >
          Legal resources
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <KeyTermsSummary />
          <RateCard rates={rates} loading={ratesLoading} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <a
            href="https://feastpot.co.uk/legal/vendor-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-teal underline underline-offset-2 hover:opacity-80"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Full Vendor Terms (Layer 3)
          </a>
          <a
            href="https://feastpot.co.uk/legal/vendor-terms#annex-a"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-teal underline underline-offset-2 hover:opacity-80"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Rate Schedule (Annex A)
          </a>
        </div>
      </section>

      {/* Current version card */}
      {view.current && (
        <section aria-labelledby="current-terms-heading">
          <h2
            id="current-terms-heading"
            className="mb-4 flex items-center gap-2 text-base font-semibold text-dark"
          >
            <FileText className="h-5 w-5 text-teal" aria-hidden />
            Current terms
          </h2>
          <VersionCard
            version={view.current}
            isAccepted={view.current.accepted || accepted.has(view.current.id)}
            accepting={accepting === view.current.id}
            onAccept={handleAccept}
          />
        </section>
      )}

      {/* Pending (upcoming) version */}
      {view.pending && (
        <section aria-labelledby="pending-terms-heading">
          <h2
            id="pending-terms-heading"
            className="mb-4 flex items-center gap-2 text-base font-semibold text-dark"
          >
            <Clock className="h-5 w-5 text-amber-500" aria-hidden />
            Upcoming update
          </h2>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-1">
            <VersionCard
              version={view.pending}
              isAccepted={view.pending.accepted || accepted.has(view.pending.id)}
              isPending={isPending(view.pending)}
              accepting={accepting === view.pending.id}
              onAccept={handleAccept}
            />
          </div>
        </section>
      )}

      {/* Change history */}
      <section aria-labelledby="terms-history-heading">
        <h2
          id="terms-history-heading"
          className="mb-4 flex items-center gap-2 text-base font-semibold text-dark"
        >
          <History className="h-5 w-5 text-mid" aria-hidden />
          Change history
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-mid">No previous versions.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark">
                      Version {entry.version}
                    </p>
                    <p className="mt-0.5 text-xs text-mid">
                      Effective{' '}
                      {new Date(entry.effectiveAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="mt-2 text-sm text-dark/80">{entry.summary}</p>
                  </div>
                  {entry.acceptedAt && (
                    <span className="shrink-0 flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Accepted{' '}
                      {new Date(entry.acceptedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function VersionCard({
  version,
  isAccepted,
  isPending = false,
  accepting,
  onAccept,
}: {
  version: TermsVersion;
  isAccepted: boolean;
  isPending?: boolean;
  accepting: boolean;
  onAccept: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-dark">Version {version.version}</p>
            {isAccepted && (
              <span className="flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-0.5 text-xs font-medium text-teal-dark">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Accepted
              </span>
            )}
            {isPending && !isAccepted && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Pending acknowledgement
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-mid">
            Effective{' '}
            {new Date(version.effectiveAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          <p className="mt-3 text-sm text-dark/80">{version.summary}</p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <a
            href="https://feastpot.co.uk/legal/vendor-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-teal underline underline-offset-2 hover:text-teal-dark"
          >
            Read full terms
          </a>
          {isPending && !isAccepted && (
            <button
              type="button"
              disabled={accepting}
              onClick={() => onAccept(version.id)}
              className="rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:opacity-50"
            >
              {accepting ? 'Confirming...' : 'Acknowledge & accept'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
