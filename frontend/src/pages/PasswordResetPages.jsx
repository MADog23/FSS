import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const cardStyle = {
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 16,
  padding: '1.5rem',
};

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  background: 'var(--color-background-tertiary)',
};

const wordmark = (
  <div style={{ textAlign: 'center', marginBottom: 28 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 14px' }}>🏠</div>
    <div style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em' }}>Financial Safety</div>
  </div>
);

// ── Forgot Password Page ───────────────────────────────────────────────────
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {wordmark}
        <div style={cardStyle}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
              <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Check your email</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                If <strong>{email}</strong> is linked to an account, you'll receive a reset link within a minute. Check your spam folder if you don't see it.
              </div>
              <div style={{ marginTop: 20, fontSize: 13, color: 'var(--color-text-muted)' }}>
                The link expires in 30 minutes.
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, fontSize: 17, marginBottom: 4 }}>Forgot your password?</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Enter your account email and we'll send a reset link.</div>
              </div>
              {error && (
                <div style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Email address</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </div>
                <button type="submit" className="primary" disabled={loading} style={{ padding: '10px', marginTop: 4 }}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--color-text-info)', textDecoration: 'none' }}>← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Page ────────────────────────────────────────────────────
export function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {wordmark}
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-danger)' }}>Invalid reset link. Please request a new one.</div>
            <Link to="/forgot-password" style={{ display: 'block', marginTop: 14, fontSize: 13, color: 'var(--color-text-info)', textDecoration: 'none' }}>Request new link</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {wordmark}
        <div style={cardStyle}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 8 }}>Password updated</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>You can now sign in with your new password.</div>
              <Link to="/login">
                <button className="primary" style={{ width: '100%', padding: '10px' }}>Sign in →</button>
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, fontSize: 17, marginBottom: 4 }}>Set new password</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Choose a strong password with at least 8 characters.</div>
              </div>
              {error && (
                <div style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>New password</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>Confirm password</label>
                  <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Same password again" autoComplete="new-password" />
                </div>
                <button type="submit" className="primary" disabled={loading} style={{ padding: '10px', marginTop: 4 }}>
                  {loading ? 'Updating…' : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--color-text-info)', textDecoration: 'none' }}>← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
