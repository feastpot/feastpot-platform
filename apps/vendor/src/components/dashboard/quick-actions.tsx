import Link from 'next/link';

/**
 * Three quick-action shortcuts shown directly under the stats grid on the
 * dashboard home.
 *
 * NOTE on "Add menu item": there is no `/menu/new` route — the vendor app's
 * item editor lives under `/menu/[menuId]/items/[itemId]` and a new item is
 * minted by visiting `/menu/[menuId]/items/new`. Without knowing the
 * vendor's preferred menu we route to `/menu` (the menu list) so the vendor
 * picks the menu first; the menu list page surfaces a "+ New item" CTA per
 * menu. Update this link to `/menu/{primaryMenuId}/items/new` if the API
 * starts returning a primary-menu id on `/vendors/me`.
 */
export function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ActionTile href="/menu" emoji="➕" label="Add menu item" />
      <ActionTile href="/orders" emoji="📋" label="View orders" />
      <ActionTile href="/analytics" emoji="📊" label="Analytics" />
    </div>
  );
}

function ActionTile({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-white p-3 text-center shadow-sm transition-colors hover:border-vendor/40 hover:bg-vendor-light"
    >
      <span className="text-xl leading-none" aria-hidden>{emoji}</span>
      <span className="text-xs font-semibold text-dark">{label}</span>
    </Link>
  );
}
