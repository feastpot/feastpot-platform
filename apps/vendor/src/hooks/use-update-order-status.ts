'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui/toaster';
import { apiRequest, ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

import type { VendorOrder, VendorOrderStatus } from './use-vendor-orders';

export interface UpdateStatusInput {
  orderId: string;
  status: VendorOrderStatus;
  cancellationReason?: string;
  rejectionReason?: string;
  /** Vendor-supplied ETA (minutes) — only meaningful on dispatched. */
  etaMinutes?: number;
}

export function useUpdateOrderStatus() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateStatusInput): Promise<VendorOrder> => {
      if (!token) throw new ApiError(401, 'Not signed in');
      const { orderId, ...body } = input;
      return apiRequest<VendorOrder>(`/orders/${orderId}/status`, {
        method: 'PATCH',
        accessToken: token,
        body,
      });
    },
    onSuccess: (order) => {
      // Active and history queries both move when status changes.
      qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
      qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });
      toast({
        title: 'Order updated',
        description: `Order ${order.orderNumber} is now ${order.status}`,
      });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to update order';
      toast({ title: 'Update failed', description: message, variant: 'destructive' });
    },
  });
}
