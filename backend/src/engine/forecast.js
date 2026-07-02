'use strict';

/**
 * Financial Safety Forecasting Engine
 * Deterministic event-driven ledger simulator.
 *
 * All financial activity is converted into discrete events,
 * sorted chronologically, and replayed to produce balance snapshots.
 */

const MS_PER_DAY = 86400000;

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Expand recurring income/bill events into discrete dated entries
 * within [startDate, endDate]. paidDates (Set of 'YYYY-MM-DD') are skipped.
 */
function expandRecurring(name, amount, frequency, nextDate, accountId, type, startDate, endDate, meta = {}, paidDates = null) {
  const events = [];
  let d = startOfDay(new Date(nextDate));

  while (d <= endDate) {
    const dateKey = d.toISOString().slice(0, 10);
    const isPaid = paidDates && paidDates.has(dateKey);
    if (d >= startDate && !isPaid) {
      events.push({
        date: new Date(d),
        type,
        name,
        amount: parseFloat(amount),
        accountId,
        ...meta,
      });
    }
    if (frequency === 'weekly') d = addDays(d, 7);
    else if (frequency === 'biweekly') d = addDays(d, 14);
    else if (frequency === 'monthly') d = addMonths(d, 1);
    else break; // once
  }
  return events;
}

/**
 * Generate credit card payment events for upcoming cycles.
 * overrides: array of { due_date, override_amount } for specific cycles.
 */
function expandCreditCardPayments(card, startDate, endDate, overrides = []) {
  const events = [];
  let cycleDate = new Date(startDate.getFullYear(), startDate.getMonth(), card.cycle_day_of_month);
  if (cycleDate < startDate) cycleDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, card.cycle_day_of_month);

  const overrideMap = new Map(
    overrides.map(o => [new Date(o.due_date).toISOString().slice(0, 10), parseFloat(o.override_amount)])
  );

  let remainingBalance = parseFloat(card.balance);
  const maxCycles = 24;

  for (let i = 0; i < maxCycles; i++) {
    if (cycleDate > endDate || remainingBalance <= 0) break;

    const dueDate = addDays(cycleDate, parseInt(card.due_offset_days));
    const dueKey = dueDate.toISOString().slice(0, 10);
    let payment = 0;

    if (overrideMap.has(dueKey)) {
      payment = overrideMap.get(dueKey);
    } else if (card.payment_rule === 'minimum') {
      // Use explicit minimum_payment if set, otherwise fall back to 2% calculated minimum
      payment = card.minimum_payment != null && card.minimum_payment !== ''
        ? parseFloat(card.minimum_payment)
        : Math.max(25, Math.round(remainingBalance * 0.02 * 100) / 100);
    } else if (card.payment_rule === 'statement') {
      payment = remainingBalance;
    } else if (card.payment_rule === 'fixed') {
      payment = parseFloat(card.fixed_amount) || 0;
    }

    payment = Math.min(payment, remainingBalance);

    if (payment > 0 && dueDate <= endDate && dueDate >= startDate) {
      events.push({
        date: new Date(dueDate),
        type: 'cc_payment',
        name: `${card.name} payment`,
        amount: payment,
        accountId: card.payment_account_id,
        cardId: card.id,
        isOverride: overrideMap.has(dueKey),
      });
      remainingBalance = Math.max(0, remainingBalance - payment);
    }

    cycleDate = new Date(cycleDate.getFullYear(), cycleDate.getMonth() + 1, card.cycle_day_of_month);
  }

  return events;
}

/**
 * Build the full sorted event list from all financial data.
 * data.billPaidMarks: { [billId]: Set('YYYY-MM-DD') }
 * data.ccOverrides: { [cardId]: [{ due_date, override_amount }] }
 */
function buildEvents(data, startDate, endDate, scenarioOverlays = []) {
  const events = [];
  const billPaidMarks = data.billPaidMarks || {};
  const ccOverrides = data.ccOverrides || {};

  // Income
  for (const inc of data.income) {
    events.push(...expandRecurring(
      inc.name, inc.amount, inc.frequency,
      inc.next_date, inc.source_account_id,
      'income', startDate, endDate,
      { sourceId: inc.id }
    ));
  }

  // Bills
  for (const bill of data.bills) {
    events.push(...expandRecurring(
      bill.name, bill.amount, bill.frequency,
      bill.next_date, bill.target_account_id,
      'expense', startDate, endDate,
      { sourceId: bill.id },
      billPaidMarks[bill.id] || null
    ));
  }

  // Credit card payments
  for (const card of data.creditCards) {
    events.push(...expandCreditCardPayments(card, startDate, endDate, ccOverrides[card.id] || []));
  }

  // Scenario overlays
  for (const ov of scenarioOverlays) {
    const d = startOfDay(new Date(ov.event_date));
    if (d >= startDate && d <= endDate) {
      events.push({
        date: d,
        type: ov.event_type,
        name: `[Scenario] ${ov.name}`,
        amount: parseFloat(ov.amount),
        accountId: ov.account_id,
        isScenario: true,
      });
    }
  }

  // Sort chronologically; on same day, income before expenses
  events.sort((a, b) => {
    const diff = a.date - b.date;
    if (diff !== 0) return diff;
    if (a.type === 'income' && b.type !== 'income') return -1;
    if (b.type === 'income' && a.type !== 'income') return 1;
    return 0;
  });

  return events;
}

