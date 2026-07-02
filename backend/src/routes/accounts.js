const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const cleanNum = (v, fallback) => {
  if (v === '' || v === undefined || v === null) return fallback;
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
};

// GET /accounts
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM accounts WHERE household_id = $1 ORDER BY created_at',
      [req.user.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST /accounts
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, type = 'checking', balance = 0, warning_threshold, is_spendable = true } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows: [account] } = await db.query(
      'INSERT INTO accounts (household_id, name, type, balance, warning_threshold, is_spendable) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.householdId, name, type, cleanNum(balance, 0), warning_threshold === '' ? null : cleanNum(warning_threshold, null), is_spendable !== false && is_spendable !== 'false']
    );
    res.status(201).json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PUT /accounts/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const name = req.body.name || undefined;
  const type = req.body.type || undefined;
  const balance = req.body.balance === '' || req.body.balance === undefined ? undefined : cleanNum(req.body.balance, undefined);
  const warning_threshold = req.body.warning_threshold === '' ? null : cleanNum(req.body.warning_threshold, null);
  // is_spendable: only override if explicitly present in the payload
  const is_spendable = req.body.is_spendable === undefined
    ? undefined
    : (req.body.is_spendable !== false && req.body.is_spendable !== 'false');

  try {
    const { rows: [account] } = await db.query(
      `UPDATE accounts SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        balance = COALESCE($3, balance),
        warning_threshold = $4,
        is_spendable = COALESCE($5, is_spendable)
       WHERE id = $6 AND household_id = $7 RETURNING *`,
      [name, type, balance, warning_threshold, is_spendable, req.params.id, req.user.householdId]
    );
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /accounts/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM accounts WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Account not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
