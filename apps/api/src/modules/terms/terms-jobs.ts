/** Canonical job names accepted by the terms notices queue. */
export const TERMS_NOTICE_JOBS = {
  send_terms_notices: 'send_terms_notices',
  generate_acceptance_pdf: 'generate_acceptance_pdf',
  deemed_acceptance_sweep: 'deemed_acceptance_sweep',
  resend_single_notice: 'resend_single_notice',
} as const;

export type TermsNoticeJobName = (typeof TERMS_NOTICE_JOBS)[keyof typeof TERMS_NOTICE_JOBS];
export const TERMS_NOTICE_JOB_NAMES = Object.values(TERMS_NOTICE_JOBS);

export function assertTermsNoticeJobName(value: string): asserts value is TermsNoticeJobName {
  if (!TERMS_NOTICE_JOB_NAMES.includes(value as TermsNoticeJobName)) {
    throw new Error(`Unknown terms notice job "${value}". Refusing to enqueue it.`);
  }
}
