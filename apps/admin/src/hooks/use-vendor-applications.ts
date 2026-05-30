'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type VendorApplicationStatus =
  | 'pending'
  | 'under_review'
  | 'information_requested'
  | 'approved'
  | 'rejected';

interface ReviewerRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/** Row shape returned by GET /admin/vendor-applications (bare array). */
export interface VendorApplicationRow {
  id: string;
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  postcode: string;
  cuisineType: string;
  kitchenType: string;
  hasFsaRegistration: boolean;
  instagram: string | null;
  status: VendorApplicationStatus;
  reviewedAt: string | null;
  reviewedBy: ReviewerRef | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  vendor: { id: string; slug: string; status: string } | null;
  createdAt: string;
}

/** Full record returned by GET /admin/vendor-applications/:id. */
export interface VendorApplicationDetail {
  id: string;
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  postcode: string;
  cuisineType: string;
  kitchenType: string;
  hasFsaRegistration: boolean;
  foodStory: string;
  instagram: string | null;
  marketingConsent: boolean;
  status: VendorApplicationStatus;
  reviewedAt: string | null;
  reviewedById: string | null;
  adminNotes: string | null;
  rejectionReason: string | null;
  vendorId: string | null;
  acceptedTermsAt: string | null;
  acceptedTermsVersion: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedBy: ReviewerRef | null;
  vendor: { id: string; slug: string; status: string; businessName: string } | null;
}

/** Statuses an admin can transition an application TO via the PATCH endpoint. */
export type VendorApplicationAction =
  | 'under_review'
  | 'information_requested'
  | 'approved'
  | 'rejected';

export interface UpdateVendorApplicationBody {
  status: VendorApplicationAction;
  adminNotes?: string;
  rejectionReason?: string;
  sendInvite?: boolean;
}

/**
 * Application queue. Passing no status hits the backend default, which
 * returns the in-flight triage queue (pending / under_review /
 * information_requested) — mirrors the /admin/vendors "all" convention.
 */
export function useVendorApplications(status: VendorApplicationStatus | 'all') {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor-applications', status],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      const qs = params.toString();
      return request<VendorApplicationRow[]>(
        `/admin/vendor-applications${qs ? `?${qs}` : ''}`,
      );
    },
  });
}

export function useVendorApplication(id: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor-application', id],
    enabled: ready && Boolean(id),
    queryFn: () => request<VendorApplicationDetail>(`/admin/vendor-applications/${id}`),
  });
}

export function useUpdateVendorApplication(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateVendorApplicationBody) =>
      request<VendorApplicationDetail>(`/admin/vendor-applications/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vendor-applications'] });
      qc.invalidateQueries({ queryKey: ['admin', 'vendor-application', id] });
    },
  });
}

export function useResendVendorApplicationInvite(id: string) {
  const { request } = useApi();
  return useMutation({
    mutationFn: () =>
      request(`/admin/vendor-applications/${id}/resend-invite`, { method: 'POST' }),
  });
}