/**
 * Run the forecast simulation.
 *
 * Free Cash is scoped to "spendable" accounts only (accounts.is_spendable !== false).
 * Non-spendable accounts (e.g. savings earmarked as off-limits) still count toward
 * danger/warning checks — going negative anywhere is still danger — but their
 * balance does not inflate the household's available free cash figure.
 *
 * Returns:
 *   status: 'safe' | 'warning' | 'danger'
 *   freeCash: number (min SPENDABLE household balance over horizon, clamped to 0)
 *   spendableTotal: number (current spendable balance, for explainability)
 *   excludedTotal: number (current balance held in non-spendable accounts)
 *   deficit: number (amount below 0 if negative, spendable scope)
 *   dangerDate, warningDate, deficitAccountId, firstFailureAmount
 *   minimumDepositNeeded: number
 *   minHouseholdDate: Date
 *   events: array of events with balancesAfter, householdAfter, spendableAfter, freeCashAsOf
 *           (freeCashAsOf = running minimum spendable total up to and including this event —
 *            lets the UI show "free cash as of this point in time" while scrubbing the timeline)
 *   finalBalances: { [accountId]: number }
 */
function runForecast(data, horizonDays, scenarioOverlays = []) {
  const today = startOfDay(new Date());
  const endDate = addDays(today, horizonDays);

  const spendableSet = new Set(
    data.accounts.filter(a => a.is_spendable !== false && a.is_spendable !== 'false').map(a => a.id)
  );

  // Initialize balances
  const balances = {};
  for (const acct of data.accounts) {
    balances[acct.id] = parseFloat(acct.balance);
  }

  const events = buildEvents(data, today, endDate, scenarioOverlays);

  let dangerDate = null;
  let warningDate = null;
  let deficitAccountId = null;
  let firstFailureAmount = null;

  const spendableTotalNow = Object.entries(balances)
    .filter(([id]) => spendableSet.has(id))
    .reduce((s, [, v]) => s + v, 0);
  const excludedTotalNow = Object.entries(balances)
    .filter(([id]) => !spendableSet.has(id))
    .reduce((s, [, v]) => s + v, 0);

  let minHousehold = Object.values(balances).reduce((s, v) => s + v, 0);
  let minHouseholdDate = today;

  // Running minimum of the SPENDABLE-only total — this is what free cash is derived from
  let minSpendable = spendableTotalNow;
  let minSpendableDate = today;

  const snapshots = [];

  for (const ev of events) {
    // Apply event
    if (ev.type === 'income') {
      if (balances[ev.accountId] !== undefined) balances[ev.accountId] += ev.amount;
    } else {
      // expense or cc_payment
      if (balances[ev.accountId] !== undefined) balances[ev.accountId] -= ev.amount;
    }

    const household = Object.values(balances).reduce((s, v) => s + v, 0);
    const spendableTotal = Object.entries(balances)
      .filter(([id]) => spendableSet.has(id))
      .reduce((s, [, v]) => s + v, 0);

    if (household < minHousehold) {
      minHousehold = household;
      minHouseholdDate = ev.date;
    }
    if (spendableTotal < minSpendable) {
      minSpendable = spendableTotal;
      minSpendableDate = ev.date;
    }

    // Danger check: any account < 0 (spendable or not — going negative anywhere is still danger)
    for (const [id, bal] of Object.entries(balances)) {
      if (bal < 0 && !dangerDate) {
        dangerDate = ev.date;
        deficitAccountId = id;
        firstFailureAmount = Math.abs(bal);
      }
    }

    // Warning check: any account below warning threshold
    if (!warningDate) {
      for (const acct of data.accounts) {
        if (
          acct.warning_threshold != null &&
          balances[acct.id] < parseFloat(acct.warning_threshold) &&
          balances[acct.id] >= 0
        ) {
          warningDate = ev.date;
          break;
        }
      }
    }

    snapshots.push({
      ...ev,
      balancesAfter: { ...balances },
      householdAfter: household,
      spendableAfter: Math.round(spendableTotal * 100) / 100,
      // Running min-so-far of spendable total, clamped to 0 — i.e. "free cash as of this event"
      freeCashAsOf: Math.round(Math.max(0, minSpendable) * 100) / 100,
    });
  }

  let status = 'safe';
  if (dangerDate) status = 'danger';
  else if (warningDate) status = 'warning';

  const freeCash = Math.max(0, minSpendable);
  const deficit = minSpendable < 0 ? Math.abs(minSpendable) : 0;

  return {
    status,
    freeCash: Math.round(freeCash * 100) / 100,
    spendableTotal: Math.round(spendableTotalNow * 100) / 100,
    excludedTotal: Math.round(excludedTotalNow * 100) / 100,
    deficit: Math.round(deficit * 100) / 100,
    dangerDate,
    warningDate,
    deficitAccountId,
    firstFailureAmount,
    minimumDepositNeeded: Math.round(deficit * 100) / 100,
    minHousehold: Math.round(minHousehold * 100) / 100,
    minHouseholdDate,
    minSpendable: Math.round(minSpendable * 100) / 100,
    minSpendableDate,
    events: snapshots,
    finalBalances: { ...balances },
    spendableAccountIds: Array.from(spendableSet),
    horizonDays,
    generatedAt: new Date(),
  };
}

module.exports = { runForecast, buildEvents };
