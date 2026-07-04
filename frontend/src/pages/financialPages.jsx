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
      renderItemExtra={(item, { isAdmin }) => <QuickBalanceUpdate account={item} isAdmin={isAdmin} />}
    />
  );
}

function QuickBalanceUpdate({ account, isAdmin }) {
  const [inputVal, setInputVal] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const start = () => {
    setInputVal(String(parseFloat(account.balance) || 0));
    setEditing(true);
    setError('');
    setSuccess(false);
  };

  const submit = async () => {
    const val = parseFloat(inputVal);
    if (Number.isNaN(val)) { setError('Enter a valid number.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.quickUpdateBalance(account.id, val);
      setEditing(false);
      setSuccess(true);
      // Refresh the page data by reloading — CrudPage will refetch on mount
      // A light reload approach: update the displayed balance locally
      account.balance = val;
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
        Current balance — update this whenever you check your bank
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--color-text-muted)', pointerEvents: 'none' }}>$</span>
            <input
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              autoFocus
              placeholder="0.00"
              style={{ paddingLeft: 20, fontSize: 14 }}
            />
          </div>
          <button
            onClick={submit}
            disabled={busy}
            style={{ padding: '7px 14px', background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', border: 'none', fontSize: 13 }}
          >
            {busy ? '…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ padding: '7px 10px', fontSize: 13 }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>
            ${parseFloat(account.balance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
          <button onClick={start} style={{ fontSize: 12, padding: '4px 12px', color: success ? 'var(--color-text-success)' : 'var(--color-text-primary)', borderColor: success ? 'var(--color-border-success)' : 'var(--color-border-secondary)' }}>
            {success ? '✓ Updated' : 'Update'}
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: 'var(--color-text-danger)', marginTop: 4 }}>{error}</div>}
    </div>
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
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' },
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
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'yearly', label: 'Yearly' },
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
      searchable
    />
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
    />
  );
}
