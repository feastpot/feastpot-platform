'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

export type VendorDocumentType =
  | 'hygiene_cert'
  | 'insurance'
  | 'photo_id'
  | 'bank_details'
  | 'kitchen_reg';

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface VendorDocument {
  id: string;
  vendorId: string;
  type: VendorDocumentType;
  status: DocumentStatus;
  fileUrl: string;
  fileName: string | null;
  expiresAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

const KEY = (vendorId: string) => ['vendor', 'documents', vendorId] as const;

export function useVendorDocuments(vendorId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    queryFn: () =>
      apiRequest<VendorDocument[]>(`/vendors/${vendorId}/documents`, { accessToken: token! }),
  });
}

const MAX = 5 * 1024 * 1024;

export function useUploadDocument(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; type: VendorDocumentType; expiresAt?: string }) => {
      if (input.file.size > MAX) throw new Error('File exceeds 5 MB');
      const fd = new FormData();
      fd.append('file', input.file);
      fd.append('type', input.type);
      if (input.expiresAt) fd.append('expiresAt', input.expiresAt);
      const res = await fetch(`${API_URL}/v1/vendors/${vendorId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Upload failed (${res.status})`);
      }
      return (await res.json()) as VendorDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(vendorId) }),
  });
}
