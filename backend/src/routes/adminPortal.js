'use strict';
/**
 * Admin Portal API
 * Protected by ADMIN_SECRET environment variable.
 * Used by the admin portal frontend at /admin.
 *
 * All routes require: Authorization: Bearer <ADMIN_SECRET>
 */

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');

const router = express.Router();
const SALT_ROUNDS = 12;

// ── Auth middleware ────────────────────────────────────────────────────────
function requireAdminSecret(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Admin API not configured — set ADMIN_SECRET environment variable' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    return res.status(401).json({ error: 'Invalid admin secret' });
  }
  next();
}

router.use(requireAdminSecret);

// ── Overview / usage stats ─────────────────────────────────────────────────

// GET /admin/stats — app-wide usage summary
router.get('/stats', async (req, res) => {
  try {
    const [households, users, accounts, newToday, newThisWeek, alertPrefs] = await Promise.all([
      db.query('SELECT COUNT(*) FROM households WHERE is_disabled = FALSE'),
      db.query('SELECT COUNT(*) FROM users'),
      db.query('SELECT COUNT(*) FROM accounts'),
      db.query(`SELECT COUNT(*) FROM households WHERE created_at >= NOW() - INTERVAL '1 day'`),
      db.query(`SELECT COUNT(*) FROM households WHERE created_at >= NOW() - INTERVAL '7 days'`),
      db.query(`SELECT COUNT(*) FROM alert_preferences WHERE alert_email IS NOT NULL`),
    ]);

    // Households by forecast status (approximate — reads last_status from alert_prefs)
    const statusCounts = await db.query(
      `SELECT last_status, COUNT(*) FROM alert_preferences GROUP BY last_status`
    );

    res.json({
      totals: {
        households: parseInt(households.rows[0].count),
        users: parseInt(users.rows[0].count),
        accounts: parseInt(accounts.rows[0].count),
        householdsWithAlertEmail: parseInt(alertPrefs.rows[0].count),
      },
      growth: {
        newToday: parseInt(newToday.rows[0].count),
        newThisWeek: parseInt(newThisWeek.rows[0].count),
      },
      forecastStatus: statusCounts.rows.reduce((acc, r) => {
        acc[r.last_status || 'unknown'] = parseInt(r.count);
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── Household management ───────────────────────────────────────────────────

// GET /admin/households — list all households with summary info
router.get('/households', async (req, res) => {
  const { search } = req.query;
  try {
    const { rows } = await db.query(
      `SELECT
         h.id, h.name, h.created_at, h.is_disabled, h.disabled_reason,
         h.onboarding_complete,
         COUNT(DISTINCT u.id) AS member_count,
         COUNT(DISTINCT a.id) AS account_count,
         COUNT(DISTINCT be.id) AS bill_count,
         ap.last_status, ap.last_alerted_at, ap.alert_email
       FROM households h
       LEFT JOIN users u ON u.household_id = h.id
       LEFT JOIN accounts a ON a.household_id = h.id
       LEFT JOIN bill_events be ON be.household_id = h.id
       LEFT JOIN alert_preferences ap ON ap.household_id = h.id
       ${search ? `WHERE h.name ILIKE $1 OR EXISTS (
         SELECT 1 FROM users WHERE household_id = h.id AND email ILIKE $1
       )` : ''}
       GROUP BY h.id, ap.last_status, ap.last_alerted_at, ap.alert_email
       ORDER BY h.created_at DESC`,
      search ? [`%${search}%`] : []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch households' });
  }
});

// GET /admin/households/:id — detailed view of a single household
router.get('/households/:id', async (req, res) => {
  try {
    const [household, members, alertPrefs, recentNotifs] = await Promise.all([
      db.query(
        `SELECT h.*, ap.last_status, ap.alert_email, ap.alert_on_danger, ap.alert_on_warning
         FROM households h
         LEFT JOIN alert_preferences ap ON ap.household_id = h.id
         WHERE h.id = $1`,
        [req.params.id]
      ),
      db.query(
        'SELECT id, email, role, created_at FROM users WHERE household_id = $1 ORDER BY created_at',
        [req.params.id]
      ),
      db.query(
        'SELECT * FROM alert_preferences WHERE household_id = $1',
        [req.params.id]
      ),
      db.query(
        `SELECT * FROM household_notifications WHERE household_id = $1
         ORDER BY created_at DESC LIMIT 10`,
        [req.params.id]
      ),
    ]);

    if (!household.rows[0]) return res.status(404).json({ error: 'Household not found' });

    res.json({
      household: household.rows[0],
      members: members.rows,
      alertPrefs: alertPrefs.rows[0] || null,
      recentNotifications: recentNotifs.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch household' });
  }
});

// PATCH /admin/households/:id — enable/disable a household
router.patch('/households/:id', async (req, res) => {
  const { is_disabled, disabled_reason } = req.body;
  try {
    const { rows: [row] } = await db.query(
      `UPDATE households SET
         is_disabled = COALESCE($1, is_disabled),
         disabled_reason = $2
       WHERE id = $3 RETURNING id, name, is_disabled, disabled_reason`,
      [is_disabled, disabled_reason || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Household not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update household' });
  }
});

// POST /admin/households/:id/clear-alerts — reset alert dedup for a household
router.post('/households/:id/clear-alerts', async (req, res) => {
  try {
    await db.query(
      'UPDATE alert_preferences SET last_status = NULL, last_alerted_at = NULL WHERE household_id = $1',
      [req.params.id]
    );
    res.json({ cleared: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear alerts' });
  }
});

// ── User support ───────────────────────────────────────────────────────────

// POST /admin/users/:id/reset-password — reset any user's password
router.post('/users/:id/reset-password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows: [user] } = await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email, role',
      [passwordHash, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── Announcements ──────────────────────────────────────────────────────────

// GET /admin/announcements
router.get('/announcements', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM system_announcements ORDER BY published_at DESC LIMIT 20'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// POST /admin/announcements — publish to all households
router.post('/announcements', async (req, res) => {
  const { type = 'info', title, body, expires_at } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (!['update', 'maintenance', 'changelog', 'info'].includes(type)) {
    return res.status(400).json({ error: 'type must be update, maintenance, changelog, or info' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [announcement] } = await client.query(
      `INSERT INTO system_announcements (type, title, body, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [type, title, body, expires_at || null]
    );

    const { rows: households } = await client.query(
      'SELECT id FROM households WHERE is_disabled = FALSE'
    );

    if (households.length > 0) {
      const values = households.map((h, i) => {
        const base = i * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      }).join(', ');
      const params = households.flatMap(h => [h.id, announcement.id, type, title, body]);
      await client.query(
        `INSERT INTO household_notifications (household_id, announcement_id, type, title, body) VALUES ${values}`,
        params
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ announcement, delivered_to: households.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to publish announcement' });
  } finally {
    client.release();
  }
});

// DELETE /admin/announcements/:id
router.delete('/announcements/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM system_announcements WHERE id = $1',
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Announcement not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = { router, requireAdminSecret };
