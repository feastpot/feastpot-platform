'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { useToast } from '@/components/ui/toaster';
import {
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
  useVendorMembers,
  type VendorMemberRole,
} from '@/hooks/use-vendor-members';

const ROLE_LABEL: Record<VendorMemberRole, string> = {
  owner: 'Owner',
  kitchen_manager: 'Kitchen manager',
  finance: 'Finance',
  staff: 'Staff',
  delivery_coordinator: 'Delivery coordinator',
};

const INVITABLE_ROLES: VendorMemberRole[] = [
  'kitchen_manager',
  'finance',
  'staff',
  'delivery_coordinator',
];

const ROLE_BLURB: Record<VendorMemberRole, string> = {
  owner: 'Full access. The original signup.',
  kitchen_manager: 'Menu, availability and orders. No payouts or team.',
  finance: 'Payouts, analytics and business profile. No menu or orders.',
  staff: 'Orders only. Read and progress, no edits to menu or money.',
  delivery_coordinator: 'Orders and availability. Focused on dispatch.',
};

export function TeamClient() {
  const { data, isLoading, error } = useVendorMembers();
  const invite = useInviteMember();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<VendorMemberRole>('staff');

  const isOwner = data?.callerRole === 'owner';

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await invite.mutateAsync({ email: email.trim(), role });
      toast({ title: 'Invite sent', description: `${email} can sign in to accept.` });
      setEmail('');
    } catch (err) {
      toast({
        title: 'Could not send invite',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">
          Invite people to help run the business. Roles control which sections of the vendor portal they can use.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading team…</p>}
      {error && <p className="text-sm text-destructive">Could not load team.</p>}

      {isOwner && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={onInvite} className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
              <div>
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="invite-email">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  placeholder="teammate@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as VendorMemberRole)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" className="gap-1 bg-vendor hover:bg-vendor-dark" disabled={invite.isPending}>
                  <UserPlus className="h-4 w-4" />
                  {invite.isPending ? 'Inviting…' : 'Invite'}
                </Button>
              </div>
              <p className="sm:col-span-3 text-xs text-muted-foreground">{ROLE_BLURB[role]}</p>
            </form>
          </CardContent>
        </Card>
      )}

      {data && (
        <ul className="space-y-2">
          {data.members.map((m) => {
            const isPending = m.status === 'pending';
            return (
              <li key={m.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {[m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') ||
                          m.invitedEmail}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.user?.email ?? m.invitedEmail}
                        {isPending && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            PENDING
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.isOwner ? (
                        <span className="rounded-full bg-vendor-light px-3 py-1 text-xs font-semibold text-vendor-dark">
                          {ROLE_LABEL.owner}
                        </span>
                      ) : isOwner ? (
                        <select
                          aria-label={`Role for ${m.invitedEmail}`}
                          value={m.role}
                          onChange={(e) =>
                            updateRole.mutate({
                              id: m.id,
                              role: e.target.value as VendorMemberRole,
                            })
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {INVITABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {ROLE_LABEL[m.role]}
                        </span>
                      )}
                      {isOwner && !m.isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${m.invitedEmail} from the team?`)) {
                              removeMember.mutate(m.id);
                            }
                          }}
                          disabled={removeMember.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
