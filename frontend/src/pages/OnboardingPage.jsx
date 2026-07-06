import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';

const STEPS = [
  { id: 'account', title: 'Add your first account', subtitle: 'Start with your main checking account.' },
  { id: 'income',  title: 'Add your income',         subtitle: 'Enter a regular paycheck or income source.' },
  { id: 'bill',    title: 'Add your first bill',      subtitle: 'Add a recurring expense — rent, utilities, anything.' },
];

const sectionLabel = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
};

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { completeOnboarding, household } = useAuth();
  const navigate = useNavigate();

  // Account form
  const [acctForm, setAcctForm] = useState({ name: 'Checking', type: 'checking', balance: '', warning_threshold: '', is_spendable: true });
  // Income form
  const [incForm, setIncForm] = useState({ name: '', amount: '', frequency: 'biweekly', next_date: new Date().toISOString().slice(0, 10) });
  // Bill form
  const [billForm, setBillForm] = useState({ name: '', amount: '', frequency: 'monthly', next_date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    api.getAccounts().then(rows => {
      setAccounts(rows);
      if (rows[0]) setAccountId(rows[0].id);
    }).catch(() => {});
  }, [step]);

  const finish = async () => {
    await completeOnboarding();
    navigate('/');
  };

  const skip = async () => {
    await completeOnboarding();
    navigate('/');
  };

  const saveAccount = async () => {
    if (!acctForm.balance) { setError('Enter a current balance.'); return; }
    setBusy(true); setError('');
    try {
      const acct = await api.createAccount({
        name: acctForm.name,
        type: acctForm.type,
        balance: parseFloat(acctForm.balance),
        warning_threshold: acctForm.warning_threshold ? parseFloat(acctForm.warning_threshold) : null,
        is_spendable: acctForm.is_spendable,
      });
      setAccountId(acct.id);
      setAccounts([acct]);
      setStep(1);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const saveIncome = async () => {
    if (!incForm.name || !incForm.amount) { setError('Enter a name and amount.'); return; }
    setBusy(true); setError('');
    try {
      await api.createIncome({
        name: incForm.name,
        amount: parseFloat(incForm.amount),
        frequency: incForm.frequency,
        next_date: incForm.next_date,
        source_account_id: accountId,
      });
      setStep(2);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const saveBill = async () => {
    if (!billForm.name || !billForm.amount) { setError('Enter a name and amount.'); return; }
    setBusy(true); setError('');
    try {
      await api.createBill({
        name: billForm.name,
        amount: parseFloat(billForm.amount),
        frequency: billForm.frequency,
        next_date: billForm.next_date,
        target_account_id: accountId,
      });
      await finish();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const current = STEPS[step];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-background-tertiary)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '2rem 1rem 4rem',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Welcome, {household?.name || 'there'} 👋
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Let's set up your forecast in 3 quick steps.
          </div>
        </div>

        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: i <= step ? 'var(--color-text-primary)' : 'var(--color-border-secondary)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step card */}
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 16,
          padding: '1.5rem',
          marginBottom: 12,
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
              Step {step + 1} of {STEPS.length}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>{current.title}</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>{current.subtitle}</div>
          </div>

          {error && (
            <div style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {/* ── Step 1: Account ── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={sectionLabel}>Account name</div>
                  <input value={acctForm.name} onChange={e => setAcctForm({ ...acctForm, name: e.target.value })} placeholder="Checking" />
                </div>
                <div>
                  <div style={sectionLabel}>Type</div>
                  <select value={acctForm.type} onChange={e => setAcctForm({ ...acctForm, type: e.target.value })}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={sectionLabel}>Current balance</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: 14 }}>$</span>
                  <input type="number" value={acctForm.balance} onChange={e => setAcctForm({ ...acctForm, balance: e.target.value })} placeholder="0.00" style={{ paddingLeft: 22 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Enter your real bank balance right now — this is your forecast starting point.
                </div>
              </div>
              <div>
                <div style={sectionLabel}>Counts toward available buffer</div>
                <select value={String(acctForm.is_spendable)} onChange={e => setAcctForm({ ...acctForm, is_spendable: e.target.value === 'true' })}>
                  <option value="true">Yes — spendable (checking)</option>
                  <option value="false">No — set aside (savings / emergency fund)</option>
                </select>
              </div>
              <button className="primary" onClick={saveAccount} disabled={busy} style={{ padding: '10px', marginTop: 4 }}>
                {busy ? 'Saving…' : 'Save account & continue →'}
              </button>
            </div>
          )}

          {/* ── Step 2: Income ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={sectionLabel}>Income name</div>
                <input value={incForm.name} onChange={e => setIncForm({ ...incForm, name: e.target.value })} placeholder="My Paycheck" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={sectionLabel}>Amount</div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: 14 }}>$</span>
                    <input type="number" value={incForm.amount} onChange={e => setIncForm({ ...incForm, amount: e.target.value })} placeholder="0.00" style={{ paddingLeft: 22 }} />
                  </div>
                </div>
                <div>
                  <div style={sectionLabel}>Frequency</div>
                  <select value={incForm.frequency} onChange={e => setIncForm({ ...incForm, frequency: e.target.value })}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="once">One-time</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={sectionLabel}>Next pay date</div>
                <input type="date" value={incForm.next_date} onChange={e => setIncForm({ ...incForm, next_date: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="primary" onClick={saveIncome} disabled={busy} style={{ flex: 1, padding: '10px' }}>
                  {busy ? 'Saving…' : 'Save income & continue →'}
                </button>
                <button onClick={() => { setError(''); setStep(2); }} style={{ padding: '10px 14px', fontSize: 13 }}>Skip</button>
              </div>
            </div>
          )}

          {/* ── Step 3: Bill ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={sectionLabel}>Bill name</div>
                <input value={billForm.name} onChange={e => setBillForm({ ...billForm, name: e.target.value })} placeholder="Rent, Electric, etc." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={sectionLabel}>Amount</div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: 14 }}>$</span>
                    <input type="number" value={billForm.amount} onChange={e => setBillForm({ ...billForm, amount: e.target.value })} placeholder="0.00" style={{ paddingLeft: 22 }} />
                  </div>
                </div>
                <div>
                  <div style={sectionLabel}>Frequency</div>
                  <select value={billForm.frequency} onChange={e => setBillForm({ ...billForm, frequency: e.target.value })}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="once">One-time</option>
                  </select>
                </div>
              </div>
              <div>
                <div style={sectionLabel}>Next due date</div>
                <input type="date" value={billForm.next_date} onChange={e => setBillForm({ ...billForm, next_date: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button className="primary" onClick={saveBill} disabled={busy} style={{ flex: 1, padding: '10px' }}>
                  {busy ? 'Saving…' : 'Finish setup →'}
                </button>
                <button onClick={skip} style={{ padding: '10px 14px', fontSize: 13 }}>Skip</button>
              </div>
            </div>
          )}
        </div>

        {/* Skip all */}
        <div style={{ textAlign: 'center' }}>
          <button onClick={skip} style={{ fontSize: 12, color: 'var(--color-text-muted)', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}>
            Skip setup — I'll add data manually
          </button>
        </div>
      </div>
    </div>
  );
}
