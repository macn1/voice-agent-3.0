import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { Brand } from './Logo';

function SideNavItem({ item }) {
  const { pathname } = useLocation();
  const Icon = item.icon;
  const extra = item.match?.some((p) => pathname.startsWith(p)) ?? false;
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive || extra ? 'active' : ''}`}>
      <Icon />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar({ sections, footer, brandSub }) {
  const { can } = useAuth();
  const visible = (items) => items.filter((i) => !i.permission || can(i.permission));
  return (
    <aside className="sidebar">
      <Brand sub={brandSub} />
      <nav className="nav" aria-label="Main">
        {sections.map((s, i) => {
          const items = visible(s.items);
          if (!items.length) return null;
          return (
            <div key={s.label ?? i} className="nav">
              {s.label && <div className="nav-label">{s.label}</div>}
              {items.map((it) => (
                <SideNavItem key={it.to} item={it} />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot nav">
        {visible(footer).map((it) => (
          <SideNavItem key={it.to} item={it} />
        ))}
      </div>
    </aside>
  );
}

export function UserMenu({ links, subtitle }) {
  const { profile, logout, realm } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const name = profile?.name ?? 'Account';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-pill" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="avatar">{initials(name).slice(0, 1)}</span>
        <span className="name">{name.split(' ')[0]}</span>
        <ChevronDown size={16} strokeWidth={1.7} />
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown-head">
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div className="muted small">{profile?.email}</div>
            {subtitle && <div style={{ marginTop: 8 }}>{subtitle}</div>}
          </div>
          {links.map((l) => (
            <button
              key={l.to}
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(l.to);
              }}
            >
              <l.icon />
              {l.label}
            </button>
          ))}
          <button
            className="dropdown-item danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate(realm === 'admin' ? '/admin/login' : '/login', {
                replace: true,
              });
            }}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ sidebar, topbarRight, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      {sidebar}
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <div className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu />
          </button>
          {topbarRight}
        </div>
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <span className="spinner" style={{ width: 26, height: 26, color: '#111' }} />
    </div>
  );
}

/** Route guard by subject type (FND-01.5). */
export function RequireAuth({ loginPath, children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'signed-out') return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
