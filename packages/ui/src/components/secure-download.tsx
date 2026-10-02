'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function SecureImage({
  url,
  token,
  alt,
  className,
}: {
  url: string;
  token: string | null;
  alt: string;
  className?: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    setSource(null);
    if (!token) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Private image unavailable');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSource(null);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);
  if (!source)
    return (
      <span role="img" aria-label={`${alt}: image unavailable`} className={className}>
        Image unavailable
      </span>
    );
  return <img src={source} alt={alt} className={className} onError={() => setSource(null)} />;
}

/** Fetch private files with a session header, never a shareable signed URL. */
export function SecureDownload({
  url,
  token,
  filename,
  children,
  className,
}: {
  url: string;
  token: string | null;
  filename?: string;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setError('');
    if (!token) {
      setError('Sign in again to download this file.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'You cannot access this file.'
            : 'Could not download this file.',
        );
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename ?? 'document';
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Download failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className={className} onClick={() => void download()} disabled={busy}>
        {busy ? 'Downloading...' : children}
      </button>
      {error && (
        <span role="alert" className="block text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
