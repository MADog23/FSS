import { useState, useCallback } from 'react';
import { useForecast } from '../hooks/useForecast';
import { api } from '../api';

const fmt = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const HORIZONS = [30, 60, 90];

const STATUS = {
  safe:    { dot: 'var(--color-bar-success)', label: 'Safe',    labelColor: 'var(--color-text-success)' },
  warning: { dot: 'var(--color-text-warning)', label: 'Warning', labelColor: 'var(--color-text-warning)' },
  danger:  { dot: 'var(--color-text-danger)',  label: 'Danger',  labelColor: 'var(--color-text-danger)'  },
};

function obligationIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('rent') || n.includes('mortgage')) return '🏠';
  if (n.includes('electric') || n.includes('gas') || n.includes('util')) return '⚡';
  if (n.includes('internet') || n.includes('cable') || n.includes('wifi')) return '📡';
  if (n.includes('phone') || n.includes('mobile')) return '📱';
  if (n.includes('insurance')) return '🛡';
  if (n.includes('card') || n.includes('visa') || n.includes('amex') || n.includes('mastercard')) return '💳';
  if (n.includes('subscri') || n.includes('netflix') || n.includes('spotify')) return '▶';
  if (n.includes('loan') || n.includes('student')) return '🏦';
  if (n.includes('grocery') || n.includes('food')) return '🛒';
  return '📋';
}

