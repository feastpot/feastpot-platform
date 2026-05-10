'use client';

import { Card, CardContent } from '@feastpot/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { OrderCard } from '@/components/orders/order-card';
import { OrderHistoryTable } from '@/components/orders/order-history-table';
import { StatsBar } from '@/components/orders/stats-bar';
import { useToast } from '@/components/ui/toaster';
import { useActiveOrders } from '@/hooks/use-vendor-orders';
import { playOrderChime } from '@/lib/notify-beep';
import { createClient } from '@/lib/supabase/client';

interface Props {
  vendorId: string;
}

export function OrdersDashboard({ vendorId }: Props) {
  const { data: active, isLoading } = useActiveOrders();
  const qc = useQueryClient();
  const { toast } = useToast();
  // Track which order ids we've already chimed for so reconnects don't spam.
  const knownIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (active) {
      for (const o of active) knownIds.current.add(o.id);
    }
  }, [active]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('vendor-orders')
      .on(
        // Supabase Realtime postgres_changes payload is loosely typed in @supabase/supabase-js;
        // cast here keeps the rest of the call site strict.
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload: { new?: { id?: string; order_number?: string } }) => {
          const id = payload.new?.id;
          if (id && knownIds.current.has(id)) return;
          if (id) knownIds.current.add(id);
          playOrderChime();
          toast({
            title: 'New order received',
            description: payload.new?.order_number
              ? `Order ${payload.new.order_number}`
              : 'A new order just landed',
          });
          qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
          qc.invalidateQueries({ queryKey: ['vendor', 'stats'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [vendorId, qc, toast]);

  return (
    <div className="space-y-6">
      <StatsBar />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Active orders</h2>
          {isLoading && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent>
            </Card>
          )}
          {!isLoading && active && active.length === 0 && (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No active orders right now. New orders will appear here automatically.
              </CardContent>
            </Card>
          )}
          <div className="space-y-3">
            {active?.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">History</h2>
          <OrderHistoryTable />
        </section>
      </div>
    </div>
  );
}
