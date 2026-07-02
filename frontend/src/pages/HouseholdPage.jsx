import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';

export default function HouseholdPage() {
  const { user, household } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ email: '', password: '' });
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  // Per-member editing state: { [memberId]: { role?, password?, busy, error, open } }
  const [memberState, setMemberState] = useState({});

  useEffect(() => {
    if (!isAdmin) return;
    api.getMembers()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [isAdmin]);

  const setMs = (id, patch) =>
    setMemberState(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const ms = (id) => memberState[id] || {};

  // ── Invite ──────────────────────────────────────────────────────────────
  const invite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteMsg('');
    setInviteBusy(true);
    try {
      const res = await api.inviteFamilyMember(inviteForm);
      setMembers(m => [...m, res.user]);
      setInviteMsg(`${inviteForm.email} added as a read-only member. Share the password with them directly.`);
      setInviteForm({ email: '', password: '' });
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteBusy(false);
    }
  };

  // ── Change role ──────────────────────────────────────────────────────────
  const changeRole = async (id, newRole) => {
    setMs(id, { busy: true, error: '' });
    try {
      const res = await api.updateMember(id, { role: newRole });
      setMembers(m => m.map(x => x.id === id ? { ...x, role: res.user.role } : x));
      setMs(id, { busy: false });
    } catch (err) {
      setMs(id, { busy: false, error: err.message });
    }
  };

  // ── Reset password ───────────────────────────────────────────────────────
  const resetPassword = async (id) => {
    const newPw = ms(id).newPassword || '';
    if (newPw.length < 8) {
      setMs(id, { error: 'Password must be at least 8 characters' });
      return;
    }
    setMs(id, { busy: true, error: '' });
    try {
      await api.updateMember(id, { password: newPw });
      setMs(id, { busy: false, newPassword: '', passwordSuccess: true });
      setTimeout(() => setMs(id, { passwordSuccess: false }), 3000);
    } catch (err) {
      setMs(id, { busy: false, error: err.message });
    }
  };

  // ── Remove ───────────────────────────────────────────────────────────────
  const remove = async (id, email) => {
    if (!confirm(`Remove ${email} from the household? They will no longer be able to log in.`)) return;
    setMs(id, { busy: true, error: '' });
    try {
      await api.removeMember(id);
      setMembers(m => m.filter(x => x.id !== id));
    } catch (err) {
      setMs(id, { busy: false, error: err.message });
    }
  };

  // ── Read-only view ───────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Household</h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          <strong>{household?.name}</strong> · You have read-only access. Contact the admin to make changes.
        </div>
      </div>
    );
  }

  const otherMembers = members.filter(m => m.id !== user.id);
  const self = members.find(m => m.id === user.id);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Household</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        {household?.name} · You are the admin.
      </p>

      {/* ── Current members ─────────────────────────────────────────── */}
      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>Members</h3>

      {/* Self — read-only row */}
      {self && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{self.email}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Admin · you
              </div>
            </div>
          </div>
        </div>
      )}

      {loadingMembers && (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '0.5rem 0' }}>Loading members…</div>
      )}

      {!loadingMembers && otherMembers.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '0.5rem 0 1rem' }}>
          No other members yet. Add one below.
        </div>
      )}

      {otherMembers.map(m => {
        const state = ms(m.id);
        const isOpen = !!state.open;
        return (
          <div key={m.id} style={{ ...cardStyle, marginBottom: 8 }}>
            {/* Member header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{m.email}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {m.role === 'admin' ? 'Admin' : 'Read-only'}
                  {' · '}Added {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <button
                onClick={() => setMs(m.id, { open: !isOpen, error: '', newPassword: '' })}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {isOpen ? 'Close' : 'Manage'}
              </button>
            </div>

            {/* Expandable management panel */}
            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {state.error && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-danger)', background: 'var(--color-background-danger)', borderRadius: 6, padding: '6px 10px' }}>
                    {state.error}
                  </div>
                )}

                {/* Role */}
                <div>
                  <div style={labelStyle}>Access level</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {['viewer', 'admin'].map(r => (
                      <button
                        key={r}
                        disabled={state.busy || m.role === r}
                        onClick={() => changeRole(m.id, r)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          fontSize: 12,
                          borderRadius: 6,
                          cursor: m.role === r ? 'default' : 'pointer',
                          background: m.role === r ? 'var(--color-text-primary)' : 'transparent',
                          color: m.role === r ? 'var(--color-background-primary)' : 'var(--color-text-secondary)',
                          border: `0.5px solid ${m.role === r ? 'transparent' : 'var(--color-border-secondary)'}`,
                        }}
                      >
                        {r === 'viewer' ? 'Read-only' : 'Admin'}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {m.role === 'viewer'
                      ? 'Can view everything but cannot add, edit, or delete.'
                      : 'Full access — same as you.'}
                  </div>
                </div>

                {/* Reset password */}
                <div>
                  <div style={labelStyle}>Reset password</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      type="text"
                      placeholder="New password (min 8 chars)"
                      value={state.newPassword || ''}
                      onChange={e => setMs(m.id, { newPassword: e.target.value, passwordSuccess: false })}
                      style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                    />
                    <button
                      onClick={() => resetPassword(m.id)}
                      disabled={state.busy || !state.newPassword}
                      style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap' }}
                    >
                      {state.busy ? '…' : 'Set'}
                    </button>
                  </div>
                  {state.passwordSuccess && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-success)', marginTop: 4 }}>
                      Password updated. Share the new password with them directly.
                    </div>
                  )}
                </div>

                {/* Remove */}
                <div style={{ paddingTop: 4 }}>
                  <button
                    onClick={() => remove(m.id, m.email)}
                    disabled={state.busy}
                    style={{ fontSize: 12, color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)', width: '100%', padding: '7px' }}
                  >
                    Remove {m.email} from household
                  </button>
                </div>

              </div>
            )}
          </div>
        );
      })}

      <hr style={{ border: 'none', borderTop: '0.5px solid var(--color-border-tertiary)', margin: '1.25rem 0' }} />

      {/* ── Invite new member ──────────────────────────────────────── */}
      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Add a family member</h3>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
        New members start as read-only. You can change their access level above after adding them.
      </p>

      {inviteError && (
        <div style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          {inviteError}
        </div>
      )}
      {inviteMsg && (
        <div style={{ background: 'var(--color-background-success)', color: 'var(--color-text-success)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          {inviteMsg}
        </div>
      )}

      <form onSubmit={invite} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={labelStyle}>Email</div>
          <input
            type="email"
            required
            value={inviteForm.email}
            onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="family@example.com"
          />
        </div>
        <div>
          <div style={labelStyle}>Temporary password</div>
          <input
            type="text"
            required
            minLength={8}
            value={inviteForm.password}
            onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })}
            placeholder="At least 8 characters — share this with them"
          />
        </div>
        <button className="primary" type="submit" disabled={inviteBusy} style={{ marginTop: 4 }}>
          {inviteBusy ? 'Adding…' : 'Add member'}
        </button>
      </form>
    </div>
  );
}

const cardStyle = {
  background: 'var(--color-background-primary)',
  border: '0.5px solid var(--color-border-tertiary)',
  borderRadius: 12,
  padding: '12px 14px',
  marginBottom: 8,
};

const labelStyle = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  marginBottom: 2,
};
