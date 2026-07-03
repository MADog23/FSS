import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';

// ── Shared style tokens (mirror dashboard) ─────────────────────────────────
const sectionLabel = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 10,
};

const card = {
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 8,
};

const formCard = {
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 12,
  padding: '14px',
};

// ── CrudPage ───────────────────────────────────────────────────────────────
export default function CrudPage({ title, fetchFn, createFn, updateFn, deleteFn, fields, itemLabel, renderItemExtra, searchable }) {
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const resolvedFields = fields.map(f =>
    f.type === 'account-select'
      ? { ...f, type: 'select', options: accounts.map(a => ({ value: a.id, label: a.name })) }
      : f
  );

  const blankForm = () => {
    const b = {};
    resolvedFields.forEach(f => {
      if (f.type === 'select' && f.key.includes('account_id')) {
        b[f.key] = f.default ?? (accounts[0]?.id || '');
      } else {
        b[f.key] = f.default ?? (f.type === 'select' && f.options?.[0] ? f.options[0].value : '');
      }
    });
    return b;
  };

  useEffect(() => {
    Promise.all([fetchFn(), api.getAccounts().catch(() => [])])
      .then(([fetchedItems, fetchedAccounts]) => {
        setItems(fetchedItems);
        setAccounts(fetchedAccounts);
        if (fetchedAccounts.length > 0) {
          setForm(prev => {
            const updated = { ...prev };
            fields.forEach(f => {
              if (f.type === 'account-select' && !updated[f.key]) {
                updated[f.key] = fetchedAccounts[0].id;
              }
            });
            return updated;
          });
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = (item) => {
    const f = {};
    resolvedFields.forEach(field => { f[field.key] = item[field.key] ?? field.default ?? ''; });
    setForm(f);
    setEditing(item.id);
    setFormOpen(true);
    setError('');
    setTimeout(() => document.getElementById('crud-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const cancel = () => {
    setEditing(null);
    setFormOpen(false);
    setForm(blankForm());
    setError('');
  };

  const save = async () => {
    setError('');
    try {
      const payload = {};
      resolvedFields.forEach(f => {
        if (f.type === 'number') payload[f.key] = form[f.key] === '' ? null : (parseFloat(form[f.key]) || 0);
        else if (f.type === 'integer') payload[f.key] = form[f.key] === '' ? null : (parseInt(form[f.key]) || 0);
        else payload[f.key] = form[f.key];
      });
      if (editing) {
        const updated = await updateFn(editing, payload);
        setItems(items.map(i => i.id === editing ? updated : i));
      } else {
        const created = await createFn(payload);
        setItems([...items, created]);
      }
      setEditing(null);
      setFormOpen(false);
      setForm(blankForm());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this item?')) return;
    try {
      await deleteFn(id);
      setItems(items.filter(i => i.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)', fontSize: 14 }}>
      Loading…
    </div>
  );

  const accountName = (id) => accounts.find(a => a.id === id)?.name || '—';

  const filteredItems = searchable && search.trim()
    ? items.filter(item =>
        itemLabel(item).toLowerCase().includes(search.toLowerCase()) ||
        Object.values(item).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  const singularTitle = title.replace(/s$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>{title}</h2>
          {items.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-background-secondary)', padding: '2px 8px', borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)' }}>
              {items.length}
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => { setEditing(null); setForm(blankForm()); setError(''); setFormOpen(!formOpen); }}
            style={{
              fontSize: 13,
              padding: '6px 14px',
              background: formOpen && !editing ? 'var(--color-background-secondary)' : 'var(--color-text-primary)',
              color: formOpen && !editing ? 'var(--color-text-primary)' : 'var(--color-background-primary)',
              border: 'none',
            }}
          >
            {formOpen && !editing ? 'Cancel' : `+ Add ${singularTitle.toLowerCase()}`}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: 'var(--color-background-danger)',
          color: 'var(--color-text-danger)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 13,
          border: '0.5px solid var(--color-border-danger)',
        }}>
          {error}
        </div>
      )}

      {/* No-account warning */}
      {accounts.length === 0 && resolvedFields.some(f => f.key.includes('account_id')) && (
        <div style={{
          background: 'var(--color-background-warning)',
          color: 'var(--color-text-warning)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 13,
          border: '0.5px solid var(--color-border-warning)',
        }}>
          Add an account first — you'll need one to assign {title.toLowerCase()} to.
        </div>
      )}

      {/* Search */}
      {searchable && items.length > 0 && (
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder={`Search ${title.toLowerCase()}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--color-text-muted)', pointerEvents: 'none' }}>⌕</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', fontSize: 14, color: 'var(--color-text-muted)', padding: 0 }}
            >✕</button>
          )}
        </div>
      )}

      {/* ── Item list ──────────────────────────────────────────────── */}
      {items.length === 0 && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 12,
          padding: '2.5rem 1rem',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 14,
        }}>
          No {title.toLowerCase()} yet — add your first one below.
        </div>
      )}

      {items.length > 0 && filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Nothing matches "{search}"
        </div>
      )}

      {filteredItems.map(item => (
        <div key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{itemLabel(item)}</div>
              <ItemMeta item={item} fields={resolvedFields} accountName={accountName} />
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={() => startEdit(item)}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(item.id)}
                  style={{ fontSize: 12, padding: '4px 10px', color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          {renderItemExtra && renderItemExtra(item, { isAdmin, accounts })}
        </div>
      ))}

      {/* ── Add / Edit form — collapsed by default ──────────────────── */}
      {isAdmin && formOpen && (
        <div id="crud-form" style={{ ...formCard, marginTop: 4 }}>
          <div style={sectionLabel}>
            {editing ? `Editing ${singularTitle.toLowerCase()}` : `New ${singularTitle.toLowerCase()}`}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FieldGrid fields={resolvedFields} form={form} setForm={setForm} />

            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                className="primary"
                onClick={save}
                style={{ flex: 1, padding: '9px' }}
              >
                {editing ? 'Save changes' : `Add ${singularTitle.toLowerCase()}`}
              </button>
              <button onClick={cancel} style={{ padding: '9px 14px' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Field grid ─────────────────────────────────────────────────────────────
function FieldGrid({ fields, form, setForm }) {
  const pairs = [];
  const remaining = [...fields];
  while (remaining.length) {
    if (remaining[0].fullWidth) {
      pairs.push([remaining.shift()]);
    } else if (remaining[1] && !remaining[1].fullWidth) {
      pairs.push([remaining.shift(), remaining.shift()]);
    } else {
      pairs.push([remaining.shift()]);
    }
  }

  return (
    <>
      {pairs.map((row, ri) => (
        <div key={ri} style={{
          display: 'grid',
          gridTemplateColumns: row.length === 2 ? '1fr 1fr' : '1fr',
          gap: 10,
        }}>
          {row.map(field => (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                {field.label}
              </label>
              {field.type === 'select' ? (
                <select
                  value={String(form[field.key] ?? '')}
                  onChange={e => {
                    const raw = e.target.value;
                    const matched = field.options.find(o => String(o.value) === raw);
                    setForm({ ...form, [field.key]: matched ? matched.value : raw });
                  }}
                >
                  {field.options.map(o => (
                    <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                  ))}
                </select>
              ) : field.type === 'conditional' ? (
                field.showWhen(form) ? (
                  <input
                    type="number"
                    placeholder={field.placeholder || ''}
                    value={form[field.key] ?? ''}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  />
                ) : <div />
              ) : (
                <input
                  type={field.type === 'number' || field.type === 'integer' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  placeholder={field.placeholder || ''}
                  value={form[field.key] ?? ''}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

// ── Item meta row ──────────────────────────────────────────────────────────
function ItemMeta({ item, fields, accountName }) {
  const metaFields = fields.filter(f => f.showInList && item[f.key] != null && item[f.key] !== '');
  if (metaFields.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
      {metaFields.map((f, i) => {
        let val = item[f.key];
        if (f.type === 'number') val = `$${Math.round(val).toLocaleString()}`;
        else if (f.type === 'date') val = new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        else if (f.type === 'select') val = f.options?.find(o => String(o.value) === String(val))?.label ?? val;
        else if (f.key.includes('account_id') && accountName) val = accountName(val);

        return (
          <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: 'var(--color-border-secondary)', fontSize: 10 }}>·</span>}
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{val}</span>
          </span>
        );
      })}
    </div>
  );
}
