'use strict';
const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /notifications — fetch this household's notification feed
// Returns unread first, then read, capped at 50 total
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM household_notifications
       WHERE household_id = $1
       ORDER BY read_at IS NOT NULL, created_at DESC
       LIMIT 50`,
      [req.user.householdId]
    );
    const unreadCount = rows.filter(n => !n.read_at).length;
    res.json({ notifications: rows, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /notifications/unread-count — lightweight poll for the badge
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS count FROM household_notifications
       WHERE household_id = $1 AND read_at IS NULL`,
      [req.user.householdId]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PATCH /notifications/:id/read — mark a single notification as read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `UPDATE household_notifications SET read_at = NOW()
       WHERE id = $1 AND household_id = $2 AND read_at IS NULL RETURNING *`,
      [req.params.id, req.user.householdId]
    );
    res.json(row || { already_read: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

// POST /notifications/read-all — mark all as read
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE household_notifications SET read_at = NOW()
       WHERE household_id = $1 AND read_at IS NULL`,
      [req.user.householdId]
    );
    res.json({ marked: rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

// DELETE /notifications/:id — delete a notification
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM household_notifications WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
