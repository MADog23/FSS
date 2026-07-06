import { useState, useEffect } from 'react';
import { api } from '../api';

const TYPE_CONFIG = {
  safety:      { icon: '🛡', color: 'var(--color-text-danger)',  bg: 'var(--color-background-danger)',  border: 'var(--color-border-danger)',  label: 'Safety alert' },
  update:      { icon: '🚀', color: 'var(--color-text-info)',    bg: 'rgba(24,95,165,0.07)',             border: 'rgba(24,95,165,0.25)',         label: 'Update' },
  changelog:   { icon: '📋', color: 'var(--color-text-primary)', bg: 'var(--color-background-secondary)', border: 'var(--color-border-tertiary)', label: 'Changelog' },
  maintenance: { icon: '🔧', color: 'var(--color-text-warning)', bg: 'var(--color-background-warning)', border: 'var(--color-border-warning)',  label: 'Maintenance' },
  info:        { icon: 'ℹ',  color: 'var(--color-text-secondary)', bg: 'var(--color-background-secondary)', border: 'var(--color-border-tertiary)', label: 'Info' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id) => {
    await api.markNotificationRead(id).catch(() => {});
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const deleteNotif = async (id) => {
    await api.deleteNotification(id).catch(() => {});
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)', fontSize: 14 }}>
      Loading…
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 2px', letterSpacing: '-0.01em' }}>
            Notifications
            {unreadCount > 0 && (
              <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--color-text-danger)', color: '#fff', padding: '2px 7px', borderRadius: 10, fontWeight: 600, verticalAlign: 'middle' }}>
                {unreadCount}
              </span>
            )}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Safety alerts and app updates</div>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAll} disabled={markingAll} style={{ fontSize: 12, padding: '5px 12px' }}>
            {markingAll ? '…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 12,
          padding: '3rem 1rem',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
          No notifications yet. Safety alerts and app updates will appear here.
        </div>
      )}

      {/* Notification list */}
      {notifications.map(n => {
        const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
        const isUnread = !n.read_at;

        return (
          <div
            key={n.id}
            onClick={() => isUnread && markRead(n.id)}
            style={{
              background: 'var(--color-background-primary)',
              border: `0.5px solid ${isUnread ? cfg.border : 'var(--color-border-tertiary)'}`,
              borderRadius: 12,
              padding: '12px 14px',
              cursor: isUnread ? 'pointer' : 'default',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              transition: 'border-color 0.15s',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: cfg.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}>
              {cfg.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                <div style={{ fontWeight: isUnread ? 600 : 400, fontSize: 14, color: 'var(--color-text-primary)' }}>
                  {n.title}
                </div>
                {isUnread && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>
                {n.body}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 6,
                  background: cfg.bg,
                  color: cfg.color,
                  border: `0.5px solid ${cfg.border}`,
                }}>
                  {cfg.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {timeAgo(n.created_at)}
                </span>
                {isUnread && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>· tap to mark read</span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteNotif(n.id); }}
                  style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px', color: 'var(--color-text-muted)', borderColor: 'var(--color-border-tertiary)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
