// AccountsPage.jsx
import { useState, useEffect } from 'react';
import CrudPage from '../components/CrudPage';
import { api } from '../api';

export function AccountsPage() {
  const fields = [
    { key: 'name', label: 'Name', placeholder: 'Checking', showInList: false },
    { key: 'type', label: 'Type', type: 'select', showInList: true,
      options: [{ value: 'checking', label: 'Checking' }, { value: 'savings', label: 'Savings' }, { value: 'other', label: 'Other' }],
      default: 'checking' },
    { key: 'balance', label: 'Current balance', type: 'number', placeholder: '0', showInList: true },
    { key: 'warning_threshold', label: 'Warning threshold', type: 'number', placeholder: 'optional', showInList: true },
    { key: 'is_spendable', label: 'Counts toward free cash', type: 'select', showInList: true, fullWidth: true,
      options: [
        { value: true, label: 'Yes — spendable (e.g. checking)' },
        { value: false, label: 'No — set aside (e.g. savings, emergency fund)' },
      ],
      default: true },
  ];
  return (
    <CrudPage
      title="Accounts"
      fetchFn={api.getAccounts}
      createFn={api.createAccount}
      updateFn={api.updateAccount}
      deleteFn={api.deleteAccount}
      fields={fields}
      itemLabel={item => item.name}
    />
  );
}

