'use client';

import { useState, type ComponentProps } from 'react';

/** Plain-image equivalent for existing cards that do not use Next Image. */
export function SafePhoto({ src, alt, onError, ...props }: ComponentProps<'img'>) {
  const [failedSource, setFailedSource] = useState<string | undefined>();
  if (!src || failedSource === src) {
    return (
      <span
        role="img"
        aria-label={`${alt || 'Photo'} unavailable`}
        className={props.className}
        style={{
          ...props.style,
          width: props.width ?? props.style?.width,
          height: props.height ?? props.style?.height,
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
    <img
      {...props}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailedSource(src);
        onError?.(event);
      }}
    />
  );
}
