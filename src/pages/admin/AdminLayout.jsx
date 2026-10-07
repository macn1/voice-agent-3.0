import { Outlet } from 'react-router-dom';
import { Activity, Building2, LayoutDashboard, LayoutTemplate, Package as PackageIcon, Phone, ShieldCheck, UserRound, Users } from 'lucide-react';
import { AppShell, Sidebar, UserMenu } from '../../components/Shell';
import { Badge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/normalize';

const SECTIONS = [
  {
    items: [
      { to: '/admin/overview', label: 'Overview', icon: LayoutDashboard },
      {
        to: '/admin/customers',
        label: 'Customers',
        icon: Building2,
        permission: 'customer.read',
      },
      { to: '/admin/packages', label: 'Plans', icon: PackageIcon },
    ],
  },
  {
    label: 'Telephony & agents',
    items: [
      { to: '/admin/numbers', label: 'Number pool', icon: Phone },
      {
        to: '/admin/templates',
        label: 'Agent templates',
        icon: LayoutTemplate,
      },
    ],
  },
  {
    label: 'Team',
    items: [
      {
        to: '/admin/staff',
        label: 'Staff',
        icon: Users,
        permission: 'staff.manage',
      },
      {
        to: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        permission: 'role.manage',
      },
    ],
  },
  {
    label: 'Monitor',
    items: [{ to: '/admin/audit', label: 'Audit log', icon: Activity }],
  },
];

const FOOTER = [{ to: '/admin/profile', label: 'My profile', icon: UserRound }];

function RoleBadges() {
  const { profile } = useAuth();
  if (!profile?.roles?.length) return <Badge tone="orange">Platform admin</Badge>;
  return (
    <div className="tag-list">
      {profile.roles.map((r) => (
        <Badge key={roleLabel(r)} tone="orange">
          {roleLabel(r)}
        </Badge>
      ))}
    </div>
  );
}

export function AdminLayout() {
  return (
    <AppShell
      sidebar={<Sidebar sections={SECTIONS} footer={FOOTER} brandSub="Console" />}
      topbarRight={
        <>
          <span className="meter-pill" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Platform console
          </span>
          <UserMenu subtitle={<RoleBadges />} links={[{ label: 'My profile', icon: UserRound, to: '/admin/profile' }]} />
        </>
      }
    >
      <div className="main-inner">
        <Outlet />
      </div>
    </AppShell>
  );
}
