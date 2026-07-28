'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Scan invoices' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="tabs">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} data-active={pathname === tab.href}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
