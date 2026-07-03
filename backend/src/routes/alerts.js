const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkAndSendAlerts } = require('../services/alerts');

const router = express.Router();

// GET /alerts — get alert preferences for this household
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: [prefs] } = await db.query(
      'SELECT * FROM alert_preferences WHERE household_id = $1',
      [req.user.householdId]
    );
    // Return defaults if not yet configured
    res.json(prefs || {
      alert_email: null,
      alert_on_danger: true,
      alert_on_warning: false,
      last_alerted_at: null,
      last_status: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch alert preferences' });
  }
});

// PUT /alerts — create or update alert preferences
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const { alert_email, alert_on_danger = true, alert_on_warning = false } = req.body;

  try {
    const { rows: [prefs] } = await db.query(
      `INSERT INTO alert_preferences (household_id, alert_email, alert_on_danger, alert_on_warning)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (household_id) DO UPDATE SET
         alert_email = EXCLUDED.alert_email,
         alert_on_danger = EXCLUDED.alert_on_danger,
         alert_on_warning = EXCLUDED.alert_on_warning,
         -- Reset last_status so an alert fires on the next forecast check
         -- if the current situation still warrants one
         last_status = NULL
       RETURNING *`,
      [req.user.householdId, alert_email || null, alert_on_danger, alert_on_warning]
    );
    res.json(prefs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save alert preferences' });
  }
});

// POST /alerts/test — send a test alert to the configured email
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  const { rows: [prefs] } = await db.query(
    'SELECT * FROM alert_preferences WHERE household_id = $1',
    [req.user.householdId]
  );
  if (!prefs?.alert_email) {
    return res.status(400).json({ error: 'No alert email configured' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(400).json({ error: 'Email service not configured — add RESEND_API_KEY to your environment variables' });
  }
  // Force a check (bypasses last_status dedup by temporarily clearing it)
  await db.query(
    'UPDATE alert_preferences SET last_status = NULL WHERE household_id = $1',
    [req.user.householdId]
  );
  await checkAndSendAlerts(req.user.householdId);
  res.json({ sent: true, to: prefs.alert_email });
});

module.exports = router;
