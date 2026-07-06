'use strict';
/**
 * Admin announcement API — protected by ADMIN_SECRET environment variable.
 *
 * Usage (from curl or Postman):
 *   POST /admin/announcements
 *   Authorization: Bearer <your ADMIN_SECRET value>
 *   Content-Type: application/json
 *
 *   {
 *     "type": "update",          // update | maintenance | changelog | info
 *     "title": "v1.6.0 released",
 *     "body": "Added notification center and onboarding flow.",
 *     "expires_at": null         // optional ISO date string
 *   }
 *
 * This creates a system_announcement and fans out a household_notification
 * to every household so their in-app feed gets the message immediately.
 *
 * Set ADMIN_SECRET in Railway environment variables — any long random string.
 * Never commit it to source control.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

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

// POST /admin/announcements — publish a new announcement to all households
router.post('/announcements', requireAdminSecret, async (req, res) => {
  const { type = 'info', title, body, expires_at } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }
  if (!['update', 'maintenance', 'changelog', 'info'].includes(type)) {
    return res.status(400).json({ error: 'type must be update, maintenance, changelog, or info' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Create the announcement
    const { rows: [announcement] } = await client.query(
      `INSERT INTO system_announcements (type, title, body, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [type, title, body, expires_at || null]
    );

    // Fan out to all households
    const { rows: households } = await client.query('SELECT id FROM households');
    if (households.length > 0) {
      const values = households.map((h, i) => {
        const base = i * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      }).join(', ');

      const params = households.flatMap(h => [
        h.id, announcement.id, type, title, body,
      ]);

      await client.query(
        `INSERT INTO household_notifications
           (household_id, announcement_id, type, title, body)
         VALUES ${values}`,
        params
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      announcement,
      delivered_to: households.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to publish announcement' });
  } finally {
    client.release();
  }
});

// GET /admin/announcements — list all announcements (for reference)
router.get('/announcements', requireAdminSecret, async (req, res) => {
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

// DELETE /admin/announcements/:id — remove an announcement and its notifications
router.delete('/announcements/:id', requireAdminSecret, async (req, res) => {
  try {
    // household_notifications with this announcement_id cascade-delete automatically
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

module.exports = router;
