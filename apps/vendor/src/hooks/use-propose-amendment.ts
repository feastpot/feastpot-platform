'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/components/ui/toaster';
import { apiRequest, ApiError } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface ProposeAmendmentInput {
  orderId: string;
  proposedChange: string;
  priceDeltaPence: number;
}

export function useProposeAmendment() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: ProposeAmendmentInput) => {
      if (!token) throw new ApiError(401, 'Not signed in');
      const { orderId, ...body } = input;
      return apiRequest(`/orders/${orderId}/amendment`, {
        method: 'POST',
        accessToken: token,
        body,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
      toast({ title: 'Change sent', description: 'Customer has 30 minutes to respond.' });
    },
    onError: (err) => {
      toast({
        title: 'Could not send change',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
}
