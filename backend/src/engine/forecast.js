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
 * incomeOverrides: Map of 'YYYY-MM-DD' -> override_amount for fluctuating pay.
 */
function expandRecurring(name, amount, frequency, nextDate, accountId, type, startDate, endDate, meta = {}, paidDates = null, incomeOverrides = null) {
  const events = [];
  let d = startOfDay(new Date(nextDate));

  while (d <= endDate) {
    const dateKey = d.toISOString().slice(0, 10);
    const isPaid = paidDates && paidDates.has(dateKey);
    if (d >= startDate && !isPaid) {
      // Use override amount if one exists for this specific date
      const actualAmount = (incomeOverrides && incomeOverrides.has(dateKey))
        ? parseFloat(incomeOverrides.get(dateKey))
        : parseFloat(amount);
      events.push({
        date: new Date(d),
        type,
        name,
        amount: actualAmount,
        accountId,
        isOverrideAmount: !!(incomeOverrides && incomeOverrides.has(dateKey)),
        ...meta,
      });
    }
    if (frequency === 'weekly') d = addDays(d, 7);
    else if (frequency === 'biweekly') d = addDays(d, 14);
    else if (frequency === 'monthly') d = addMonths(d, 1);
    else if (frequency === 'quarterly') d = addMonths(d, 3);
    else if (frequency === 'yearly') d = addMonths(d, 12);
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
 *
 * data.completions: Map keyed by a canonical event key -> completion record.
 * A completion record has: { id, actual_amount, completed_at }
 *
 * Completed events:
 *   - Use actual_amount instead of projected amount (if actual_amount is set)
 *   - Are flagged as isCompleted: true in the snapshot
 *   - Still appear in the timeline (for record-keeping) but with visual distinction
 *
 * Legacy override maps (billPaidMarks, ccOverrides, incomeOverrides) are still
 * read for backward compatibility with data entered before v1.5.0.
 */
function buildEvents(data, startDate, endDate, scenarioOverlays = []) {
  const events = [];

  // Build a lookup from canonical event key -> completion
  // Key format: "income:{incomeId}:{YYYY-MM-DD}"
  //             "bill:{billId}:{YYYY-MM-DD}"
  //             "cc:{cardId}:{YYYY-MM-DD}"
  const completionMap = new Map();
  for (const c of (data.completions || [])) {
    const dateKey = new Date(c.occurrence_date).toISOString().slice(0, 10);
    if (c.income_event_id)  completionMap.set(`income:${c.income_event_id}:${dateKey}`, c);
    if (c.bill_event_id)    completionMap.set(`bill:${c.bill_event_id}:${dateKey}`, c);
    if (c.credit_card_id)   completionMap.set(`cc:${c.credit_card_id}:${dateKey}`, c);
  }

  // Legacy: bill paid marks (v1.4.x data) — treated as completions with no amount override
  const billPaidMarks = data.billPaidMarks || {};
  const ccOverrides   = data.ccOverrides   || {};
  const incomeOverridesMap = data.incomeOverrides || {};

  // Income
  for (const inc of data.income) {
    // Legacy income overrides
    const legacyOverrides = incomeOverridesMap[inc.id]
      ? new Map(incomeOverridesMap[inc.id].map(o => [
          new Date(o.occurrence_date).toISOString().slice(0, 10),
          o.override_amount,
        ]))
      : null;

    let d = startOfDay(new Date(inc.next_date));
    while (d <= endDate) {
      const dateKey = d.toISOString().slice(0, 10);
      if (d >= startDate) {
        const completionKey = `income:${inc.id}:${dateKey}`;
        const completion = completionMap.get(completionKey);
        // Amount: completion actual > legacy override > projected default
        const projectedAmount = parseFloat(inc.amount);
        const legacyOverride = legacyOverrides?.get(dateKey);
        const actualAmount = completion?.actual_amount != null
          ? parseFloat(completion.actual_amount)
          : legacyOverride != null
          ? parseFloat(legacyOverride)
          : projectedAmount;

        events.push({
          date: new Date(d),
          type: 'income',
          name: inc.name,
          amount: actualAmount,
          accountId: inc.source_account_id,
          sourceId: inc.id,
          sourceType: 'income',
          projectedAmount,
          isCompleted: !!completion,
          completionId: completion?.id || null,
          isEditedAmount: actualAmount !== projectedAmount,
          occurrenceDate: dateKey,
        });
      }
      if (inc.frequency === 'weekly')     d = addDays(d, 7);
      else if (inc.frequency === 'biweekly')  d = addDays(d, 14);
      else if (inc.frequency === 'monthly')   d = addMonths(d, 1);
      else if (inc.frequency === 'quarterly') d = addMonths(d, 3);
      else if (inc.frequency === 'yearly')    d = addMonths(d, 12);
      else break;
    }
  }

  // Bills
  for (const bill of data.bills) {
    const legacyPaidDates = billPaidMarks[bill.id] || null;

    let d = startOfDay(new Date(bill.next_date));
    while (d <= endDate) {
      const dateKey = d.toISOString().slice(0, 10);
      const completionKey = `bill:${bill.id}:${dateKey}`;
      const completion = completionMap.get(completionKey);
      const legacyPaid = legacyPaidDates && legacyPaidDates.has(dateKey);

      if (d >= startDate && !legacyPaid) {
        const projectedAmount = parseFloat(bill.amount);
        const actualAmount = completion?.actual_amount != null
          ? parseFloat(completion.actual_amount)
          : projectedAmount;

        events.push({
          date: new Date(d),
          type: 'expense',
          name: bill.name,
          amount: actualAmount,
          accountId: bill.target_account_id,
          sourceId: bill.id,
          sourceType: 'bill',
          projectedAmount,
          isCompleted: !!completion,
          completionId: completion?.id || null,
          isEditedAmount: actualAmount !== projectedAmount,
          occurrenceDate: dateKey,
        });
      }
      if (bill.frequency === 'weekly')      d = addDays(d, 7);
      else if (bill.frequency === 'biweekly')   d = addDays(d, 14);
      else if (bill.frequency === 'monthly')    d = addMonths(d, 1);
      else if (bill.frequency === 'quarterly')  d = addMonths(d, 3);
      else if (bill.frequency === 'yearly')     d = addMonths(d, 12);
      else break;
    }
  }

  // Credit card payments
  for (const card of data.creditCards) {
    const legacyCcOverrides = ccOverrides[card.id] || [];
    const legacyOverrideMap = new Map(
      legacyCcOverrides.map(o => [new Date(o.due_date).toISOString().slice(0, 10), parseFloat(o.override_amount)])
    );

    let cycleDate = new Date(startDate.getFullYear(), startDate.getMonth(), card.cycle_day_of_month);
    if (cycleDate < startDate) cycleDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, card.cycle_day_of_month);

    let remainingBalance = parseFloat(card.balance);
    const maxCycles = 24;

    for (let i = 0; i < maxCycles; i++) {
      if (cycleDate > endDate || remainingBalance <= 0) break;

      const dueDate = addDays(cycleDate, parseInt(card.due_offset_days));
      const dueKey = dueDate.toISOString().slice(0, 10);

      const completionKey = `cc:${card.id}:${dueKey}`;
      const completion = completionMap.get(completionKey);

      let projectedPayment = 0;
      if (legacyOverrideMap.has(dueKey)) {
        projectedPayment = legacyOverrideMap.get(dueKey);
      } else if (card.payment_rule === 'minimum') {
        projectedPayment = card.minimum_payment != null && card.minimum_payment !== ''
          ? parseFloat(card.minimum_payment)
          : Math.max(25, Math.round(remainingBalance * 0.02 * 100) / 100);
      } else if (card.payment_rule === 'statement') {
        projectedPayment = remainingBalance;
      } else if (card.payment_rule === 'fixed') {
        projectedPayment = parseFloat(card.fixed_amount) || 0;
      }

      projectedPayment = Math.min(projectedPayment, remainingBalance);

      const actualPayment = completion?.actual_amount != null
        ? parseFloat(completion.actual_amount)
        : projectedPayment;

      if (projectedPayment > 0 && dueDate <= endDate && dueDate >= startDate) {
        events.push({
          date: new Date(dueDate),
          type: 'cc_payment',
          name: `${card.name} payment`,
          amount: actualPayment,
          accountId: card.payment_account_id,
          sourceId: card.id,
          sourceType: 'cc',
          cardId: card.id,
          projectedAmount: projectedPayment,
          isCompleted: !!completion,
          completionId: completion?.id || null,
          isEditedAmount: actualPayment !== projectedPayment,
          occurrenceDate: dueKey,
        });
        remainingBalance = Math.max(0, remainingBalance - actualPayment);
      }

      cycleDate = new Date(cycleDate.getFullYear(), cycleDate.getMonth() + 1, card.cycle_day_of_month);
    }
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
        sourceType: 'scenario',
        isScenario: true,
        isCompleted: false,
      });
    }
  }

  // Sort: chronological, income before expenses on the same day
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
    // Skip completed events from today or earlier — their effect is already
    // reflected in the current account balance. Including them double-counts
    // the transaction: once via the stored balance and once via the simulation.
    const evDate = new Date(ev.date);
    evDate.setHours(0, 0, 0, 0);
    if (ev.isCompleted && evDate <= today) continue;

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
