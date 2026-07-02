import { useState, useEffect } from 'react';
import { api } from '../api';
import { useForecast } from '../hooks/useForecast';
import { useAuth } from '../hooks/useAuth';

const fmt = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const sectionLabel = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
};

const STATUS_DOT = {
  safe:    'var(--color-bar-success)',
  warning: 'var(--color-text-warning)',
  danger:  'var(--color-text-danger)',
};

const STATUS_LABEL = {
  safe: 'Safe', warning: 'Warning', danger: 'Danger',
};

function StatusChip({ forecast, loading }) {
  if (loading) return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Simulating…</span>;
  if (!forecast) return <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</span>;
  const dot = STATUS_DOT[forecast.status] || STATUS_DOT.safe;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{STATUS_LABEL[forecast.status]}</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Buffer: <strong style={{ color: 'var(--color-text-primary)' }}>{fmt(forecast.freeCash)}</strong>
      </span>
    </div>
  );
}

export default function ScenarioPage() {
  const [overlays, setOverlays] = useState([]);
  const [active, setActive] = useState(false);
  const [horizon, setHorizon] = useState(30);
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ name: '', amount: '', event_type: 'expense', event_date: new Date().toISOString().slice(0, 10), account_id: '' });
  const [saveForm, setSaveForm] = useState({ name: '' });
  const [msg, setMsg] = useState('');
  const [overlayError, setOverlayError] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { forecast: baseline } = useForecast(horizon);
  const { forecast: simulated, loading: simLoading } = useForecast(horizon, active ? overlays : []);

  useEffect(() => {
    api.getAccounts().then(rows => {
      setAccounts(rows);
      setForm(f => (f.account_id ? f : { ...f, account_id: rows[0]?.id || '' }));
    });
    api.getScenarios().then(setSavedScenarios).catch(() => {});
  }, []);

  const addOverlay = () => {
    setOverlayError('');
    if (!form.name.trim()) { setOverlayError('Give the scenario event a name.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setOverlayError('Enter an amount greater than 0.'); return; }
    if (!form.account_id) { setOverlayError('Select an account.'); return; }
    const eventDate = new Date(form.event_date);
    const horizonEnd = new Date();
    horizonEnd.setDate(horizonEnd.getDate() + horizon);
    if (eventDate > horizonEnd) {
      setOverlayError(`That date is beyond the ${horizon}-day horizon — increase the horizon or pick an earlier date.`);
    }
    setOverlays([...overlays, { ...form, id: `ov${Date.now()}`, amount: parseFloat(form.amount) }]);
    setForm(f => ({ ...f, name: '', amount: '' }));
    setActive(true);
  };

  const removeOverlay = (id) => setOverlays(overlays.filter(o => o.id !== id));

  const saveScenario = async () => {
    if (!saveForm.name) return;
    try {
      const events = overlays.map(o => ({ name: o.name, amount: o.amount, event_type: o.event_type, event_date: o.event_date, account_id: o.account_id }));
      await api.createScenario({ name: saveForm.name, events });
      const updated = await api.getScenarios();
      setSavedScenarios(updated);
      setSaveForm({ name: '' });
      setMsg('Scenario saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message);
    }
  };

  const deleteScenario = async (id) => {
    await api.deleteScenario(id);
    setSavedScenarios(savedScenarios.filter(s => s.id !== id));
  };

  // Determine if the scenario changes the outcome — highlight the difference
  const statusChanged = active && baseline && simulated && baseline.status !== simulated.status;
  const bufferChanged = active && baseline && simulated && baseline.freeCash !== simulated.freeCash;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 4px', letterSpacing: '-0.01em' }}>What-if</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Add temporary events to see how they'd affect your forecast. Nothing here changes real data.
        </p>
      </div>

      {/* Comparison card — only shown when scenario is active */}
      {active && baseline && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: `0.5px solid ${statusChanged ? 'var(--color-border-warning)' : 'var(--color-border-tertiary)'}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {/* Baseline */}
            <div style={{ padding: '14px', borderRight: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>Without</div>
              <StatusChip forecast={baseline} loading={false} />
            </div>
            {/* With scenario */}
            <div style={{ padding: '14px', background: statusChanged ? 'var(--color-background-warning)' : 'transparent' }}>
              <div style={{ ...sectionLabel, marginBottom: 10 }}>With scenario</div>
              <StatusChip forecast={simulated} loading={simLoading} />
            </div>
          </div>

          {/* Delta summary */}
          {!simLoading && simulated && bufferChanged && (
            <div style={{
              borderTop: '0.5px solid var(--color-border-tertiary)',
              padding: '8px 14px',
              fontSize: 12,
              color: simulated.freeCash < baseline.freeCash ? 'var(--color-text-danger)' : 'var(--color-text-success)',
              background: 'var(--color-background-secondary)',
            }}>
              Buffer change: {simulated.freeCash < baseline.freeCash ? '−' : '+'}{fmt(Math.abs(simulated.freeCash - baseline.freeCash))}
            </div>
          )}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setActive(!active)}
          style={{
            flex: 1,
            padding: '8px 14px',
            background: active ? 'var(--color-text-primary)' : 'transparent',
            color: active ? 'var(--color-background-primary)' : 'var(--color-text-primary)',
            borderColor: active ? 'transparent' : 'var(--color-border-secondary)',
            fontSize: 13,
          }}
        >
          {active ? '● Scenario active' : 'Apply scenario to forecast'}
        </button>
        <select
          value={horizon}
          onChange={e => setHorizon(parseInt(e.target.value))}
          style={{ width: 90, fontSize: 13 }}
        >
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Overlay list */}
      {overlays.length === 0 ? (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 12,
          padding: '2rem 1rem',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 13,
        }}>
          No scenario events yet — add one below.
        </div>
      ) : (
        <div>
          <div style={sectionLabel}>Scenario events</div>
          {overlays.map(o => (
            <div key={o.id} style={{
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{o.name}</span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 6,
                    background: o.event_type === 'expense' ? 'var(--color-background-danger)' : 'var(--color-background-success)',
                    color: o.event_type === 'expense' ? 'var(--color-text-danger)' : 'var(--color-text-success)',
                    border: `0.5px solid ${o.event_type === 'expense' ? 'var(--color-border-danger)' : 'var(--color-border-success)'}`,
                  }}>
                    {o.event_type}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {fmt(o.amount)} · {fmtDate(o.event_date)}
                </div>
              </div>
              <button
                onClick={() => removeOverlay(o.id)}
                style={{ fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', padding: '4px 10px' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add event form */}
      {isAdmin && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 12,
          padding: '14px',
        }}>
          <div style={sectionLabel}>Add event to scenario</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Job loss, car repair…" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Amount</label>
                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
                <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Account</label>
              <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <button className="primary" onClick={addOverlay} style={{ padding: '9px' }}>
              Add to scenario
            </button>

            {overlayError && (
              <div style={{ fontSize: 12, color: 'var(--color-text-danger)' }}>{overlayError}</div>
            )}
          </div>
        </div>
      )}

      {/* Save scenario */}
      {isAdmin && overlays.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={saveForm.name}
            onChange={e => setSaveForm({ name: e.target.value })}
            placeholder="Name this scenario to save it…"
            style={{ flex: 1 }}
          />
          <button onClick={saveScenario} style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>Save</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{msg}</div>}

      {/* Saved scenarios */}
      {savedScenarios.length > 0 && (
        <div>
          <hr style={{ border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', margin: '4px 0 10px' }} />
          <div style={sectionLabel}>Saved scenarios</div>
          {savedScenarios.map(s => (
            <div key={s.id} style={{
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {(s.events || []).length} event{(s.events || []).length !== 1 ? 's' : ''}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => deleteScenario(s.id)}
                  style={{ fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', padding: '4px 10px' }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