// IncomePage.jsx
export function IncomePage() {
  const fields = [
    { key: 'name', label: 'Name', placeholder: 'Salary', showInList: false },
    { key: 'amount', label: 'Amount', type: 'number', placeholder: '0', showInList: true },
    { key: 'frequency', label: 'Frequency', type: 'select', showInList: true,
      options: [
        { value: 'weekly', label: 'Weekly' },
        { value: 'biweekly', label: 'Biweekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'once', label: 'One-time' },
      ],
      default: 'biweekly' },
    { key: 'next_date', label: 'Next date', type: 'date', showInList: true, default: new Date().toISOString().slice(0, 10) },
    { key: 'source_account_id', label: 'Deposits into', type: 'account-select', fullWidth: true, showInList: true },
  ];
  return (
    <CrudPage
      title="Income"
      fetchFn={api.getIncome}
      createFn={api.createIncome}
      updateFn={api.updateIncome}
      deleteFn={api.deleteIncome}
      fields={fields}
      itemLabel={item => item.name}
    />
  );
}

// BillsPage.jsx
export function BillsPage() {
  const fields = [
    { key: 'name', label: 'Name', placeholder: 'Rent', showInList: false },
    { key: 'amount', label: 'Amount', type: 'number', placeholder: '0', showInList: true },
    { key: 'frequency', label: 'Frequency', type: 'select', showInList: true,
      options: [
        { value: 'weekly', label: 'Weekly' },
        { value: 'biweekly', label: 'Biweekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'once', label: 'One-time' },
      ],
      default: 'monthly' },
    { key: 'next_date', label: 'Next due date', type: 'date', showInList: true, default: new Date().toISOString().slice(0, 10) },
    { key: 'target_account_id', label: 'Paid from', type: 'account-select', fullWidth: true, showInList: true },
  ];
  return (
    <CrudPage
      title="Bills"
      fetchFn={api.getBills}
      createFn={api.createBill}
      updateFn={api.updateBill}
      deleteFn={api.deleteBill}
      fields={fields}
      itemLabel={item => item.name}
      renderItemExtra={(item, { isAdmin }) => <BillPaidMarks bill={item} isAdmin={isAdmin} />}
      searchable
    />
  );
}

function BillPaidMarks({ bill, isAdmin }) {
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(bill.next_date ? new Date(bill.next_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getBillPaidMarks(bill.id).then(setMarks).catch(() => {}).finally(() => setLoading(false));
  }, [bill.id]);

  const markPaid = async () => {
    setBusy(true);
    try {
      const mark = await api.markBillPaid(bill.id, date);
      if (mark && mark.id) setMarks(m => [...m, mark]);
    } catch {
      // already marked or failed silently — refresh to reconcile
      api.getBillPaidMarks(bill.id).then(setMarks).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const unmark = async (markId) => {
    setBusy(true);
    try {
      await api.unmarkBillPaid(bill.id, markId);
      setMarks(m => m.filter(x => x.id !== markId));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        Already paid occurrences {marks.length > 0 && `(${marks.length})`}
      </div>
      {marks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {marks.map(m => (
            <span key={m.id} style={{
              fontSize: 11,
              background: 'var(--color-background-success)',
              color: 'var(--color-text-success)',
              padding: '3px 8px',
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}>
              ✓ {new Date(m.occurrence_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {isAdmin && (
                <button onClick={() => unmark(m.id)} disabled={busy} style={{ border: 'none', background: 'none', padding: 0, fontSize: 11, cursor: 'pointer', color: 'inherit' }}>✕</button>
              )}
            </span>
          ))}
        </div>
      )}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
          <button onClick={markPaid} disabled={busy} style={{ fontSize: 12, padding: '5px 10px' }}>Mark this date paid</button>
        </div>
      )}
    </div>
  );
}

// CardsPage.jsx
export function CardsPage() {
  const fields = [
    { key: 'name', label: 'Card name', placeholder: 'Visa', showInList: false },
    { key: 'balance', label: 'Current balance', type: 'number', placeholder: '0', showInList: true },
    { key: 'credit_limit', label: 'Credit limit', type: 'number', placeholder: '5000', showInList: true },
    { key: 'cycle_day_of_month', label: 'Statement day', type: 'integer', placeholder: '15', showInList: false, default: '15' },
    { key: 'due_offset_days', label: 'Days after statement to pay', type: 'integer', placeholder: '25', showInList: false, default: '25' },
    { key: 'payment_rule', label: 'Payment rule', type: 'select', showInList: true,
      options: [
        { value: 'minimum', label: 'Minimum' },
        { value: 'statement', label: 'Statement balance' },
        { value: 'fixed', label: 'Fixed amount' },
      ],
      default: 'minimum' },
    { key: 'minimum_payment', label: 'Minimum payment', type: 'conditional', showInList: false,
      placeholder: 'e.g. 35',
      showWhen: (form) => form.payment_rule === 'minimum' },
    { key: 'fixed_amount', label: 'Fixed amount', type: 'conditional', showInList: false,
      showWhen: (form) => form.payment_rule === 'fixed' },
    { key: 'payment_account_id', label: 'Payment account', type: 'account-select', fullWidth: true, showInList: true },
  ];
  return (
    <CrudPage
      title="Credit cards"
      fetchFn={api.getCards}
      createFn={api.createCard}
      updateFn={api.updateCard}
      deleteFn={api.deleteCard}
      fields={fields}
      itemLabel={item => item.name}
      renderItemExtra={(item, { isAdmin }) => <CardOverrides card={item} isAdmin={isAdmin} />}
    />
  );
}

function CardOverrides({ card, isAdmin }) {
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCardOverrides(card.id).then(setOverrides).catch(() => {}).finally(() => setLoading(false));
  }, [card.id]);

  const addOverride = async () => {
    setError('');
    const amt = parseFloat(amount);
    if (!dueDate || !amt || amt <= 0) { setError('Enter a due date and an amount greater than 0.'); return; }
    setBusy(true);
    try {
      const row = await api.setCardOverride(card.id, { due_date: dueDate, override_amount: amt });
      setOverrides(o => [...o.filter(x => x.due_date !== row.due_date), row]);
      setAmount('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const removeOverride = async (overrideId) => {
    setBusy(true);
    try {
      await api.deleteCardOverride(card.id, overrideId);
      setOverrides(o => o.filter(x => x.id !== overrideId));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
        One-time payment overrides {overrides.length > 0 && `(${overrides.length})`} — change the amount for a single upcoming cycle without changing the default rule
      </div>
      {overrides.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {overrides.map(o => (
            <span key={o.id} style={{
              fontSize: 11,
              background: 'var(--color-background-warning)',
              color: 'var(--color-text-warning)',
              padding: '3px 8px',
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}>
              {new Date(o.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${Math.round(o.override_amount).toLocaleString()}
              {isAdmin && (
                <button onClick={() => removeOverride(o.id)} disabled={busy} style={{ border: 'none', background: 'none', padding: 0, fontSize: 11, cursor: 'pointer', color: 'inherit' }}>✕</button>
              )}
            </span>
          ))}
        </div>
      )}
      {isAdmin && (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" style={{ width: 90, fontSize: 12, padding: '5px 8px' }} />
            <button onClick={addOverride} disabled={busy} style={{ fontSize: 12, padding: '5px 10px' }}>Set</button>
          </div>
          {error && <div style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 4 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
