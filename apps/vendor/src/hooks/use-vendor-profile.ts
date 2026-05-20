'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

/**
 * T005: vendor business-profile editor.
 *
 * Mirrors the columns the API serialises from the `Vendor` Prisma model
 * for /vendors/me. Only the editable fields are typed here; status,
 * payouts, commission etc. are intentionally excluded because they live
 * behind separate admin/compliance flows.
 */
export interface VendorProfile {
  id: string;
  userId: string;
  businessName: string;
  slug: string;
  description: string | null;
  cuisines: string[];
  status: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  specialities: string[];
  vendorStory: string | null;
  featuredDishes: string[];
  socialLinks: Record<string, string> | null;
}

export interface UpdateVendorProfileInput {
  businessName?: string;
  slug?: string;
  description?: string;
  cuisineTypes?: string[];
  logoUrl?: string;
  coverImageUrl?: string;
  specialities?: string[];
  vendorStory?: string;
  featuredDishes?: string[];
  socialLinks?: Record<string, string>;
}

const KEY = ['vendor', 'me', 'profile'] as const;

export function useVendorProfile() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY,
    enabled: !!token && !loading,
    queryFn: () => apiRequest<VendorProfile>('/vendors/me', { accessToken: token! }),
  });
}

export function useUpdateVendorProfile(vendorId: string | undefined) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVendorProfileInput) =>
      apiRequest<VendorProfile>(`/vendors/${vendorId}`, {
        method: 'PATCH',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  path: string;
  publicUrl: string;
}

/**
 * Multipart upload, mirroring the menu-item image hook. The server writes
 * the resulting URL back onto the vendor row, so the caller just needs to
 * invalidate the profile query.
 */
export function useUploadVendorImage(vendorId: string | undefined) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: 'logo' | 'cover'; file: File }): Promise<UploadedImage> => {
      if (!ALLOWED.has(file.type)) {
        throw new Error(`Unsupported image type ${file.type}; use JPEG/PNG/WebP`);
      }
      if (file.size > MAX_BYTES) {
        throw new Error('Image exceeds 5 MB');
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_URL}/v1/vendors/${vendorId}/images?kind=${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message ?? `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      return (await res.json()) as UploadedImage;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
