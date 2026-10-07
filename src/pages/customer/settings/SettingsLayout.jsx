import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Ban,
  Bell,
  Building,
  Clock,
  CreditCard,
  Download,
  FileText,
  Gauge,
  Lock,
  Mic2,
  Package,
  ShieldCheck,
  SpellCheck2,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui';

// Every page is listed for everyone: when a role lacks a permission the API
// answers 403 and the page explains it, instead of the link silently vanishing.
const GROUPS = [
  {
    label: 'Account',
    items: [
      { to: '/settings/profile', label: 'Profile', icon: UserRound },
      { to: '/settings/team', label: 'Team', icon: Users },
      {
        to: '/settings/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
      },
    ],
  },
  {
    label: 'Billing',
    items: [
      { to: '/settings/plan', label: 'Plan', icon: Package },
      { to: '/settings/usage', label: 'Usage', icon: Gauge },
      { to: '/settings/invoices', label: 'Invoices', icon: FileText },
      {
        to: '/settings/payment-methods',
        label: 'Payment methods',
        icon: CreditCard,
      },
      { to: '/settings/credits', label: 'Credits', icon: Wallet },
    ],
  },
  {
    label: 'Calling & compliance',
    items: [
      { to: '/settings/do-not-call', label: 'Do-not-call list', icon: Ban },
      { to: '/settings/calling-rules', label: 'Calling rules', icon: Clock },
      { to: '/settings/privacy', label: 'Privacy', icon: Lock },
      { to: '/settings/activity', label: 'Activity log', icon: Activity },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { to: '/settings/notifications', label: 'Notifications', icon: Bell },
      {
        to: '/settings/pronunciations',
        label: 'Pronunciations',
        icon: SpellCheck2,
      },
      { to: '/settings/voices', label: 'Custom voices', icon: Mic2 },
      { to: '/settings/exports', label: 'Exports & reports', icon: Download },
      { to: '/settings/sub-accounts', label: 'Sub-accounts', icon: Building },
    ],
  },
];

export function SettingsLayout() {
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, team and roles, billing, compliance and workspace preferences." />
      <div className="section-grid">
        <nav className="subnav" aria-label="Settings">
          {GROUPS.map((g) => (
            <div key={g.label} style={{ display: 'contents' }}>
              <div className="group">{g.label}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <it.icon />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </>
  );
}
