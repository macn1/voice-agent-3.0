import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Settings } from 'lucide-react';
import { dateTime } from '../lib/format';
import { useListNotificationsQuery, useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from '../store/api/integrationApi';

const isRead = (n) => n.read ?? !!n.read_at;

/** P-42 Notifications panel (QTY-04.2). Polls every minute. */
export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Polls every minute; also refetches when the tab regains focus.
  const list = useListNotificationsQuery(undefined, { pollingInterval: 60_000, refetchOnFocus: true });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead] = useMarkAllNotificationsReadMutation();
  const items = list.data?.items ?? null;
  const unavailable = !!list.error?.notAvailable;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = list.data?.unread_count ?? (items ?? []).filter((n) => !isRead(n)).length;

  const openItem = async (n) => {
    if (!isRead(n)) markRead(n.id); // optimistic update lives in the API slice
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
            {unread > 0 && (
              <button className="btn sm ghost" onClick={() => markAllRead()}>
                Mark all read
              </button>
            )}
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
              <button key={n.id} className={`notif-item ${isRead(n) ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <div className={`text-body-sm ${isRead(n) ? 'fw-regular' : 'fw-semibold'}`}>{n.title}</div>
                {n.body && <div className="muted small">{n.body}</div>}
                <div className="muted text-overline" style={{ marginTop: 4 }}>
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
