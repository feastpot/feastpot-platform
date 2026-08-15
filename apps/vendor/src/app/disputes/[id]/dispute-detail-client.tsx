'use client';

import { cn } from '@feastpot/ui';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Lock, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  useDispute,
  useDisputeAppeal,
  useDisputeEvidence,
  useSubmitAppeal,
  useSubmitVendorResponse,
  useUploadEvidence,
  type DisputeAppeal,
  type DisputeDecision,
  type DisputeDetail,
  type DisputeEvidence,
  type EvidenceType,
} from '@/hooks/use-disputes';
import { ApiError } from '@/lib/api/client';
import { formatDateTime, formatPence } from '@/lib/format';

import {
  ISSUE_TYPE_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  isResponseLocked,
  lockNotice,
} from '../dispute-ui';

export function DisputeDetailClient({ disputeId }: { disputeId: string }) {
  const { data: dispute, isLoading, isError, error } = useDispute(disputeId);

  if (isLoading) {
    return (
      <div className="fp-card border border-border bg-white p-6 text-center text-sm text-mid">
        Loading dispute…
      </div>
    );
  }

  if (isError || !dispute) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="fp-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {notFound
            ? 'This dispute could not be found, or you do not have access to it.'
            : error instanceof ApiError
              ? error.message
              : 'Could not load this dispute. Please try again.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackLink />
      <DisputeHeader dispute={dispute} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="fp-card border border-border bg-white p-5">
            <h2 className="text-sm font-bold text-dark">Customer&apos;s issue</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-mid">{dispute.description}</p>
          </section>

          <EvidenceSection disputeId={disputeId} />

          <VendorResponseSection dispute={dispute} />
        </div>

        <aside className="space-y-5">
          <OrderSummary dispute={dispute} />
          {dispute.status === 'closed' && dispute.decision && <DecisionCard dispute={dispute} />}
          <EvidenceUpload disputeId={disputeId} />
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/disputes"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-mid transition-colors hover:text-dark"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to disputes
    </Link>
  );
}

function DisputeHeader({ dispute }: { dispute: DisputeDetail }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-dark">
          Order {dispute.order?.orderNumber ?? `#${dispute.orderId.slice(-6)}`}
        </h1>
        <p className="mt-1 text-sm text-mid">
          {ISSUE_TYPE_LABEL[dispute.issueType] ?? dispute.issueType} · Raised{' '}
          {formatDateTime(dispute.createdAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
            SEVERITY_BADGE[dispute.severity] ?? 'bg-surface text-mid',
          )}
        >
          {dispute.severity === 'high' && <AlertTriangle className="h-3 w-3" aria-hidden />}
          {SEVERITY_LABEL[dispute.severity] ?? dispute.severity} severity
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
            STATUS_BADGE[dispute.status] ?? 'bg-surface text-mid',
          )}
        >
          {STATUS_LABEL[dispute.status] ?? dispute.status}
        </span>
      </div>
    </header>
  );
}

