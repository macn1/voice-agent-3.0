import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  AudioLines,
  Contact,
  Inbox,
  MessageCircle,
  Plug,
  ShieldCheck,
  Star,
  BarChart3,
  Blocks,
  BookOpen,
  CodeXml,
  CreditCard,
  FileText,
  Home,
  LibraryBig,
  Phone,
  PhoneIncoming,
  Send,
  Settings,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { AppShell, Sidebar, UserMenu } from '../../components/Shell';
import { NotificationsBell } from '../../components/NotificationsBell';
import { Badge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { number, titleCase } from '../../lib/format';
import { useBilling } from './billingContext';

const SECTIONS = [
  {
    items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      {
        to: '/build',
        label: 'Build',
        icon: Blocks,
        match: ['/company', '/tools'],
      },
      { to: '/agents', label: 'Agents', icon: UserRound },
      { to: '/workflows', label: 'Workflows', icon: Workflow },
      { to: '/knowledge', label: 'Knowledge base', icon: LibraryBig },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { to: '/numbers', label: 'Phone numbers', icon: Phone },
      { to: '/inbound', label: 'Inbound calls', icon: PhoneIncoming },
      { to: '/campaigns', label: 'Outbound campaigns', icon: Send },
      { to: '/contacts', label: 'Contacts', icon: Contact },
      { to: '/developers', label: 'Deploy with code', icon: CodeXml },
    ],
  },
  {
    label: 'Connect',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Plug },
      {
        to: '/channels/whatsapp',
        label: 'WhatsApp & SMS',
        icon: MessageCircle,
        match: ['/broadcasts'],
      },
      { to: '/inbox', label: 'Inbox', icon: Inbox },
    ],
  },
  {
    label: 'Monitor',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/calls', label: 'Call logs', icon: AudioLines },
      { to: '/review', label: 'Quality review', icon: Star },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/settings/team', label: 'Team', icon: Users, end: true },
      {
        to: '/settings/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        end: true,
      },
      {
        to: '/settings/plan',
        label: 'Billing',
        icon: CreditCard,
        match: ['/settings/usage', '/settings/invoices', '/settings/payment-methods', '/settings/credits'],
      },
    ],
  },
];

const FOOTER = [
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    match: [
      '/settings/profile',
      '/settings/do-not-call',
      '/settings/calling-rules',
      '/settings/privacy',
      '/settings/activity',
      '/settings/notifications',
      '/settings/pronunciations',
      '/settings/voices',
      '/settings/exports',
      '/settings/sub-accounts',
    ],
    end: true,
  },
  { to: '/docs', label: 'Documentation', icon: FileText },
];

function UsageMeter() {
  const { loaded, plan, usage, includedMinutes, minutesRatio, subscription } = useBilling();
  if (!loaded) return <span className="meter-pill skeleton" style={{ width: 150 }} />;
  if (!subscription && !plan) {
    return (
      <Link to="/settings/plan" className="meter-pill">
        Choose a plan
      </Link>
    );
  }
  const pct = Math.min(100, Math.round((minutesRatio ?? 0) * 100));
  const left = includedMinutes !== undefined && usage ? Math.max(0, includedMinutes - usage.callMinutes) : undefined;
  return (
    <Link to="/settings/usage" className={`meter-pill ${pct >= 80 ? 'warn' : ''}`} title={`${pct}% of included minutes used`}>
      {left !== undefined ? `${number(left)} min left` : `${plan?.name ?? 'Current'} plan`}
      <span className="track">
        <span className="fill" style={{ display: 'block', width: `${Math.max(4, 100 - pct)}%` }} />
      </span>
    </Link>
  );
}

function AccountBanners() {
  const { subscription, minutesRatio } = useBilling();
  const { pathname } = useLocation();
  if (subscription?.status === 'past_due') {
    return (
      <div className="banner danger">
        <AlertTriangle />
        <span className="grow">Your last payment failed. Update your payment method to keep your agents answering calls.</span>
        <Link to="/settings/payment-methods" className="btn sm danger">
          Fix payment
        </Link>
      </div>
    );
  }
  if (minutesRatio !== undefined && minutesRatio >= 0.8 && pathname !== '/settings/usage') {
    const over = minutesRatio >= 1;
    return (
      <div className={`banner ${over ? 'danger' : 'warn'}`}>
        <AlertTriangle />
        <span className="grow">
          {over
            ? "You've used all included call minutes this period. Extra minutes are billed at your plan's overage rate."
            : `You've used ${Math.round(minutesRatio * 100)}% of the call minutes included in your plan.`}
        </span>
        <Link to="/settings/plan" className="btn sm">
          Upgrade plan
        </Link>
      </div>
    );
  }
  return null;
}

function TenantBadge() {
  const { profile } = useAuth();
  const { subscription } = useBilling();
  const company = profile?.tenant?.name ?? profile?.tenant_name;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {company && <Badge plain>{company}</Badge>}
      {subscription && <Badge tone={subscription.status === 'active' ? 'green' : 'blue'}>{titleCase(subscription.status)}</Badge>}
    </div>
  );
}

export function CustomerLayout() {
  return (
    <>
      <AppShell
        sidebar={<Sidebar sections={SECTIONS} footer={FOOTER} />}
        topbarRight={
          <>
            <UsageMeter />
            <NotificationsBell />
            <UserMenu
              subtitle={<TenantBadge />}
              links={[
                { label: 'Profile', icon: UserRound, to: '/settings/profile' },
                { label: 'Team', icon: Users, to: '/settings/team' },
                { label: 'Billing', icon: CreditCard, to: '/settings/plan' },
                { label: 'Get started', icon: BookOpen, to: '/welcome' },
              ]}
            />
          </>
        }
      >
        <div className="main-inner">
          <AccountBanners />
          <Outlet />
        </div>
      </AppShell>
    </>
  );
}
