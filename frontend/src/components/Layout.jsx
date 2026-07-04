import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◎', exact: true },
  { to: '/accounts', label: 'Accounts', icon: '🏦' },
  { to: '/income', label: 'Income', icon: '↑' },
  { to: '/bills', label: 'Bills', icon: '↓' },
  { to: '/cards', label: 'Cards', icon: '▦' },
  { to: '/scenario', label: 'What-if', icon: '⟳' },
  { to: '/household', label: 'Household', icon: '⚙' },
];

export default function Layout() {
  const { user, household, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11,
            color: 'var(--color-text-muted)',
            background: 'var(--color-background-secondary)',
            padding: '2px 8px',
            borderRadius: 8,
            border: '0.5px solid var(--color-border-tertiary)',
          }}>
            {user?.role}
          </span>
          <button onClick={handleLogout} style={{ fontSize: 12, padding: '4px 10px' }}>Sign out</button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: '14px 14px 80px', maxWidth: 520, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-background-primary)',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '6px 0 10px',
        zIndex: 10,
      }}>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              textDecoration: 'none',
              fontSize: 9,
              letterSpacing: '0.03em',
              color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontWeight: isActive ? 500 : 400,
              minWidth: 44,
            })}
          >
            <span style={{ fontSize: 17, lineHeight: 1 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
