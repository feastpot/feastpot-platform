'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { API_URL } from '@/lib/env';
import { useAccessToken } from '@/lib/auth/use-access-token';

export const ALLERGENS = [
  ['celery', 'Celery'],
  ['cereals-containing-gluten', 'Cereals containing gluten'],
  ['crustaceans', 'Crustaceans'],
  ['eggs', 'Eggs'],
  ['fish', 'Fish'],
  ['lupin', 'Lupin'],
  ['milk', 'Milk'],
  ['molluscs', 'Molluscs'],
  ['mustard', 'Mustard'],
  ['nuts', 'Nuts'],
  ['peanuts', 'Peanuts'],
  ['sesame', 'Sesame seeds'],
  ['soya', 'Soya'],
  ['sulphur-dioxide', 'Sulphur dioxide and sulphites'],
] as const;

export type ImportItem = {
  id: string;
  name: string;
  description: string | null;
  pricePence: number | null;
  portionLabel: string | null;
  reviewFlags: string[];
  status: string;
  allergens: string[];
  allergensFreeFrom: boolean;
  allergenConfirmedAt: string | null;
  menuItemId: string | null;
};

export type MenuImport = {
  id: string;
  status: string;
  error?: string | null;
  message?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sourceFiles: Array<{ name?: string; type?: string; size?: number }> | string[];
  createdAt: string;
  updatedAt?: string;
  items: ImportItem[];
};

const key = (vendorId: string) => ['vendor', 'menu-imports', vendorId] as const;
const detailKey = (vendorId: string, importId: string) => [...key(vendorId), importId] as const;

export function useMenuImports(vendorId?: string) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: key(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    queryFn: () =>
      apiRequest<MenuImport[]>(`/vendors/${vendorId}/menu-imports`, { accessToken: token! }),
  });
}

export function useMenuImport(vendorId?: string, importId?: string) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: detailKey(vendorId ?? '', importId ?? ''),
    enabled: !!vendorId && !!importId && !!token && !loading,
    refetchInterval: (query) => {
      const status = (query.state.data as MenuImport | undefined)?.status;
      return status === 'processing' || status === 'extracting' || status === 'queued'
        ? 2500
        : false;
    },
    queryFn: () =>
      apiRequest<MenuImport>(`/vendors/${vendorId}/menu-imports/${importId}`, {
        accessToken: token!,
      }),
  });
}

export function useCreateMenuImport(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      if (files.length < 1 || files.length > 4) throw new Error('Choose between 1 and 4 files.');
      const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
      if (oversized) throw new Error(`${oversized.name} is larger than 10 MB.`);
      const body = new FormData();
      files.forEach((file) => body.append('files', file));
      const response = await fetch(`${API_URL}/v1/vendors/${vendorId}/menu-imports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? `Import failed (${response.status})`);
      }
      return (await response.json()) as MenuImport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(vendorId) }),
  });
}

function useMenuImportMutation<T>(
  vendorId: string,
  importId: string,
  path: string,
  method: 'PATCH' | 'POST' = 'POST',
) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: unknown) => {
      const itemId = (body as { itemId?: string } | undefined)?.itemId;
      const resolvedPath = path.replace(':itemId', itemId ?? '');
      const payload =
        body && typeof body === 'object' && itemId
          ? Object.fromEntries(
              Object.entries(body as Record<string, unknown>).filter(([key]) => key !== 'itemId'),
            )
          : body;
      return apiRequest<T>(`/vendors/${vendorId}/menu-imports/${importId}${resolvedPath}`, {
        method,
        accessToken: token!,
        body: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: detailKey(vendorId, importId) });
      qc.invalidateQueries({ queryKey: key(vendorId) });
      qc.invalidateQueries({ queryKey: ['vendor', 'menus', vendorId] });
      qc.invalidateQueries({ queryKey: ['vendor', 'menu-items', vendorId] });
    },
  });
}

export function useEditMenuImportItem(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem>(vendorId, importId, '/items/:itemId', 'PATCH');
}
export function useAddMenuImportItem(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem>(vendorId, importId, '/items');
}
export function useRejectMenuImportItem(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem>(vendorId, importId, '/items/:itemId/reject');
}
export function useConfirmMenuImportAllergens(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem>(vendorId, importId, '/items/:itemId/allergens');
}
export function useBulkConfirmMenuImportAllergens(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem[]>(vendorId, importId, '/allergens/bulk');
}
export function useCopyMenuImportAllergens(vendorId: string, importId: string) {
  return useMenuImportMutation<ImportItem>(vendorId, importId, '/items/:itemId/allergens/copy');
}
export function useApplyMenuImport(vendorId: string, importId: string) {
  return useMenuImportMutation<{ createdItemIds: string[] }>(vendorId, importId, '/apply');
}