export default function DashboardPage() {
  const [horizon, setHorizon] = useState(30);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [scrubIndex, setScrubIndex] = useState(null);
  const { forecast, loading, error, refresh } = useForecast(horizon);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)', fontSize: 14 }}>
      Running forecast…
    </div>
  );

  if (error) return (
    <div style={{ padding: '12px 14px', color: 'var(--color-text-danger)', background: 'var(--color-background-danger)', borderRadius: 10, border: '0.5px solid var(--color-border-danger)', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{error}</span>
      <button onClick={refresh} style={{ fontSize: 12 }}>Retry</button>
    </div>
  );

  if (!forecast) return null;

  const events = forecast.events || [];
  const cfg = STATUS[forecast.status] || STATUS.safe;

  const scrubbedEvent = scrubIndex != null ? events[scrubIndex] : null;
  const displayedBuffer = scrubbedEvent ? scrubbedEvent.freeCashAsOf : forecast.freeCash;
  const bufferLabel = scrubbedEvent ? `as of ${fmtDate(scrubbedEvent.date)}` : `${horizon}-day buffer`;

  const safeThrough = forecast.dangerDate
    ? `Fails ${fmtDate(forecast.dangerDate)}`
    : forecast.warningDate
    ? `Warning from ${fmtDate(forecast.warningDate)}`
    : `Safe through ${fmtDate(addDays(new Date(), horizon))}`;

  const nextObligation = events.find(e => e.type === 'expense' || e.type === 'cc_payment');
  const nextIncome = events.find(e => e.type === 'income');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Primary status card ─────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 500, color: cfg.labelColor }}>{cfg.label}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'var(--color-background-secondary)', padding: '3px 10px', borderRadius: 20, border: '0.5px solid var(--color-border-tertiary)' }}>
            {safeThrough}
          </span>
        </div>

        {/* Buffer figure */}
        <div style={{ borderTop: divider, paddingTop: 14, paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={sectionLabel}>{bufferLabel}</span>
            <button onClick={() => setShowWhy(!showWhy)} style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, lineHeight: 1.7, color: 'var(--color-text-muted)', border: '0.5px solid var(--color-border-tertiary)' }}>why?</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 40, fontWeight: 500, lineHeight: 1, color: displayedBuffer === 0 ? 'var(--color-text-danger)' : 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              {fmt(displayedBuffer)}
            </span>
            {nextIncome && !scrubbedEvent && (
              <span style={{ fontSize: 11, color: 'var(--color-text-success)', background: 'var(--color-background-success)', border: '0.5px solid var(--color-border-success)', padding: '3px 9px', borderRadius: 12, whiteSpace: 'nowrap' }}>
                +{fmt(nextIncome.amount)} due {fmtDate(nextIncome.date)}
              </span>
            )}
          </div>
          {scrubbedEvent && (
            <button onClick={() => setScrubIndex(null)} style={{ fontSize: 11, marginTop: 8, padding: '2px 8px', color: 'var(--color-text-muted)' }}>
              ← back to {horizon}-day view
            </button>
          )}
        </div>

        {/* Why explainer */}
        {showWhy && (
          <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 14 }}>
            <div style={{ fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>How your available buffer is calculated</div>
            <div>Your buffer is the <strong>lowest point</strong> your spendable balance reaches {scrubbedEvent ? `between today and ${fmtDate(scrubbedEvent.date)}` : `over the next ${horizon} days`}, after every income, bill, and card payment is applied in order.</div>
            <div style={{ marginTop: 6 }}>Spendable now: <strong>{fmt(forecast.spendableTotal)}</strong>{forecast.excludedTotal > 0 && <span style={{ color: 'var(--color-text-muted)' }}> · {fmt(forecast.excludedTotal)} set aside (not counted)</span>}</div>
            <div style={{ marginTop: 6, color: 'var(--color-text-muted)' }}>A $0 buffer means the spendable balance would go negative at some point. Mark accounts as "set aside" on the Accounts tab to exclude them.</div>
          </div>
        )}

        {/* Deficit */}
        {forecast.deficit > 0 && (
          <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--color-text-danger)', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontWeight: 500 }}>Deficit detected</div>
            <div>Shortfall: <strong>{fmt(forecast.deficit)}</strong></div>
            {forecast.dangerDate && <div>First failure: {fmtDate(forecast.dangerDate)}</div>}
            <div>Minimum deposit to restore safety: <strong>{fmt(forecast.minimumDepositNeeded)}</strong></div>
          </div>
        )}

        {/* Next obligation */}
        {nextObligation && (
          <div style={{ borderTop: divider, paddingTop: 12 }}>
            <div style={sectionLabel}>Next obligation</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-background-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                  {obligationIcon(nextObligation.name)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{nextObligation.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>
                    {fmtDate(nextObligation.date)}{nextObligation.type === 'cc_payment' && ' · card payment'}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{fmt(nextObligation.amount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Horizon selector ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6 }}>
        {HORIZONS.map(h => {
          const active = horizon === h;
          return (
            <button key={h} onClick={() => { setHorizon(h); setScrubIndex(null); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `0.5px solid ${active ? 'var(--color-text-info)' : 'var(--color-border-secondary)'}`, background: active ? 'rgba(24,95,165,0.07)' : 'var(--color-background-primary)', color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)', fontWeight: active ? 500 : 400, fontSize: 13 }}>
              {h} days
            </button>
          );
        })}
      </div>

      {/* ── Account projection cards ─────────────────────────────── */}
      <AccountBalances forecast={forecast} />

      {/* ── Balance chart toggle ──────────────────────────────────── */}
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, border: '0.5px solid var(--color-border-tertiary)' }}>
        <button onClick={() => setShowChart(!showChart)} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', borderRadius: 12, background: 'transparent' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 15 }}>📈</span>
            <span>Balance projection</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{showChart ? '▲' : '▼'}</span>
        </button>
        {showChart && <BalanceChart events={events} horizon={horizon} initialSpendable={forecast.spendableTotal} />}
      </div>

      {/* ── Event timeline ────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, border: '0.5px solid var(--color-border-tertiary)' }}>
        <button onClick={() => setShowTimeline(!showTimeline)} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', fontSize: 13, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', borderRadius: 12, background: 'transparent' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 15 }}>📋</span>
            <span>Event timeline</span>
            <span style={{ fontSize: 11, background: 'var(--color-background-secondary)', color: 'var(--color-text-muted)', padding: '1px 7px', borderRadius: 10 }}>{events.length}</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{showTimeline ? '▲' : '▼'}</span>
        </button>
        {showTimeline && <Timeline events={events} scrubIndex={scrubIndex} onScrub={setScrubIndex} />}
      </div>
    </div>
  );
}

// ── Account projection cards (read-only) ──────────────────────────────────
function AccountBalances({ forecast }) {
  const entries = Object.entries(forecast.finalBalances || {});
  if (entries.length === 0) return null;
  const spendableIds = new Set(forecast.spendableAccountIds || []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
      {entries.map(([id, bal]) => {
        const isNeg = bal < 0;
        const isSpendable = spendableIds.has(id);
        const pct = isNeg ? 0 : Math.min(100, (bal / (bal + 1500)) * 100);
        const barColor = isNeg ? 'var(--color-bar-danger)' : isSpendable ? 'var(--color-bar-success)' : 'var(--color-bar-neutral)';

        return (
          <div key={id} style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Projected · {forecast.horizonDays}d</div>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: isSpendable ? 'var(--color-background-success)' : 'var(--color-background-secondary)', color: isSpendable ? 'var(--color-text-success)' : 'var(--color-text-muted)', border: `0.5px solid ${isSpendable ? 'var(--color-border-success)' : 'var(--color-border-tertiary)'}` }}>
                {isSpendable ? 'spendable' : 'set aside'}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: isNeg ? 'var(--color-text-danger)' : 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
              {isNeg ? '-' : ''}{fmt(bal)}
            </div>
            <div style={{ marginTop: 8, height: 3, background: 'var(--color-background-tertiary)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Balance projection chart (SVG, no external library) ───────────────────
function BalanceChart({ events, horizon, initialSpendable }) {
  const W = 340, H = 140, PAD = { top: 12, right: 12, bottom: 28, left: 50 };
  const today = new Date(); today.setHours(0,0,0,0);
  const endDate = addDays(today, horizon);

  // Build daily spendable balance series from events
  const points = [{ date: today, balance: initialSpendable }];
  let running = initialSpendable;
  events.forEach(ev => {
    if (ev.type === 'income') running += ev.amount;
    else running -= ev.amount;
    points.push({ date: new Date(ev.date), balance: running });
  });
  // Add endpoint
  points.push({ date: endDate, balance: running });

  const minBal = Math.min(0, ...points.map(p => p.balance));
  const maxBal = Math.max(...points.map(p => p.balance), 1);
  const totalDays = horizon || 30;

  const xScale = (date) => {
    const days = Math.max(0, Math.min(totalDays, (date - today) / 86400000));
    return PAD.left + (days / totalDays) * (W - PAD.left - PAD.right);
  };
  const yScale = (bal) => {
    const range = maxBal - minBal;
    return PAD.top + (1 - (bal - minBal) / (range || 1)) * (H - PAD.top - PAD.bottom);
  };

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.date).toFixed(1)},${yScale(p.balance).toFixed(1)}`).join(' ');
  const fillD = `${pathD} L${xScale(endDate).toFixed(1)},${yScale(minBal < 0 ? 0 : minBal + (maxBal - minBal) * 0).toFixed(1)} L${xScale(today).toFixed(1)},${yScale(0).toFixed(1)} Z`;

  const zeroY = yScale(0);
  const hasNegative = minBal < 0;

  // Y axis labels
  const yTicks = [maxBal, (maxBal + minBal) / 2, minBal].filter((v, i, a) => a.indexOf(v) === i);

  // X axis labels (start, mid, end)
  const xTicks = [today, addDays(today, Math.round(horizon / 2)), endDate];

  return (
    <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {/* Zero line */}
        {hasNegative && (
          <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="var(--color-border-danger)" strokeWidth="0.5" strokeDasharray="3,3" />
        )}

        {/* Area fill */}
        <path d={fillD} fill="var(--color-bar-success)" opacity="0.08" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="var(--color-bar-success)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Y axis labels */}
        {yTicks.map((v, i) => (
          <text key={i} x={PAD.left - 4} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="var(--color-text-muted)">
            {v >= 1000 ? `$${Math.round(v/1000)}k` : `$${Math.round(v)}`}
          </text>
        ))}

        {/* X axis labels */}
        {xTicks.map((d, i) => (
          <text key={i} x={xScale(d)} y={H - 4} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="9" fill="var(--color-text-muted)">
            {fmtDate(d)}
          </text>
        ))}

        {/* Danger zone indicator */}
        {hasNegative && (
          <text x={PAD.left + 4} y={H - PAD.bottom - 4} fontSize="9" fill="var(--color-text-danger)">below $0</text>
        )}
      </svg>
    </div>
  );
}

// ── Event timeline ─────────────────────────────────────────────────────────
function Timeline({ events, scrubIndex, onScrub }) {
  const shown = events.slice(0, 40);
  const fmt2 = (n) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

  const typeColor = (type) => {
    if (type === 'income') return 'var(--color-bar-success)';
    if (type === 'cc_payment') return 'var(--color-text-warning)';
    return 'var(--color-text-danger)';
  };

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', padding: '4px 14px 10px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '8px 0 4px' }}>
        Tap any event to see your buffer as of that point in time
      </div>
      {shown.length === 0 && <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: 13 }}>No events in this horizon</div>}
      {shown.map((ev, i) => {
        const isSelected = scrubIndex === i;
        return (
          <div key={i} onClick={() => onScrub(isSelected ? null : i)} style={{ display: 'flex', gap: 10, padding: '8px 8px', margin: '2px -8px', borderRadius: 8, cursor: 'pointer', background: isSelected ? 'var(--color-background-secondary)' : 'transparent', border: `0.5px solid ${isSelected ? 'var(--color-border-secondary)' : 'transparent'}`, alignItems: 'flex-start', transition: 'background 0.1s' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: typeColor(ev.type) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</span>
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: ev.type === 'income' ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
                  {ev.type === 'income' ? '+' : '−'}{fmt2(ev.amount)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>·</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>buffer: {fmt2(ev.freeCashAsOf)}</span>
                {ev.type === 'cc_payment' && <Badge text="card payment" color="warning" />}
                {ev.isScenario && <Badge text="scenario" color="warning" />}
                {ev.isOverride && <Badge text="overridden" color="neutral" />}
                {ev.isOverrideAmount && <Badge text="adjusted pay" color="success" />}
              </div>
            </div>
          </div>
        );
      })}
      {events.length > 40 && <div style={{ textAlign: 'center', paddingTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>+{events.length - 40} more events beyond this view</div>}
    </div>
  );
}

function Badge({ text, color }) {
  const styles = {
    warning: { bg: 'var(--color-background-warning)', fg: 'var(--color-text-warning)', border: 'var(--color-border-warning)' },
    neutral: { bg: 'var(--color-background-secondary)', fg: 'var(--color-text-muted)', border: 'var(--color-border-tertiary)' },
    success: { bg: 'var(--color-background-success)', fg: 'var(--color-text-success)', border: 'var(--color-border-success)' },
  };
  const s = styles[color] || styles.neutral;
  return <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: s.bg, color: s.fg, border: `0.5px solid ${s.border}` }}>{text}</span>;
}

const card = { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 16, padding: '18px 16px' };
const divider = '0.5px solid var(--color-border-tertiary)';
const sectionLabel = { fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };
