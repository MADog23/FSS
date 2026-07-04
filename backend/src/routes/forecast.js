const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { runForecast } = require('../engine/forecast');

const forecastRouter = express.Router();
const scenarioRouter = express.Router();

// Helper: load all household financial data
async function loadHouseholdData(householdId) {
  const [accounts, income, bills, creditCards] = await Promise.all([
    db.query('SELECT * FROM accounts WHERE household_id = $1', [householdId]),
    db.query('SELECT * FROM income_events WHERE household_id = $1', [householdId]),
    db.query('SELECT * FROM bill_events WHERE household_id = $1', [householdId]),
    db.query('SELECT * FROM credit_cards WHERE household_id = $1', [householdId]),
  ]);

  const billIds = bills.rows.map(b => b.id);
  const cardIds = creditCards.rows.map(c => c.id);

  const incomeIds = income.rows.map(i => i.id);

  const [paidMarksRes, overridesRes, incomeOverridesRes] = await Promise.all([
    billIds.length
      ? db.query('SELECT * FROM bill_payment_marks WHERE bill_id = ANY($1::uuid[])', [billIds])
      : { rows: [] },
    cardIds.length
      ? db.query('SELECT * FROM credit_card_cycle_overrides WHERE credit_card_id = ANY($1::uuid[])', [cardIds])
      : { rows: [] },
    incomeIds.length
      ? db.query('SELECT * FROM income_event_overrides WHERE income_event_id = ANY($1::uuid[])', [incomeIds])
      : { rows: [] },
  ]);

  const billPaidMarks = {};
  for (const mark of paidMarksRes.rows) {
    if (!billPaidMarks[mark.bill_id]) billPaidMarks[mark.bill_id] = new Set();
    billPaidMarks[mark.bill_id].add(new Date(mark.occurrence_date).toISOString().slice(0, 10));
  }

  const ccOverrides = {};
  for (const ov of overridesRes.rows) {
    if (!ccOverrides[ov.credit_card_id]) ccOverrides[ov.credit_card_id] = [];
    ccOverrides[ov.credit_card_id].push({ due_date: ov.due_date, override_amount: ov.override_amount });
  }

  const incomeOverrides = {};
  for (const ov of incomeOverridesRes.rows) {
    if (!incomeOverrides[ov.income_event_id]) incomeOverrides[ov.income_event_id] = [];
    incomeOverrides[ov.income_event_id].push({ occurrence_date: ov.occurrence_date, override_amount: ov.override_amount });
  }

  // Load completions (v1.5.0+)
  const completionsRes = await db.query(
    `SELECT * FROM event_completions WHERE household_id = $1
     AND occurrence_date >= (CURRENT_DATE - INTERVAL '7 days')`,
    [householdId]
  );

  return {
    accounts: accounts.rows,
    income: income.rows,
    bills: bills.rows,
    creditCards: creditCards.rows,
    completions: completionsRes.rows,
    billPaidMarks,
    ccOverrides,
    incomeOverrides,
  };
}

// GET /forecast?horizon=30
// Runs the deterministic forecast for the household
forecastRouter.get('/', requireAuth, async (req, res) => {
  const horizonDays = parseInt(req.query.horizon) || 30;
  if (![30, 60, 90].includes(horizonDays) && (horizonDays < 1 || horizonDays > 365)) {
    return res.status(400).json({ error: 'horizon must be 30, 60, 90, or a number between 1 and 365' });
  }

  try {
    const data = await loadHouseholdData(req.user.householdId);
    const result = runForecast(data, horizonDays);

    // Detect account ID mismatches — events whose accountId doesn't match any account.
    // This is the most common cause of the buffer not deducting predicted costs.
    const accountIds = new Set(data.accounts.map(a => a.id));
    const orphanedEvents = result.events.filter(e => e.accountId && !accountIds.has(e.accountId));
    if (orphanedEvents.length > 0) {
      result._warnings = result._warnings || [];
      result._warnings.push({
        type: 'orphaned_events',
        message: `${orphanedEvents.length} event(s) reference account IDs that do not exist — their amounts will not affect any balance. Check that bills, income, and cards reference valid accounts.`,
        affected: orphanedEvents.map(e => ({ name: e.name, accountId: e.accountId, date: e.date })),
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Forecast failed' });
  }
});

// POST /forecast/simulate
// Runs forecast with scenario overlays (not persisted)
forecastRouter.post('/simulate', requireAuth, async (req, res) => {
  const { horizonDays = 30, overlays = [] } = req.body;

  try {
    const data = await loadHouseholdData(req.user.householdId);
    const result = runForecast(data, horizonDays, overlays);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// ── Scenarios ──────────────────────────────────────────────────────────────

// GET /scenarios
scenarioRouter.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, json_agg(se.*) as events
     FROM scenarios s
     LEFT JOIN scenario_events se ON se.scenario_id = s.id
     WHERE s.household_id = $1
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [req.user.householdId]
  );
  res.json(rows);
});

// POST /scenarios — save a scenario
scenarioRouter.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, events = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [scenario] } = await client.query(
      'INSERT INTO scenarios (household_id, name, created_by) VALUES ($1, $2, $3) RETURNING *',
      [req.user.householdId, name, req.user.userId]
    );
    for (const ev of events) {
      await client.query(
        'INSERT INTO scenario_events (scenario_id, name, amount, event_type, event_date, account_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [scenario.id, ev.name, ev.amount, ev.event_type, ev.event_date, ev.account_id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(scenario);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save scenario' });
  } finally {
    client.release();
  }
});

// DELETE /scenarios/:id
scenarioRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rowCount } = await db.query(
    'DELETE FROM scenarios WHERE id = $1 AND household_id = $2',
    [req.params.id, req.user.householdId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Scenario not found' });
  res.json({ deleted: true });
});

// GET /scenarios/:id/forecast — run forecast with a saved scenario
scenarioRouter.get('/:id/forecast', requireAuth, async (req, res) => {
  const horizonDays = parseInt(req.query.horizon) || 30;

  try {
    const { rows: [scenario] } = await db.query(
      'SELECT * FROM scenarios WHERE id = $1 AND household_id = $2',
      [req.params.id, req.user.householdId]
    );
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const { rows: overlays } = await db.query(
      'SELECT * FROM scenario_events WHERE scenario_id = $1',
      [req.params.id]
    );

    const data = await loadHouseholdData(req.user.householdId);
    const result = runForecast(data, horizonDays, overlays);
    res.json({ ...result, scenarioId: scenario.id, scenarioName: scenario.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scenario forecast failed' });
  }
});

module.exports = { forecastRouter, scenarioRouter };
