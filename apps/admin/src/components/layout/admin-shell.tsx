'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@feastpot/ui';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Banknote,
  Bell,
  BookOpen,
  CalendarHeart,
  ChevronDown,
  ChevronUp,
  Command,
  CreditCard,
  Download,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Play,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApi } from '@/hooks/use-api';
import { useAdminWorkQueue } from '@/hooks/use-admin-work-queue';
import { useDownloadCsv } from '@/hooks/use-download-csv';

type StaffRole = 'admin' | 'support' | 'finance' | 'compliance';
interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: ReadonlyArray<StaffRole>;
  description?: string;
}
interface CommandResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
}
interface CommandSearchResponse {
  results: CommandResult[];
}
interface CommandAction {
  id: string;
  type: 'action';
  title: string;
  subtitle: string;
  href: '';
  run: () => void;
}
const G = (label: string, items: ReadonlyArray<NavItem>) => ({ label, items });
const NAV_GROUPS = [
  G('Today', [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }]),
  G('Operations', [
    { href: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'support', 'finance'] },
    { href: '/disputes', label: 'Disputes', icon: AlertTriangle, roles: ['admin', 'support'] },
    { href: '/chargebacks', label: 'Chargebacks', icon: CreditCard, roles: ['admin', 'finance'] },
    {
      href: '/catering',
      label: 'Catering',
      icon: CalendarHeart,
      roles: ['admin', 'support', 'finance'],
    },
  ]),
  G('Supply', [
    {
      href: '/supply-pipeline',
      label: 'Supply pipeline',
      icon: Store,
      roles: ['admin', 'compliance', 'support'],
    },
    { href: '/compliance', label: 'Compliance', icon: ShieldCheck, roles: ['admin', 'compliance'] },
    { href: '/menus/queue', label: 'Menu moderation', icon: UtensilsCrossed, roles: ['admin'] },
    { href: '/reviews/queue', label: 'Reviews', icon: MessageSquare, roles: ['admin'] },
  ]),
  G('Money', [
    { href: '/payouts', label: 'Payouts', icon: Banknote, roles: ['admin', 'finance'] },
    {
      href: '/commission-rates',
      label: 'Commission rates',
      icon: BarChart3,
      roles: ['admin', 'finance'],
    },
    { href: '/discount-codes', label: 'Discount Codes', icon: Tag, roles: ['admin', 'finance'] },
    {
      href: '/feastpass-health',
      label: 'FeastPass health',
      icon: BarChart3,
      roles: ['admin', 'finance'],
    },
  ]),
  G('Growth', [
    {
      href: '/analytics',
      label: 'Vendor acquisition',
      icon: BarChart3,
      roles: ['admin', 'finance', 'support'],
    },
    {
      href: '/attribution',
      label: 'Attribution',
      icon: BarChart3,
      roles: ['admin', 'finance', 'support'],
    },
    { href: '/coverage', label: 'Coverage waitlist', icon: MapPin, roles: ['admin', 'support'] },
    { href: '/push/compose', label: 'Push broadcast', icon: Bell, roles: ['admin'] },
  ]),
  G('Governance', [
    { href: '/legal', label: 'Legal ops', icon: Scale, roles: ['admin', 'compliance'] },
    { href: '/audit-log', label: 'Audit log', icon: Activity, roles: ['admin', 'compliance'] },
  ]),
  G('System', [
    { href: '/dead-letters', label: 'Dead letters', icon: AlertTriangle, roles: ['admin'] },
    { href: '/queues', label: 'Job queues', icon: Layers, roles: ['admin'] },
    { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
    {
      href: '/users',
      label: 'Users',
      icon: Users,
      roles: ['admin', 'support', 'finance', 'compliance'],
    },
    {
      href: '/user-guide',
      label: 'User guide',
      icon: BookOpen,
      roles: ['admin', 'support', 'finance', 'compliance'],
    },
  ]),
] as const;
function initialsFor(name: string, email: string) {
  const p = (name || email).trim().split(/\s+/);
  return ((p[0]?.[0] ?? 'S') + (p.at(-1)?.[0] ?? 'A')).toUpperCase();
}
export function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: StaffRole };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { request } = useApi();
  const { data: queue } = useAdminWorkQueue();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommandResult[]>([]);
  const [selectedResult, setSelectedResult] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const paletteButtonRef = useRef<HTMLButtonElement>(null);
  const searchRequestSequence = useRef(0);
  const downloadCsv = useDownloadCsv();
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((n) => !n.roles || n.roles.includes(user.role)),
      })).filter((g) => g.items.length),
    [user.role],
  );
  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem('feastpot.nav.collapsed') || '{}'));
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('feastpot.nav.collapsed', JSON.stringify(collapsed));
  }, [collapsed]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => searchRef.current?.focus(), 0);
    else paletteButtonRef.current?.focus();
  }, [paletteOpen]);
  const localResults = useMemo<CommandResult[]>(() => {
    if (!query.trim()) return [];
    const synonyms: Record<string, string[]> = {
      dashboard: ['home', 'overview', 'today'],
      orders: ['order', 'purchases'],
      vendors: ['vendor', 'merchants'],
      applications: ['application', 'onboarding', 'sla'],
      disputes: ['dispute', 'refund'],
      payouts: ['payout', 'money', 'finance'],
      compliance: ['documents', 'verification', 'food safety'],
      'audit log': ['audit', 'history', 'export'],
      'job queues': ['jobs', 'failed', 'background'],
    };
    const needle = query.toLowerCase();
    return groups
      .flatMap((group) => group.items)
      .filter((item) => {
        const terms = [item.label.toLowerCase(), ...(synonyms[item.label.toLowerCase()] || [])];
        return terms.some((term) => term.includes(needle) || needle.includes(term));
      })
      .map((item) => ({
        id: `page-${item.href}`,
        type: 'page',
        title: item.label,
        subtitle: 'Navigate',
        href: item.href,
      }));
  }, [groups, query]);
  const combinedResults = useMemo(() => {
    const seen = new Set<string>();
    return [...localResults, ...results].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [localResults, results]);
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setSelectedResult(0);
      return;
    }
    const requestSequence = ++searchRequestSequence.current;
    const timer = window.setTimeout(
      () =>
        void request<CommandSearchResponse>(
          `/admin/command-search?q=${encodeURIComponent(trimmedQuery)}`,
        )
          .then((response) => {
            if (requestSequence !== searchRequestSequence.current) return;
            setResults(response.results);
            setSelectedResult(0);
          })
          .catch(() => {
            if (requestSequence === searchRequestSequence.current) setResults([]);
          }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [query, request]);
  function isSafeHref(href: string) {
    return href.startsWith('/') && !href.startsWith('//');
  }
  function closePalette() {
    setPaletteOpen(false);
    setQuery('');
    setFeedback(null);
  }
  function navigateSelected() {
    if (selectedResult < actions.length) {
      actions[selectedResult]?.run();
      return;
    }
    const item = combinedResults[selectedResult - actions.length];
    if (item && isSafeHref(item.href)) {
      router.push(item.href);
      closePalette();
    }
  }
  async function runPayoutBatch() {
    if (!window.confirm('Run the payout batch now? This will process all eligible payouts.'))
      return;
    try {
      await request('/admin/payouts/run-batch', { method: 'POST' });
      setFeedback('Payout batch started successfully.');
    } catch (error) {
      setFeedback(`Payout batch failed: ${(error as Error).message}`);
    }
  }
  function runAuditExport() {
    void downloadCsv('/admin/audit-log.csv', 'audit-log');
    setFeedback('Audit export started.');
  }
  const actions: CommandAction[] = [
    ...(user.role === 'admin' || user.role === 'finance'
      ? [
          {
            id: 'action-payout',
            type: 'action' as const,
            title: 'Run payout batch',
            subtitle: 'Process eligible payouts',
            href: '' as const,
            run: runPayoutBatch,
          },
        ]
      : []),
    ...(user.role === 'admin' || user.role === 'compliance'
      ? [
          {
            id: 'action-audit',
            type: 'action' as const,
            title: 'Export audit log',
            subtitle: 'Download CSV',
            href: '' as const,
            run: runAuditExport,
          },
        ]
      : []),
  ];
  async function signOut() {
    await createClient().auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }
  const badgeFor = (href: string) => {
    const keys: Record<string, string[]> = {
      '/catering': ['catering'],
      '/supply-pipeline': ['applications', 'terms'],
      '/disputes': ['disputes'],
      '/chargebacks': ['chargebacks'],
      '/queues': ['jobs'],
      '/dead-letters': ['jobs'],
      '/payouts': ['payouts'],
      '/compliance': ['compliance'],
      '/menus/queue': ['menuModeration'],
    };
    const count = (keys[href] || []).reduce((sum, key) => sum + (queue?.counts?.[key] || 0), 0);
    return count > 0 ? count : null;
  };
  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside
        aria-label="Admin console navigation"
        className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card"
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <Link href="/" aria-label="Feastpot admin console">
            <Image
              src="/feastpot-logo.png"
              alt="Feastpot"
              width={140}
              height={40}
              priority
              className="h-9 w-auto object-contain"
            />
          </Link>
        </div>
        <div className="flex items-center justify-between px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Admin console{' '}
          <button
            ref={paletteButtonRef}
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
            className="rounded border border-border p-1"
          >
            <Command className="h-3 w-3" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label}>
              <button
                type="button"
                aria-expanded={!collapsed[group.label]}
                onClick={() => setCollapsed((s) => ({ ...s, [group.label]: !s[group.label] }))}
                className="flex w-full items-center justify-between px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60"
              >
                {group.label}
                {collapsed[group.label] ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
              {!collapsed[group.label] && (
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                    const Icon = item.icon;
                    const badge = badgeFor(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          title={item.description}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {badge !== null && (
                            <span
                              className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-primary-foreground/20' : 'bg-destructive/10 text-destructive'}`}
                            >
                              {badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal text-sm font-bold text-white">
              {initialsFor(user.name, user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.name || user.email}</div>
              <div className="truncate text-xs capitalize text-muted-foreground">{user.role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="mt-1 w-full justify-start gap-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
      </main>
      <Dialog open={paletteOpen} onOpenChange={(open) => !open && closePalette()}>
        <DialogContent
          className="max-w-xl"
          onKeyDown={(e) => {
            if (e.key === 'Escape') closePalette();
            if (e.key === 'ArrowDown' && actions.length + combinedResults.length) {
              e.preventDefault();
              setSelectedResult((i) => (i + 1) % (actions.length + combinedResults.length));
            }
            if (e.key === 'ArrowUp' && actions.length + combinedResults.length) {
              e.preventDefault();
              setSelectedResult(
                (i) =>
                  (i - 1 + actions.length + combinedResults.length) %
                  (actions.length + combinedResults.length),
              );
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              navigateSelected();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription className="sr-only">
              Search pages, records, and authorized operational actions.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={searchRef}
            aria-label="Search pages and records"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, orders, vendors, users…"
            className="w-full border-b border-border bg-transparent px-4 py-4 text-sm outline-none"
          />
          <div className="max-h-80 overflow-y-auto p-2">
            {!query &&
              groups
                .flatMap((g) => g.items)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closePalette}
                    className="block rounded px-3 py-2 text-sm hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                ))}
            {query && (
              <>
                {actions.map((action, index) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.run}
                    aria-current={index === selectedResult ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-muted ${index === selectedResult ? 'bg-muted' : ''}`}
                  >
                    <span>
                      {action.type === 'action' && action.id === 'action-payout' ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </span>
                    <span>
                      {action.title}
                      <span className="ml-2 text-xs text-muted-foreground">{action.subtitle}</span>
                    </span>
                  </button>
                ))}
                {combinedResults.map(
                  (r, index) =>
                    isSafeHref(r.href) && (
                      <Link
                        aria-current={
                          index + actions.length === selectedResult ? 'true' : undefined
                        }
                        key={`${r.type}-${r.id}`}
                        href={r.href}
                        onClick={closePalette}
                        className={`block rounded px-3 py-2 text-sm hover:bg-muted ${index + actions.length === selectedResult ? 'bg-muted' : ''}`}
                      >
                        {r.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.subtitle || r.type}
                        </span>
                      </Link>
                    ),
                )}
              </>
            )}
            {query && !combinedResults.length && !actions.length && (
              <p className="px-3 py-5 text-sm text-muted-foreground">
                No matching pages or records.
              </p>
            )}
            {feedback && (
              <p role="status" className="border-t border-border px-3 py-3 text-sm">
                {feedback}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
