'use client';

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
 * - Email is read-only — Supabase email changes require re-auth, which is
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

  // Hydrate form once when the API responds. We don't useEffect on every
  // `me` change so the user's in-progress edits aren't clobbered after
  // mutations succeed (which also updates the cache via setQueryData).
  useEffect(() => {
    if (!me) return;
    setFullName((current) => (current ? current : me.fullName ?? ''));
    setPhone((current) => (current ? current : me.phone ?? ''));
  }, [me]);

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
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-cream-deep bg-white p-5 shadow-sm" noValidate>
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
              To change your email, contact support — we have to re-verify it.
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
                Deleting your account removes your profile, addresses, and saved payment methods. Past order
                records are kept for tax and dispute reasons.
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
                  Type <code className="rounded bg-cream px-1 py-0.5 text-xs font-bold text-scotch">DELETE</code> to confirm.
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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
