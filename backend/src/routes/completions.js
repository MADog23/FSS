const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /completions?horizon=30
// Returns all completions for the household within a date range
router.get('/', requireAuth, async (req, res) => {
  const days = parseInt(req.query.horizon) || 90;
  const since = new Date();
  since.setDate(since.getDate() - 7); // include a week back so recently completed past events show
  const until = new Date();
  until.setDate(until.getDate() + days);

  try {
    const { rows } = await db.query(
      `SELECT * FROM event_completions
       WHERE household_id = $1
         AND occurrence_date BETWEEN $2 AND $3
       ORDER BY occurrence_date`,
      [req.user.householdId, since.toISOString().slice(0, 10), until.toISOString().slice(0, 10)]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

// POST /completions — mark an event as complete (optionally with an edited amount)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { income_event_id, bill_event_id, credit_card_id, occurrence_date, actual_amount } = req.body;

  // Validate exactly one source
  const sources = [income_event_id, bill_event_id, credit_card_id].filter(Boolean);
  if (sources.length !== 1) {
    return res.status(400).json({ error: 'Provide exactly one of: income_event_id, bill_event_id, credit_card_id' });
  }
  if (!occurrence_date) {
    return res.status(400).json({ error: 'occurrence_date is required' });
  }

  try {
    // Build the upsert — if already completed, update the actual_amount
    const { rows: [row] } = await db.query(
      `INSERT INTO event_completions
         (household_id, income_event_id, bill_event_id, credit_card_id,
          occurrence_date, actual_amount, completed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (income_event_id,  occurrence_date) WHERE income_event_id IS NOT NULL
       DO UPDATE SET actual_amount = EXCLUDED.actual_amount, completed_at = NOW(), completed_by = EXCLUDED.completed_by
       RETURNING *`,
      [
        req.user.householdId,
        income_event_id || null,
        bill_event_id || null,
        credit_card_id || null,
        occurrence_date,
        actual_amount != null ? parseFloat(actual_amount) : null,
        req.user.userId,
      ]
    );
    res.status(201).json(row);
  } catch (err) {
    // ON CONFLICT only handles one constraint at a time in Postgres — handle the other two
    if (err.code === '23505') {
      try {
        const { rows: [row] } = await db.query(
          `UPDATE event_completions SET
             actual_amount = $1, completed_at = NOW(), completed_by = $2
           WHERE household_id = $3
             AND occurrence_date = $4
             AND (
               (bill_event_id = $5 AND $5 IS NOT NULL) OR
               (credit_card_id = $6 AND $6 IS NOT NULL)
             )
           RETURNING *`,
          [
            actual_amount != null ? parseFloat(actual_amount) : null,
            req.user.userId,
            req.user.householdId,
            occurrence_date,
            bill_event_id || null,
            credit_card_id || null,
          ]
        );
        return res.status(200).json(row);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Failed to update completion' });
      }
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to mark event complete' });
  }
});

// PATCH /completions/:id — update the actual amount on an existing completion
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { actual_amount } = req.body;
  try {
    const { rows: [row] } = await db.query(
      `UPDATE event_completions SET actual_amount = $1
       WHERE id = $2 AND household_id = $3 RETURNING *`,
      [actual_amount != null ? parseFloat(actual_amount) : null, req.params.id, req.user.householdId]
    );
    if (!row) return res.status(404).json({ error: 'Completion not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update completion' });
  }
});

// DELETE /completions/:id — unmark a completed event
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM event_completions WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Completion not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove completion' });
  }
});

module.exports = router;
