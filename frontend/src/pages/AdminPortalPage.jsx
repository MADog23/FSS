import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

// ── Styles ─────────────────────────────────────────────────────────────────
const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 };
const sectionLabel = { fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 };
const badge = (color) => ({ fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 500, background: color === 'danger' ? 'var(--color-background-danger)' : color === 'warning' ? 'var(--color-background-warning)' : color === 'success' ? 'var(--color-background-success)' : 'var(--color-background-secondary)', color: color === 'danger' ? 'var(--color-text-danger)' : color === 'warning' ? 'var(--color-text-warning)' : color === 'success' ? 'var(--color-text-success)' : 'var(--color-text-muted)' });
const STATUS_COLOR = { danger: 'danger', warning: 'warning', safe: 'success' };

function timeAgo(d) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  const hrs = Math.floor(diff / 3600000);
  if (hrs > 0) return `${hrs}h ago`;
  return 'recently';
}

// ── Login screen ───────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    localStorage.setItem('adminSecret', secret);
    try {
      await api.adminGetStats();
      onLogin(secret);
    } catch {
      localStorage.removeItem('adminSecret');
      setError('Invalid admin secret. Check your ADMIN_SECRET environment variable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-background-tertiary)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>Admin Portal</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Financial Safety Manager</div>
        </div>
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 16, padding: '1.5rem' }}>
          {error && <div style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>{error}</div>}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Admin secret</label>
              <input type="password" required value={secret} onChange={e => setSecret(e.target.value)} placeholder="Your ADMIN_SECRET value" />
            </div>
            <button type="submit" className="primary" disabled={loading} style={{ padding: '10px', marginTop: 4 }}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.adminGetStats().then(setStats).catch(() => {}); }, []);
  if (!stats) return <div style={{ color: 'var(--color-text-muted)', padding: '2rem', textAlign: 'center' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Households', value: stats.totals.households },
          { label: 'Total users', value: stats.totals.users },
          { label: 'Accounts', value: stats.totals.accounts },
          { label: 'With alert email', value: stats.totals.householdsWithAlertEmail },
          { label: 'New today', value: stats.growth.newToday },
          { label: 'New this week', value: stats.growth.newThisWeek },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Forecast status across households</div>
        {Object.entries(stats.forecastStatus).length === 0
          ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No status data yet — households need to load their forecast first.</div>
          : Object.entries(stats.forecastStatus).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={badge(STATUS_COLOR[status] || 'neutral')}>{status || 'unknown'}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{count}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Households tab ─────────────────────────────────────────────────────────
function HouseholdsTab() {
  const [households, setHouseholds] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [pwTarget, setPwTarget] = useState(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.adminGetHouseholds(search).then(setHouseholds).catch(() => {}).finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const selectHousehold = async (h) => {
    setSelected(h);
    setDetail(null);
    setMsg('');
    const d = await api.adminGetHousehold(h.id).catch(() => null);
    setDetail(d);
  };

  const toggleDisable = async () => {
    if (!selected) return;
    const newVal = !selected.is_disabled;
    const reason = newVal ? prompt('Reason for disabling (optional):') : null;
    await api.adminUpdateHousehold(selected.id, { is_disabled: newVal, disabled_reason: reason });
    setMsg(newVal ? 'Household disabled.' : 'Household re-enabled.');
    load();
    setSelected(s => ({ ...s, is_disabled: newVal }));
  };

  const clearAlerts = async () => {
    if (!selected) return;
    await api.adminClearAlerts(selected.id);
    setMsg('Alert dedup cleared — next dangerous forecast will fire a notification.');
  };

  const resetPw = async (userId) => {
    if (!newPw || newPw.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    await api.adminResetUserPassword(userId, newPw);
    setMsg('Password updated successfully.');
    setNewPw('');
    setPwTarget(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 12 }}>
      {/* List */}
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ flex: 1 }} />
          <button onClick={load} style={{ padding: '7px 12px', fontSize: 12 }}>Search</button>
        </div>
        {loading && <div style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '1rem 0' }}>Loading…</div>}
        {households.map(h => (
          <div key={h.id} onClick={() => selectHousehold(h)} style={{ ...card, cursor: 'pointer', border: `0.5px solid ${selected?.id === h.id ? 'var(--color-border-primary)' : 'var(--color-border-tertiary)'}`, marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{h.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {h.member_count} member{h.member_count !== '1' ? 's' : ''} · {h.account_count} account{h.account_count !== '1' ? 's' : ''} · joined {timeAgo(h.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {h.last_status && <span style={badge(STATUS_COLOR[h.last_status])}>{h.last_status}</span>}
                {h.is_disabled && <span style={badge('danger')}>disabled</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel */}
      {selected && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{selected.name}</div>
            <button onClick={() => setSelected(null)} style={{ fontSize: 12 }}>Close</button>
          </div>

          {msg && <div style={{ background: 'var(--color-background-success)', color: 'var(--color-text-success)', borderRadius: 8, padding: '7px 12px', fontSize: 12, marginBottom: 10 }}>{msg}</div>}

          {!detail ? <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</div> : (
            <>
              {/* Controls */}
              <div style={card}>
                <div style={sectionLabel}>Controls</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={toggleDisable} style={{ fontSize: 12, color: selected.is_disabled ? 'var(--color-text-success)' : 'var(--color-text-danger)', borderColor: selected.is_disabled ? 'var(--color-border-success)' : 'var(--color-border-danger)' }}>
                    {selected.is_disabled ? 'Re-enable household' : 'Disable household'}
                  </button>
                  <button onClick={clearAlerts} style={{ fontSize: 12 }}>Clear alert dedup</button>
                </div>
                {selected.is_disabled && detail.household.disabled_reason && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-danger)' }}>Reason: {detail.household.disabled_reason}</div>
                )}
              </div>

              {/* Members */}
              <div style={card}>
                <div style={sectionLabel}>Members</div>
                {detail.members.map(m => (
                  <div key={m.id} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pwTarget === m.id ? 8 : 0 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.email}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{m.role} · joined {timeAgo(m.created_at)}</div>
                      </div>
                      <button onClick={() => setPwTarget(pwTarget === m.id ? null : m.id)} style={{ fontSize: 11, padding: '3px 9px' }}>
                        {pwTarget === m.id ? 'Cancel' : 'Reset PW'}
                      </button>
                    </div>
                    {pwTarget === m.id && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input type="text" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8)" style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                        <button onClick={() => resetPw(m.id)} style={{ fontSize: 12, padding: '5px 10px', background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', border: 'none' }}>Set</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Recent notifications */}
              {detail.recentNotifications.length > 0 && (
                <div style={card}>
                  <div style={sectionLabel}>Recent notifications</div>
                  {detail.recentNotifications.map(n => (
                    <div key={n.id} style={{ fontSize: 12, padding: '5px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', color: n.read_at ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                      <span style={badge(n.type === 'safety' ? 'danger' : 'neutral')}>{n.type}</span>
                      {' '}{n.title} · {timeAgo(n.created_at)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Announcements tab ──────────────────────────────────────────────────────
function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({ type: 'info', title: '', body: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.adminGetAnnouncements().then(setAnnouncements).catch(() => {});
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!form.title || !form.body) { setMsg('Title and body are required.'); return; }
    setBusy(true);
    try {
      const r = await api.adminPostAnnouncement(form);
      setMsg(`Sent to ${r.delivered_to} household${r.delivered_to !== 1 ? 's' : ''}.`);
      setForm({ type: 'info', title: '', body: '' });
      load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this announcement and remove it from all household feeds?')) return;
    await api.adminDeleteAnnouncement(id).catch(() => {});
    load();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* Compose */}
      <div>
        <div style={card}>
          <div style={sectionLabel}>New announcement</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="info">Info</option>
                <option value="update">Update</option>
                <option value="changelog">Changelog</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Title</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. v1.7.0 released" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Body</label>
              <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="What's new, what changed, what to expect…" rows={5} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, resize: 'vertical', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }} />
            </div>
            {msg && <div style={{ fontSize: 12, color: msg.includes('Sent') ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>{msg}</div>}
            <button className="primary" onClick={send} disabled={busy} style={{ padding: '9px' }}>
              {busy ? 'Sending…' : 'Send to all households'}
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <div style={sectionLabel}>Sent announcements</div>
        {announcements.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No announcements yet.</div>
          : announcements.map(a => (
            <div key={a.id} style={{ ...card, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={badge('neutral')}>{a.type}</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{a.title}</span>
                </div>
                <button onClick={() => del(a.id)} style={{ fontSize: 11, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', padding: '2px 8px' }}>Delete</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, lineHeight: 1.5 }}>{a.body}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{timeAgo(a.published_at)}</div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Main admin portal ──────────────────────────────────────────────────────
export default function AdminPortalPage() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('adminSecret'));
  const [tab, setTab] = useState('overview');

  // Verify stored secret on mount
  useEffect(() => {
    if (authed) {
      api.adminGetStats().catch(() => {
        localStorage.removeItem('adminSecret');
        setAuthed(false);
      });
    }
  }, []);

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'households', label: 'Households' },
    { id: 'announcements', label: 'Announcements' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)' }}>
      {/* Header */}
      <header style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15 }}>Admin Portal</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Financial Safety Manager</div>
        </div>
        <button onClick={() => { localStorage.removeItem('adminSecret'); setAuthed(false); }} style={{ fontSize: 12, padding: '4px 10px' }}>Sign out</button>
      </header>

      {/* Tab bar */}
      <div style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', padding: '0 20px', display: 'flex', gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '12px 16px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: tab === t.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: tab === t.id ? 500 : 400, borderBottom: tab === t.id ? '2px solid var(--color-text-primary)' : '2px solid transparent', borderRadius: 0 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={{ padding: '16px 20px', maxWidth: 960, margin: '0 auto' }}>
        {tab === 'overview' && <OverviewTab />}
        {tab === 'households' && <HouseholdsTab />}
        {tab === 'announcements' && <AnnouncementsTab />}
      </main>
    </div>
  );
}
