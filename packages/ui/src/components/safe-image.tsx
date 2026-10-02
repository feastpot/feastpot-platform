'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';

/** Keep the image's layout slot when an object is absent or unreadable. */
export function SafeImage(props: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps['src'] | null>(null);
  if (!props.src || failedSource === props.src) {
    return (
      <span
        role="img"
        aria-label={`${props.alt || 'Photo'} unavailable`}
        className={props.className}
        style={{
          ...props.style,
          ...(props.fill
            ? { position: 'absolute', inset: 0 }
            : { width: props.width, height: props.height }),
          display: 'grid',
          placeItems: 'center',
          background: '#f1f5f4',
        }}
      >
        Photo unavailable
      </span>
    );
  }
  return (
    <Image
      {...props}
      onError={(event) => {
        setFailedSource(props.src);
        props.onError?.(event);
      }}
    />
  );
}
