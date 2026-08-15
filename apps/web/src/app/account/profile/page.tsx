'use client';

import type { UserIdentity } from '@supabase/supabase-js';
import { Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/account/avatar';
import { PageShell } from '@/components/layout/page-shell';
import { useDeleteMe, useMe, useUpdateMe } from '@/hooks/use-me';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { createClient } from '@/lib/supabase/client';

const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const AVATAR_BUCKET = 'feastpot-media';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const inputCls =
  'w-full rounded-xl border border-cream-deep bg-white px-3 py-2.5 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/50 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-cream disabled:text-charcoal-mid';

/**
 * Customer profile editor.
 *
 * - Avatar uploads go directly to Supabase Storage via the browser client
 *   (RLS on the bucket gates writes to authenticated users + their own
 *   `avatars/{userId}/...` prefix). We then PATCH the resulting public URL
 *   into our own users table so the API stays the single source of truth.
 * - Email is read-only - Supabase email changes require re-auth, which is
 *   out of scope for this screen.
 * - Phone is validated against the same E.164 regex the API uses so failures
 *   surface client-side without a round-trip.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { data: me, isLoading } = useMe();
  const { token } = useAccessToken();
  const update = useUpdateMe();
  const del = useDeleteMe();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showDangerZone, setShowDangerZone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [identities, setIdentities] = useState<UserIdentity[]>([]);

  // Hydrate form once when the API responds. We don't useEffect on every
  // `me` change so the user's in-progress edits aren't clobbered after
  // mutations succeed (which also updates the cache via setQueryData).
  useEffect(() => {
    if (!me) return;
    setFullName((current) => (current ? current : (me.fullName ?? '')));
    setPhone((current) => (current ? current : (me.phone ?? '')));
  }, [me]);

  // Fetch linked auth identities once after mount.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUserIdentities().then(({ data }) => {
      if (data?.identities) setIdentities(data.identities);
    });
  }, []);

  // Auto-dismiss success toasts after 3 seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file || !me) return;

    setFormError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFormError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setFormError('Image must be 5 MB or smaller.');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewAvatar(localPreview);
    setAvatarUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'jpg';
      const path = `avatars/${me.id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      if (!publicUrl) throw new Error('Could not resolve uploaded image URL.');

      await update.mutateAsync({ avatarUrl: publicUrl });
      setToast('Profile photo updated');
    } catch (err) {
      setPreviewAvatar(null);
      setFormError(err instanceof Error ? err.message : 'Could not upload photo.');
    } finally {
      setAvatarUploading(false);
      // Revoke after the update settles to avoid flashing the placeholder
      // while the new public URL hydrates the cached `me` row.
      setTimeout(() => URL.revokeObjectURL(localPreview), 4000);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setFormError('Full name must be at least 2 characters.');
      return;
    }
    const cleanPhone = phone.replace(/\s+/g, '');
    if (cleanPhone.length > 0 && !E164_PHONE_REGEX.test(cleanPhone)) {
      setFormError('Phone number must be in international format (e.g. +447700900000).');
      return;
    }

    try {
      await update.mutateAsync({
        fullName: trimmedName,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      });
      setToast('Profile updated');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save profile.');
    }
  };

  const onConfirmDelete = async () => {
    setDeleteError(null);
    try {
      await del.mutateAsync();
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/sign-in?deleted=1');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
    }
  };

  if (isLoading || !me || !token) {
    return (
      <PageShell>
        <p className="py-12 text-center text-sm text-charcoal-mid">Loading profile&hellip;</p>
      </PageShell>
    );
  }

  const displayedAvatar = previewAvatar ?? me.avatarUrl ?? null;

  return (
    <PageShell>
      <div className="space-y-6 py-4">
        <header>
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">Profile</h1>
          <p className="text-sm text-charcoal-mid">Update how vendors and Feastpot reach you.</p>
        </header>

        {/* Avatar */}
        <section className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onPickFile}
              className="group relative inline-flex"
              aria-label="Change profile photo"
            >
              <Avatar url={displayedAvatar} name={me.fullName ?? me.email} size={96} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                <Camera className="h-6 w-6" />
              </span>
              {avatarUploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-medium text-white">
                  Uploading…
                </span>
              )}
            </button>
            <div>
              <p className="font-bold text-charcoal">{me.fullName || me.email}</p>
              <p className="text-xs text-charcoal-mid">JPG / PNG / WebP, up to 5 MB.</p>
              <button
                type="button"
                onClick={onPickFile}
                className="mt-2 rounded-full border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-cream"
              >
                Choose photo
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={onFileChange}
              className="hidden"
            />
          </div>
        </section>

        {/* Profile form */}
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm"
          noValidate
        >
          <Field label="Full name" required>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              className={inputCls}
            />
          </Field>

          <Field label="Email">
            <input value={me.email} disabled className={inputCls} autoComplete="email" />
            <p className="mt-1 text-xs text-charcoal-mid">
              To change your email, contact support - we have to re-verify it.
            </p>
          </Field>

          <Field label="Phone number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7700 900000"
              autoComplete="tel"
              inputMode="tel"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-charcoal-mid">Used for order SMS notifications.</p>
          </Field>

          {formError && (
            <p className="rounded-xl border border-scotch/30 bg-scotch/10 p-3 text-sm font-medium text-scotch">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        {/* Linked accounts */}
        {identities.length > 0 && (
          <section className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-charcoal">Linked accounts</h2>
            <ul className="flex flex-wrap gap-2">
              {identities.map((id) => (
                <li
                  key={id.id}
                  className="flex items-center gap-1.5 rounded-full border border-cream-deep bg-cream px-3 py-1.5 text-xs font-semibold text-charcoal"
                >
                  {id.provider === 'google' && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                  )}
                  {id.provider === 'apple' && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-charcoal" aria-hidden>
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.55-1.31 3.07-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                  )}
                  {id.provider === 'email' && (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-charcoal-mid" aria-hidden>
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                  )}
                  <span className="capitalize">{id.provider}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Danger zone */}
        <section className="rounded-2xl border border-scotch/30 bg-scotch/5 p-5">
          <button
            type="button"
            onClick={() => setShowDangerZone((s) => !s)}
            className="flex w-full items-center justify-between text-left text-sm font-bold text-scotch"
            aria-expanded={showDangerZone}
          >
            Danger zone
            <span aria-hidden>{showDangerZone ? '−' : '+'}</span>
          </button>
          {showDangerZone && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-charcoal-mid">
                Deleting your account removes your profile, addresses, and saved payment methods.
                Past order records are kept for tax and dispute reasons.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  setDeleteText('');
                  setDeleteError(null);
                }}
                className="rounded-xl border border-scotch/40 bg-white px-4 py-2 text-xs font-bold text-scotch hover:bg-scotch/10"
              >
                Delete account
              </button>
            </div>
          )}
        </section>

        {/* Toast */}
        {toast && (
          <div
            role="status"
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-charcoal px-4 py-2 text-xs font-bold text-white shadow-lg"
          >
            {toast}
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
            onClick={() => setConfirmDelete(false)}
          >
            <div
              className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-black text-scotch">Delete account?</h2>
              <p className="text-sm text-charcoal-mid">
                This will permanently delete your account and all your data. This cannot be undone.
              </p>
              <label className="block text-sm">
                <span className="mb-1 block font-bold text-charcoal">
                  Type{' '}
                  <code className="rounded bg-cream px-1 py-0.5 text-xs font-bold text-scotch">
                    DELETE
                  </code>{' '}
                  to confirm.
                </span>
                <input
                  value={deleteText}
                  onChange={(e) => setDeleteText(e.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </label>
              {deleteError && (
                <p className="rounded-xl border border-scotch/30 bg-scotch/10 p-2 text-xs font-medium text-scotch">
                  {deleteError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-cream-deep px-4 py-2.5 text-sm font-bold text-charcoal hover:bg-cream"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteText !== 'DELETE' || del.isPending}
                  onClick={onConfirmDelete}
                  className="rounded-xl bg-scotch px-4 py-2.5 text-sm font-bold text-white hover:bg-scotch-dark disabled:opacity-50"
                >
                  {del.isPending ? 'Deleting…' : 'Delete account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-bold text-charcoal">
        {label}
        {required && <span className="ml-0.5 text-scotch">*</span>}
      </span>
      {children}
    </label>
  );
}