function OrderSummary({ dispute }: { dispute: DisputeDetail }) {
  return (
    <section className="fp-card border border-border bg-white p-5">
      <h2 className="text-sm font-bold text-dark">Order</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-mid">Order #</dt>
          <dd className="font-semibold text-dark">{dispute.order?.orderNumber ?? '–'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-mid">Order total</dt>
          <dd className="font-semibold text-dark">{formatPence(dispute.order?.totalPence)}</dd>
        </div>
        {dispute.resolution && (
          <div className="flex justify-between gap-3">
            <dt className="text-mid">Resolution</dt>
            <dd className="font-semibold text-dark">{dispute.resolution}</dd>
          </div>
        )}
      </dl>
      <Link
        href={`/orders`}
        className="mt-4 inline-flex text-xs font-semibold text-teal transition-colors hover:text-teal-dark"
      >
        View orders →
      </Link>
    </section>
  );
}

function EvidenceSection({ disputeId }: { disputeId: string }) {
  const { data: evidence = [], isLoading } = useDisputeEvidence(disputeId);

  return (
    <section className="fp-card border border-border bg-white p-5">
      <h2 className="text-sm font-bold text-dark">Evidence</h2>
      {isLoading ? (
        <p className="mt-2 text-sm text-mid">Loading evidence…</p>
      ) : evidence.length === 0 ? (
        <p className="mt-2 text-sm text-mid">No evidence has been added to this dispute yet.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {evidence.map((e) => (
            <EvidenceItem key={e.id} evidence={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceItem({ evidence }: { evidence: DisputeEvidence }) {
  const isImage = evidence.type === 'photo' || evidence.type === 'screenshot';
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-surface">
      <a href={evidence.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, sizes unknown; a plain img avoids next/image remote-domain config.
          <img
            src={evidence.fileUrl}
            alt={evidence.caption ?? `${evidence.type} evidence`}
            className="h-28 w-full bg-white object-cover"
          />
        ) : (
          <div className="flex h-28 w-full flex-col items-center justify-center gap-1 bg-white text-mid">
            <FileText className="h-7 w-7" aria-hidden />
            <span className="text-[11px] font-medium">Document</span>
          </div>
        )}
      </a>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium capitalize text-dark">{evidence.type}</p>
        {evidence.caption && (
          <p className="truncate text-[11px] text-mid" title={evidence.caption}>
            {evidence.caption}
          </p>
        )}
      </div>
    </li>
  );
}

function VendorResponseSection({ dispute }: { dispute: DisputeDetail }) {
  const locked = isResponseLocked(dispute.status);
  const notice = lockNotice(dispute.status);
  const submit = useSubmitVendorResponse(dispute.id);

  const [response, setResponse] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitted(false);
    submit.mutate(response.trim(), {
      onSuccess: () => {
        setSubmitted(true);
        setResponse('');
      },
      onError: (err) => {
        setSubmitError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not submit your response. Please try again.',
        );
      },
    });
  };

  return (
    <section className="fp-card border border-border bg-white p-5">
      <h2 className="text-sm font-bold text-dark">Your response</h2>

      {dispute.vendorResponse && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mid">
            Submitted
            {dispute.vendorRespondedAt ? ` ${formatDateTime(dispute.vendorRespondedAt)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-dark">{dispute.vendorResponse}</p>
        </div>
      )}

      {notice && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{notice}</p>
        </div>
      )}

      {!locked && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label htmlFor="vendor-response" className="sr-only">
            Response to the customer
          </label>
          <textarea
            id="vendor-response"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={5}
            minLength={5}
            maxLength={4000}
            required
            placeholder="Explain what happened, what you've done, or how you'd like to resolve this. Responses must be at least 5 characters."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />

          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{submitError}</p>
            </div>
          )}

          {submitted && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>Your response has been submitted and the customer has been notified.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submit.isPending || response.trim().length < 5}
            className="inline-flex items-center justify-center rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submit.isPending ? 'Submitting…' : 'Submit response'}
          </button>
        </form>
      )}
    </section>
  );
}

const APPEAL_WINDOW_DAYS = 14;

const DECISION_LABELS: Record<DisputeDecision, string> = {
  UPHELD_CUSTOMER: 'Upheld in customer favour',
  UPHELD_VENDOR: 'Upheld in your favour',
  PARTIAL: 'Partial resolution',
};

const DECISION_TONE: Record<DisputeDecision, string> = {
  UPHELD_CUSTOMER: 'bg-red-50 border-red-200 text-red-800',
  UPHELD_VENDOR: 'bg-green-50 border-green-200 text-green-800',
  PARTIAL: 'bg-amber-50 border-amber-200 text-amber-800',
};

const OUTCOME_LABELS: Record<string, string> = {
  UPHELD: 'Upheld',
  OVERTURNED: 'Overturned',
  PARTIAL: 'Partial',
};

function DecisionCard({ dispute }: { dispute: DisputeDetail }) {
  const decision = dispute.decision as DisputeDecision;
  const tone = DECISION_TONE[decision] ?? 'bg-surface border-border text-dark';
  const decidedDate = dispute.decidedAt ? new Date(dispute.decidedAt) : null;
  const appealDeadline = decidedDate
    ? new Date(decidedDate.getTime() + APPEAL_WINDOW_DAYS * 86_400_000)
    : null;
  const appealOpen = appealDeadline ? new Date() <= appealDeadline : false;

  return (
    <section className={`fp-card border p-5 ${tone}`}>
      <h2 className="text-sm font-bold">Decision</h2>
      <p className="mt-1 text-base font-semibold">{DECISION_LABELS[decision]}</p>
      {dispute.resolutionNote && <p className="mt-2 text-sm">{dispute.resolutionNote}</p>}
      {appealDeadline && (
        <p className="mt-2 text-[11px] opacity-75">
          {appealOpen
            ? `Appeal by: ${appealDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Appeal window closed'}
        </p>
      )}
      {appealOpen && <AppealSection disputeId={dispute.id} decidedAt={dispute.decidedAt!} />}
    </section>
  );
}

function AppealSection({ disputeId, decidedAt }: { disputeId: string; decidedAt: string }) {
  const { data: appeal, isLoading } = useDisputeAppeal(disputeId);
  const submit = useSubmitAppeal(disputeId);
  const [grounds, setGrounds] = useState('');
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading) return null;

  // Appeal already submitted - show its status
  if (appeal) {
    return <AppealStatus appeal={appeal} />;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-current bg-white/60 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/80"
      >
        Appeal this decision
      </button>
    );
  }

  if (submitted) {
    return (
      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
        <CheckCircle2 className="mb-1 h-4 w-4" aria-hidden />
        Appeal submitted. You will be notified of the Stage 1 review outcome by email.
      </div>
    );
  }

  const appealDeadline = new Date(new Date(decidedAt).getTime() + APPEAL_WINDOW_DAYS * 86_400_000);

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-current bg-white/60 p-3">
      <p className="text-xs font-semibold">Submit appeal (clause 18.1)</p>
      <p className="text-[11px] opacity-75">
        Deadline:{' '}
        {appealDeadline.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        . State the specific facts you are challenging (min 50 characters).
      </p>
      <textarea
        value={grounds}
        onChange={(e) => setGrounds(e.target.value)}
        rows={4}
        minLength={50}
        maxLength={8000}
        placeholder="State the specific facts you are challenging and what outcome you are seeking..."
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-dark placeholder:text-mid focus:outline-none focus:ring-1 focus:ring-teal"
      />
      <p className="text-[10px] opacity-60">{grounds.length}/50 min chars</p>
      {submitError && <p className="text-xs text-red-700">{submitError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={submit.isPending || grounds.trim().length < 50}
          onClick={() => {
            setSubmitError(null);
            submit.mutate(grounds.trim(), {
              onSuccess: () => setSubmitted(true),
              onError: (err) =>
                setSubmitError(err instanceof Error ? err.message : 'Submit failed'),
            });
          }}
          className="flex-1 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {submit.isPending ? 'Submitting…' : 'Submit appeal'}
        </button>
      </div>
    </div>
  );
}

function AppealStatus({ appeal }: { appeal: DisputeAppeal }) {
  const isFinal = Boolean(appeal.stage2At);
  const finalOutcome = appeal.stage2Outcome;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white/80 p-3 text-xs space-y-2">
      <p className="font-semibold">
        Appeal submitted {new Date(appeal.submittedAt).toLocaleDateString('en-GB')}
      </p>

      {appeal.stage1At ? (
        <div>
          <p className="font-medium text-neutral-700">
            Stage 1:{' '}
            <span className="font-bold">
              {OUTCOME_LABELS[appeal.stage1Outcome ?? ''] ?? appeal.stage1Outcome}
            </span>
          </p>
          {appeal.stage1Reasons && (
            <p className="mt-0.5 text-neutral-600 line-clamp-2">{appeal.stage1Reasons}</p>
          )}
        </div>
      ) : (
        <p className="text-neutral-500">Stage 1 review pending...</p>
      )}

      {appeal.stage1At &&
        (appeal.stage2At ? (
          <div>
            <p className="font-medium text-neutral-700">
              Stage 2 (final):{' '}
              <span
                className={`font-bold ${finalOutcome === 'UPHELD' ? 'text-green-700' : finalOutcome === 'OVERTURNED' ? 'text-red-700' : 'text-amber-700'}`}
              >
                {OUTCOME_LABELS[finalOutcome ?? ''] ?? finalOutcome}
              </span>
            </p>
            {appeal.stage2Reasons && (
              <p className="mt-0.5 text-neutral-600 line-clamp-2">{appeal.stage2Reasons}</p>
            )}
            {finalOutcome === 'UPHELD' && (
              <p className="mt-1 text-green-700 font-medium">
                Payout credit applied to your next statement.
              </p>
            )}
          </div>
        ) : (
          <p className="text-neutral-500">Stage 2 review pending...</p>
        ))}

      {!isFinal && appeal.stage1At && (
        <p className="text-[10px] text-neutral-400">
          If you disagree with the Stage 1 outcome, contact{' '}
          <a href={`mailto:${PLATFORM_FACTS.contact.appealsEmail}`} className="underline">
            {PLATFORM_FACTS.contact.appealsEmail}
          </a>{' '}
          to request Stage 2 review.
        </p>
      )}
    </div>
  );
}

const EVIDENCE_TYPES: { value: EvidenceType; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'screenshot', label: 'Screenshot' },
  { value: 'document', label: 'Document' },
];

function EvidenceUpload({ disputeId }: { disputeId: string }) {
  const upload = useUploadEvidence(disputeId);
  const [type, setType] = useState<EvidenceType>('photo');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploaded(false);
    if (!file) {
      setUploadError('Choose a file to upload.');
      return;
    }
    upload.mutate(
      { file, type, caption: caption.trim() || undefined },
      {
        onSuccess: () => {
          setUploaded(true);
          setFile(null);
          setCaption('');
        },
        onError: (err) => {
          setUploadError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Upload failed. Please try again.',
          );
        },
      },
    );
  };

  return (
    <section className="fp-card border border-border bg-white p-5">
      <h2 className="text-sm font-bold text-dark">Add evidence</h2>
      <p className="mt-1 text-xs text-mid">
        Upload photos, screenshots or documents (max 10 MB). Photos and screenshots must be image
        files.
      </p>

      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <div>
          <label htmlFor="evidence-type" className="text-xs font-semibold text-dark">
            Type
          </label>
          <select
            id="evidence-type"
            value={type}
            onChange={(e) => setType(e.target.value as EvidenceType)}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-dark focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          >
            {EVIDENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="evidence-file" className="text-xs font-semibold text-dark">
            File
          </label>
          <input
            id="evidence-file"
            type="file"
            accept={type === 'document' ? undefined : 'image/*'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-mid file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-dark hover:file:bg-border"
          />
        </div>

        <div>
          <label htmlFor="evidence-caption" className="text-xs font-semibold text-dark">
            Caption (optional)
          </label>
          <input
            id="evidence-caption"
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            placeholder="e.g. Photo of the delivered order"
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-dark placeholder:text-mid focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          />
        </div>

        {uploadError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{uploadError}</p>
          </div>
        )}
        {uploaded && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>Evidence uploaded.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={upload.isPending || !file}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden />
          {upload.isPending ? 'Uploading…' : 'Upload evidence'}
        </button>
      </form>
    </section>
  );
}
