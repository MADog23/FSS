const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

// POST /auth/register
// Creates a new household + admin user
router.post('/register', async (req, res) => {
  const { householdName, email, password } = req.body;
  if (!householdName || !email || !password) {
    return res.status(400).json({ error: 'householdName, email, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [household] } = await client.query(
      'INSERT INTO households (name) VALUES ($1) RETURNING *',
      [householdName]
    );
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await client.query(
      'INSERT INTO users (household_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, household_id',
      [household.id, email.toLowerCase(), passwordHash, 'admin']
    );
    await client.query('COMMIT');

    const token = signToken({ userId: user.id, householdId: household.id, role: user.role });
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role }, household });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { rows } = await db.query(
      'SELECT u.*, h.name as household_name FROM users u JOIN households h ON h.id = u.household_id WHERE u.email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ userId: user.id, householdId: user.household_id, role: user.role });
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
      household: { id: user.household_id, name: user.household_name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, h.id as household_id, h.name as household_name,
              h.onboarding_complete
       FROM users u JOIN households h ON h.id = u.household_id WHERE u.id = $1`,
      [req.user.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /auth/complete-onboarding — mark onboarding done for this household
router.post('/complete-onboarding', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query(
      'UPDATE households SET onboarding_complete = TRUE WHERE id = $1',
      [req.user.householdId]
    );
    res.json({ onboarding_complete: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// POST /auth/invite — admin invites a viewer
router.post('/invite', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await db.query(
      'INSERT INTO users (household_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
      [req.user.householdId, email.toLowerCase(), passwordHash, 'viewer']
    );
    res.status(201).json({ user });
  } catch (err) {
    if (err.constraint === 'users_email_key') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    console.error(err);
    res.status(500).json({ error: 'Invite failed' });
  }
});

// GET /auth/members — list all users in the household (admin only)
router.get('/members', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  try {
    const { rows } = await db.query(
      'SELECT id, email, role, created_at FROM users WHERE household_id = $1 ORDER BY created_at',
      [req.user.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// PATCH /auth/members/:id — change role or reset password (admin only)
// Cannot demote yourself or change your own role.
router.patch('/members/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { role, password } = req.body;
  if (!role && !password) return res.status(400).json({ error: 'Provide role or password to update' });

  // Prevent admin from changing their own role (would lock them out)
  if (role && req.params.id === req.user.userId) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  try {
    // Confirm the target user belongs to this household
    const { rows: [target] } = await db.query(
      'SELECT id, role FROM users WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!target) return res.status(404).json({ error: 'Member not found' });

    if (role && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'role must be admin or viewer' });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (role) { updates.push(`role = $${idx++}`); values.push(role); }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      updates.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    values.push(req.params.id, req.user.householdId);
    const { rows: [updated] } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx++} AND household_id = $${idx++} RETURNING id, email, role`,
      values
    );
    res.json({ user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /auth/members/:id — remove a member (admin only, cannot remove self)
router.delete('/members/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  if (req.params.id === req.user.userId) return res.status(400).json({ error: 'You cannot remove yourself' });

  try {
    const { rowCount } = await db.query(
      'DELETE FROM users WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
