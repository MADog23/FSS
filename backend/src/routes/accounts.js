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

// PATCH /accounts/:id/balance — quick balance update (logs previous value)
router.patch('/:id/balance', requireAuth, requireAdmin, async (req, res) => {
  const newBalance = parseFloat(req.body.balance);
  if (Number.isNaN(newBalance)) {
    return res.status(400).json({ error: 'balance must be a number' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [current] } = await client.query(
      'SELECT * FROM accounts WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Account not found' }); }

    // Log the change for audit trail
    await client.query(
      'INSERT INTO account_balance_updates (account_id, previous_balance, new_balance, updated_by) VALUES ($1,$2,$3,$4)',
      [req.params.id, current.balance, newBalance, req.user.userId]
    );

    const { rows: [updated] } = await client.query(
      'UPDATE accounts SET balance = $1 WHERE id = $2 RETURNING *',
      [newBalance, req.params.id]
    );
    await client.query('COMMIT');
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update balance' });
  } finally {
    client.release();
  }
});

// GET /accounts/:id/balance-history — recent balance updates
router.get('/:id/balance-history', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT abu.* FROM account_balance_updates abu
       JOIN accounts a ON a.id = abu.account_id
       WHERE abu.account_id = $1 AND a.household_id = $2
       ORDER BY abu.updated_at DESC LIMIT 10`,
      [req.params.id, req.user.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch balance history' });
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
