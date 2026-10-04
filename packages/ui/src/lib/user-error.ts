import { PUBLIC_ERROR_MESSAGES } from './public-error-messages';

export type IncidentReporter = (payload: {
  message: string;
  detail?: string;
  route: string;
}) => Promise<string | null>;

export const DEFAULT_ERROR_MESSAGE = 'We could not complete this request. Please try again.';
const PERSISTED_REF = /^FP-[A-F0-9]{4}-[A-F0-9]{4}$/;

/** Only a successfully acknowledged incident can supply a support reference. */
export function createUserErrorMapper(report: IncidentReporter) {
  const incidents = new WeakMap<object, Promise<string | null>>();
  async function userErrorMessage(
    error: unknown,
    message = DEFAULT_ERROR_MESSAGE,
  ): Promise<string> {
    const code = (error as { code?: unknown } | null)?.code;
    const publicMessage =
      typeof code === 'string' && Object.hasOwn(PUBLIC_ERROR_MESSAGES, code)
        ? PUBLIC_ERROR_MESSAGES[code]
        : message;
    let incident = error !== null && typeof error === 'object' ? incidents.get(error) : undefined;
    if (!incident) {
      const source = error as {
        message?: unknown;
        stack?: unknown;
        code?: unknown;
        body?: unknown;
        details?: unknown;
        data?: unknown;
      } | null;
      const seen = new WeakSet<object>();
      const detail = JSON.stringify(
        {
          message: String(source?.message ?? error),
          stack: typeof source?.stack === 'string' ? source.stack : undefined,
          code: source?.code,
          provider: source?.body ?? source?.details ?? source?.data ?? source,
        },
        (_key, value: unknown) => {
          if (typeof value === 'bigint') return String(value);
          if (value && typeof value === 'object') {
            if (seen.has(value)) return '[circular]';
            seen.add(value);
          }
          return value;
        },
      );
      incident = Promise.resolve()
        .then(() =>
          report({
            message: String(source?.message ?? error).slice(0, 2000),
            detail: detail.slice(0, 20000),
            route: typeof window === 'undefined' ? '/' : window.location.pathname,
          }),
        )
        .catch(() => null);
      if (error !== null && typeof error === 'object') incidents.set(error, incident);
    }
    const ref = await incident;
    return `${publicMessage} ${ref && PERSISTED_REF.test(ref) ? `Ref: ${ref}` : 'Support reference unavailable. Please contact support.'}`;
  }
  // Called only by HTTP wrappers after our API acknowledges its own persisted
  // incident. Reusing it preserves the original provider log/reference pair.
  userErrorMessage.acknowledge = (error: object, ref: unknown) => {
    if (typeof ref === 'string' && PERSISTED_REF.test(ref)) {
      incidents.set(error, Promise.resolve(ref));
    }
  };
  userErrorMessage.acknowledgeResponse = (body: unknown) => {
    function visit(value: unknown) {
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      userErrorMessage.acknowledge(value, record.errorRef);
      Object.values(record).forEach(visit);
    }
    visit(body);
  };
  return userErrorMessage;
}
