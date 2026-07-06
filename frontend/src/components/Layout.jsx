import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

// Primary nav — always visible on bottom bar, sized properly for mobile
const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', icon: '◎', exact: true },
  { to: '/bills', label: 'Bills', icon: '↓' },
  { to: '/income', label: 'Income', icon: '↑' },
  { to: '/accounts', label: 'Accounts', icon: '🏦' },
];

// Secondary nav — lives in the "More" drawer
const MORE_NAV = [
  { to: '/cards', label: 'Cards', icon: '▦' },
  { to: '/scenario', label: 'What-if', icon: '⟳' },
  { to: '/household', label: 'Household', icon: '⚙' },
  { to: '/help', label: 'Help', icon: '?' },
];

const ALL_MORE_PATHS = MORE_NAV.map(n => n.to);

export default function Layout() {
  const { user, household, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchCount = () =>
      api.getUnreadCount().then(d => setUnreadCount(d.count || 0)).catch(() => {});
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Highlight "More" button when a secondary page is active
  const moreIsActive = ALL_MORE_PATHS.includes(location.pathname);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--color-background-tertiary)' }}>

      {/* Top bar */}
      <header style={{
        background: 'var(--color-background-primary)',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15, letterSpacing: '-0.01em' }}>{household?.name || 'Household'}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>Financial safety</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 8, border: '0.5px solid var(--color-border-tertiary)' }}>
            {user?.role}
          </span>
          <Link to="/notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-muted)', fontSize: 15, textDecoration: 'none' }} title="Notifications">
            🔔
            {unreadCount > 0 && (
              <span style={{ position: 'absolute', top: -3, right: -3, background: 'var(--color-text-danger)', color: '#fff', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <Link to="/help" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', border: '0.5px solid var(--color-border-secondary)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 500, textDecoration: 'none', lineHeight: 1 }} title="Help & guide">?</Link>
          <button onClick={handleLogout} style={{ fontSize: 12, padding: '4px 10px' }}>Sign out</button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: '14px 14px 90px', maxWidth: 520, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          onClick={closeDrawer}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 19 }}
        />
      )}

      {/* More drawer — slides up from bottom */}
      <div style={{
        position: 'fixed',
        bottom: drawerOpen ? 70 : -200,
        left: 0,
        right: 0,
        zIndex: 20,
        transition: 'bottom 0.22s cubic-bezier(0.4,0,0.2,1)',
        maxWidth: 520,
        margin: '0 auto',
        padding: '0 12px',
      }}>
        <div style={{
          background: 'var(--color-background-primary)',
          borderRadius: 16,
          border: '0.5px solid var(--color-border-tertiary)',
          padding: '8px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 4,
          boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
        }}>
          {MORE_NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeDrawer}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                borderRadius: 10,
                textDecoration: 'none',
                background: isActive ? 'var(--color-background-secondary)' : 'transparent',
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontWeight: isActive ? 500 : 400,
                fontSize: 14,
                transition: 'background 0.1s',
              })}
            >
              <span style={{ fontSize: 20, width: 28, textAlign: 'center', lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Bottom nav bar — 4 primary + More button */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-background-primary)',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'stretch',
        padding: '0',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 21,
        height: 62,
      }}>
        {PRIMARY_NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              textDecoration: 'none',
              fontSize: 10,
              letterSpacing: '0.02em',
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontWeight: isActive ? 600 : 400,
              paddingTop: 8,
              paddingBottom: 6,
              borderTop: isActive ? '2px solid var(--color-text-primary)' : '2px solid transparent',
              transition: 'color 0.1s, border-color 0.1s',
            })}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            border: 'none',
            background: 'transparent',
            fontSize: 10,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            color: moreIsActive ? 'var(--color-text-primary)' : drawerOpen ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontWeight: moreIsActive || drawerOpen ? 600 : 400,
            paddingTop: 8,
            paddingBottom: 6,
            borderTop: moreIsActive || drawerOpen ? '2px solid var(--color-text-primary)' : '2px solid transparent',
            transition: 'color 0.1s, border-color 0.1s',
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', marginTop: 2 }}>
            {drawerOpen ? '✕' : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                <span style={{ display: 'block', width: 18, height: 2, background: 'currentColor', borderRadius: 1 }} />
                <span style={{ display: 'block', width: 18, height: 2, background: 'currentColor', borderRadius: 1 }} />
                <span style={{ display: 'block', width: 18, height: 2, background: 'currentColor', borderRadius: 1 }} />
              </span>
            )}
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
