'use client';

import Image from 'next/image';

export interface AvatarProps {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Round avatar with graceful fallback to a coloured circle + first letter
 * of the user's name (or `?` if we don't even have that). We deliberately
 * don't use `next/image` for the fallback so server-rendered pages don't
 * need to round-trip an empty placeholder.
 */
export function Avatar({ url, name, size = 96, className }: AvatarProps) {
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '?';

  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? 'Profile photo'}
        width={size}
        height={size}
        unoptimized
        className={`rounded-full object-cover ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex select-none items-center justify-center rounded-full bg-muted text-muted-foreground ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      <span className="font-semibold">{initial}</span>
    </div>
  );
}
