const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── Income ────────────────────────────────────────────────────────────────
const incomeRouter = express.Router();

incomeRouter.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM income_events WHERE household_id = $1 ORDER BY next_date',
    [req.user.householdId]
  );
  res.json(rows);
});

incomeRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, amount, frequency, next_date, source_account_id } = req.body;
  if (!name || !amount || !frequency || !next_date || !source_account_id) {
    return res.status(400).json({ error: 'name, amount, frequency, next_date, source_account_id are required' });
  }
  try {
    const { rows: [row] } = await db.query(
      'INSERT INTO income_events (household_id, name, amount, frequency, next_date, source_account_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.householdId, name, amount, frequency, next_date, source_account_id]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create income event' });
  }
});

incomeRouter.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, amount, frequency, next_date, source_account_id } = req.body;
  try {
    const { rows: [row] } = await db.query(
      `UPDATE income_events SET
        name = COALESCE($1, name),
        amount = COALESCE($2, amount),
        frequency = COALESCE($3, frequency),
        next_date = COALESCE($4, next_date),
        source_account_id = COALESCE($5, source_account_id)
       WHERE id = $6 AND household_id = $7 RETURNING *`,
      [name, amount, frequency, next_date, source_account_id, req.params.id, req.user.householdId]
    );
    if (!row) return res.status(404).json({ error: 'Income event not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update income event' });
  }
});

incomeRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM income_events WHERE id = $1 AND household_id = $2',
    [req.params.id, req.user.householdId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── Income per-occurrence overrides (fluctuating pay) ─────────────────────

incomeRouter.get('/:id/overrides', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ieo.* FROM income_event_overrides ieo
       JOIN income_events ie ON ie.id = ieo.income_event_id
       WHERE ieo.income_event_id = $1 AND ie.household_id = $2
       ORDER BY ieo.occurrence_date`,
      [req.params.id, req.user.householdId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch income overrides' });
  }
});

incomeRouter.post('/:id/overrides', requireAuth, requireAdmin, async (req, res) => {
  const { occurrence_date, override_amount, note } = req.body;
  if (!occurrence_date || override_amount == null) {
    return res.status(400).json({ error: 'occurrence_date and override_amount are required' });
  }
  try {
    const { rows: [inc] } = await db.query(
      'SELECT id FROM income_events WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!inc) return res.status(404).json({ error: 'Income event not found' });

    const { rows: [row] } = await db.query(
      `INSERT INTO income_event_overrides (income_event_id, occurrence_date, override_amount, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (income_event_id, occurrence_date)
       DO UPDATE SET override_amount = EXCLUDED.override_amount, note = EXCLUDED.note
       RETURNING *`,
      [req.params.id, occurrence_date, override_amount, note || null]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set income override' });
  }
});

incomeRouter.delete('/:id/overrides/:overrideId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM income_event_overrides ieo
       USING income_events ie
       WHERE ieo.id = $1 AND ieo.income_event_id = ie.id
         AND ie.household_id = $2 AND ie.id = $3`,
      [req.params.overrideId, req.user.householdId, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Override not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete income override' });
  }
});

// ── Bills ─────────────────────────────────────────────────────────────────
const billsRouter = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

billsRouter.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM bill_events WHERE household_id = $1 ORDER BY next_date',
    [req.user.householdId]
  );
  res.json(rows);
});

billsRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  const amount = req.body.amount;
  const frequency = req.body.frequency;
  const next_date = req.body.next_date;
  const target_account_id = (req.body.target_account_id || '').trim();

  if (!name || !amount || !frequency || !next_date || !target_account_id) {
    return res.status(400).json({ error: 'name, amount, frequency, next_date, target_account_id are required' });
  }
  if (!UUID_RE.test(target_account_id)) {
    return res.status(400).json({ error: 'target_account_id must be a valid account ID — select an account from the dropdown rather than typing one' });
  }
  try {
    const { rows: [row] } = await db.query(
      'INSERT INTO bill_events (household_id, name, amount, frequency, next_date, target_account_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.householdId, name, amount, frequency, next_date, target_account_id]
    );
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'That account ID does not belong to your household' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

billsRouter.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, amount, frequency, next_date, target_account_id } = req.body;
  if (target_account_id && !UUID_RE.test(target_account_id.trim())) {
    return res.status(400).json({ error: 'target_account_id must be a valid account ID — select an account from the dropdown rather than typing one' });
  }
  try {
    const { rows: [row] } = await db.query(
      `UPDATE bill_events SET
        name = COALESCE($1, name),
        amount = COALESCE($2, amount),
        frequency = COALESCE($3, frequency),
        next_date = COALESCE($4, next_date),
        target_account_id = COALESCE($5, target_account_id)
       WHERE id = $6 AND household_id = $7 RETURNING *`,
      [name, amount, frequency, next_date, target_account_id ? target_account_id.trim() : target_account_id, req.params.id, req.user.householdId]
    );
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    res.json(row);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'That account ID does not belong to your household' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

billsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM bill_events WHERE id = $1 AND household_id = $2',
    [req.params.id, req.user.householdId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── Bill "already paid" marks ────────────────────────────────────────────
// Marks a single occurrence of a recurring (or one-time) bill as already
// paid, so the forecast engine skips that specific date when projecting.

billsRouter.get('/:id/paid-marks', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT bpm.* FROM bill_payment_marks bpm
     JOIN bill_events be ON be.id = bpm.bill_id
     WHERE bpm.bill_id = $1 AND be.household_id = $2
     ORDER BY bpm.occurrence_date`,
    [req.params.id, req.user.householdId]
  );
  res.json(rows);
});

billsRouter.post('/:id/paid-marks', requireAuth, requireAdmin, async (req, res) => {
  const { occurrence_date } = req.body;
  if (!occurrence_date) return res.status(400).json({ error: 'occurrence_date is required' });
  try {
    const { rows: [bill] } = await db.query(
      'SELECT id FROM bill_events WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const { rows: [row] } = await db.query(
      `INSERT INTO bill_payment_marks (bill_id, occurrence_date)
       VALUES ($1, $2)
       ON CONFLICT (bill_id, occurrence_date) DO NOTHING
       RETURNING *`,
      [req.params.id, occurrence_date]
    );
    res.status(201).json(row || { bill_id: req.params.id, occurrence_date, already_marked: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark bill as paid' });
  }
});

billsRouter.delete('/:id/paid-marks/:markId', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM bill_payment_marks bpm
     USING bill_events be
     WHERE bpm.id = $1 AND bpm.bill_id = be.id AND be.household_id = $2 AND be.id = $3`,
    [req.params.markId, req.user.householdId, req.params.id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Mark not found' });
  res.json({ deleted: true });
});

// ── Credit Cards ──────────────────────────────────────────────────────────
const cardsRouter = express.Router();

cardsRouter.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM credit_cards WHERE household_id = $1 ORDER BY created_at',
    [req.user.householdId]
  );
  res.json(rows);
});

cardsRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, balance, credit_limit, cycle_day_of_month, due_offset_days, payment_rule, minimum_payment, fixed_amount, payment_account_id } = req.body;
  if (!name || balance == null || !payment_account_id) {
    return res.status(400).json({ error: 'name, balance, and payment_account_id are required' });
  }
  try {
    const { rows: [row] } = await db.query(
      `INSERT INTO credit_cards (household_id, name, balance, credit_limit, cycle_day_of_month, due_offset_days, payment_rule, minimum_payment, fixed_amount, payment_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.householdId, name, balance, credit_limit || 0, cycle_day_of_month || 15, due_offset_days || 25, payment_rule || 'minimum', minimum_payment ?? null, fixed_amount || null, payment_account_id]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create credit card' });
  }
});

cardsRouter.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  // Coerce numeric fields defensively: empty string / NaN must become null/undefined,
  // never be sent to Postgres as NaN (which previously caused "Failed to update" 500s).
  const cleanNum = (v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = parseFloat(v);
    return Number.isNaN(n) ? undefined : n;
  };
  const cleanInt = (v) => {
    if (v === '' || v === undefined || v === null) return undefined;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  };

  const name = req.body.name || undefined;
  const balance = cleanNum(req.body.balance);
  const credit_limit = cleanNum(req.body.credit_limit);
  const cycle_day_of_month = cleanInt(req.body.cycle_day_of_month);
  const due_offset_days = cleanInt(req.body.due_offset_days);
  const payment_rule = req.body.payment_rule || undefined;
  const minimum_payment = req.body.minimum_payment === '' ? null : cleanNum(req.body.minimum_payment);
  const fixed_amount = req.body.fixed_amount === '' ? null : cleanNum(req.body.fixed_amount);
  const payment_account_id = req.body.payment_account_id || undefined;

  try {
    const { rows: [row] } = await db.query(
      `UPDATE credit_cards SET
        name = COALESCE($1, name),
        balance = COALESCE($2, balance),
        credit_limit = COALESCE($3, credit_limit),
        cycle_day_of_month = COALESCE($4, cycle_day_of_month),
        due_offset_days = COALESCE($5, due_offset_days),
        payment_rule = COALESCE($6, payment_rule),
        minimum_payment = $7,
        fixed_amount = $8,
        payment_account_id = COALESCE($9, payment_account_id)
       WHERE id = $10 AND household_id = $11 RETURNING *`,
      [name, balance, credit_limit, cycle_day_of_month, due_offset_days, payment_rule,
       minimum_payment === undefined ? null : minimum_payment,
       fixed_amount === undefined ? null : fixed_amount,
       payment_account_id, req.params.id, req.user.householdId]
    );
    if (!row) return res.status(404).json({ error: 'Card not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

cardsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM credit_cards WHERE id = $1 AND household_id = $2',
    [req.params.id, req.user.householdId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});

// ── Credit card per-cycle payment overrides ─────────────────────────────────
// Lets the user change a single upcoming payment's amount without changing
// the card's default payment rule.

cardsRouter.get('/:id/overrides', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT cco.* FROM credit_card_cycle_overrides cco
     JOIN credit_cards cc ON cc.id = cco.credit_card_id
     WHERE cco.credit_card_id = $1 AND cc.household_id = $2
     ORDER BY cco.due_date`,
    [req.params.id, req.user.householdId]
  );
  res.json(rows);
});

cardsRouter.post('/:id/overrides', requireAuth, requireAdmin, async (req, res) => {
  const { due_date, override_amount } = req.body;
  if (!due_date || override_amount == null) {
    return res.status(400).json({ error: 'due_date and override_amount are required' });
  }
  try {
    // Confirm the card belongs to this household
    const { rows: [card] } = await db.query(
      'SELECT id FROM credit_cards WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const { rows: [row] } = await db.query(
      `INSERT INTO credit_card_cycle_overrides (credit_card_id, due_date, override_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (credit_card_id, due_date) DO UPDATE SET override_amount = EXCLUDED.override_amount
       RETURNING *`,
      [req.params.id, due_date, override_amount]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set payment override' });
  }
});

cardsRouter.delete('/:id/overrides/:overrideId', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    `DELETE FROM credit_card_cycle_overrides cco
     USING credit_cards cc
     WHERE cco.id = $1 AND cco.credit_card_id = cc.id AND cc.household_id = $2 AND cc.id = $3`,
    [req.params.overrideId, req.user.householdId, req.params.id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Override not found' });
  res.json({ deleted: true });
});

module.exports = { incomeRouter, billsRouter, cardsRouter };
