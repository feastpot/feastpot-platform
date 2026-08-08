import { VendorPortalLayout, type VendorPortalLayoutProps } from '@feastpot/ui';
import type { ReactNode } from 'react';

import { SideNav } from './side-nav';
import { TopNav } from './top-nav';

interface PortalShellProps {
  businessName: string;
  children: ReactNode;
  maxWidth?: VendorPortalLayoutProps['maxWidth'];
}

/**
 * Thin vendor-app wrapper around VendorPortalLayout.
 * Wires in the vendor-specific SideNav and TopNav so every server page
 * only needs one import instead of three.
 *
 * Usage:
 *   <PortalShell businessName={vendor.businessName}>
 *     <PageHeader ... />
 *     <ClientComponent />
 *   </PortalShell>
 */
export function PortalShell({ businessName, children, maxWidth }: PortalShellProps) {
  return (
    <VendorPortalLayout
      topNav={<TopNav businessName={businessName} />}
      sideNav={<SideNav businessName={businessName} />}
      maxWidth={maxWidth}
    >
      {children}
    </VendorPortalLayout>
  );
}
