import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings } from 'lucide-react';
import { dateTime } from '../lib/format';
import { useListNotificationsQuery, useMarkNotificationReadMutation } from '../store/api/integrationApi';

/** P-42 Notifications panel (QTY-04.2). Polls every minute. */
export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Polls every minute; also refetches when the tab regains focus.
  const list = useListNotificationsQuery(undefined, { pollingInterval: 60_000, refetchOnFocus: true });
  const [markRead] = useMarkNotificationReadMutation();
  const items = list.data ?? null;
  const unavailable = !!list.error?.notAvailable;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  const openItem = async (n) => {
    if (!n.read_at) markRead(n.id); // optimistic update lives in the API slice
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Bell />
        {unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="menu">
          <div
            className="row between"
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--divider)',
            }}
          >
            <b>Notifications</b>
            <button
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              title="Notification settings"
              onClick={() => {
                setOpen(false);
                navigate('/settings/notifications');
              }}
            >
              <Settings size={16} />
            </button>
          </div>
          {unavailable ? (
            <p className="muted small" style={{ padding: 16 }}>
              Notifications aren't available yet.
            </p>
          ) : !items?.length ? (
            <p className="muted small" style={{ padding: 16 }}>
              You're all caught up.
            </p>
          ) : (
            items.map((n) => (
              <button key={n.id} className={`notif-item ${n.read_at ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <div style={{ fontWeight: n.read_at ? 400 : 600, fontSize: 14 }}>{n.title}</div>
                {n.body && <div className="muted small">{n.body}</div>}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {dateTime(n.created_at)}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
