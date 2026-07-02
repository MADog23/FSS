const { runForecast } = require('../src/engine/forecast');

// Helper to build a minimal dataset
function makeData(overrides = {}) {
  return {
    accounts: [
      { id: 'a1', name: 'Checking', balance: 3000, warning_threshold: 500 },
    ],
    income: [],
    bills: [],
    creditCards: [],
    ...overrides,
  };
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe('Forecast engine — basic safety', () => {
  test('returns safe with no events', () => {
    const result = runForecast(makeData(), 30);
    expect(result.status).toBe('safe');
    expect(result.freeCash).toBe(3000);
    expect(result.deficit).toBe(0);
  });

  test('returns danger when balance goes negative', () => {
    const data = makeData({
      bills: [{ id: 'b1', name: 'Huge bill', amount: 5000, frequency: 'once', next_date: futureDate(5), target_account_id: 'a1' }],
    });
    const result = runForecast(data, 30);
    expect(result.status).toBe('danger');
    expect(result.deficit).toBeGreaterThan(0);
    expect(result.dangerDate).not.toBeNull();
  });

  test('free cash is 0 when balance would go negative', () => {
    const data = makeData({
      bills: [{ id: 'b1', name: 'Overdraft', amount: 4000, frequency: 'once', next_date: futureDate(2), target_account_id: 'a1' }],
    });
    const result = runForecast(data, 30);
    expect(result.freeCash).toBe(0);
    expect(result.deficit).toBe(1000);
  });

  test('warning when balance falls below threshold', () => {
    const data = makeData({
      bills: [{ id: 'b1', name: 'Big bill', amount: 2700, frequency: 'once', next_date: futureDate(3), target_account_id: 'a1' }],
    });
    const result = runForecast(data, 30);
    expect(result.status).toBe('warning');
    expect(result.warningDate).not.toBeNull();
  });

  test('income restores balance and prevents danger', () => {
    const data = makeData({
      income: [{ id: 'i1', name: 'Salary', amount: 3000, frequency: 'biweekly', next_date: futureDate(1), source_account_id: 'a1' }],
      bills: [{ id: 'b1', name: 'Rent', amount: 2000, frequency: 'once', next_date: futureDate(5), target_account_id: 'a1' }],
    });
    const result = runForecast(data, 30);
    expect(result.status).toBe('safe');
  });
});

describe('Forecast engine — determinism', () => {
  test('produces identical results on repeated runs', () => {
    const data = makeData({
      income: [{ id: 'i1', name: 'Salary', amount: 1500, frequency: 'monthly', next_date: futureDate(7), source_account_id: 'a1' }],
      bills: [
        { id: 'b1', name: 'Rent', amount: 900, frequency: 'monthly', next_date: futureDate(3), target_account_id: 'a1' },
        { id: 'b2', name: 'Internet', amount: 60, frequency: 'monthly', next_date: futureDate(10), target_account_id: 'a1' },
      ],
    });
    const r1 = runForecast(data, 60);
    const r2 = runForecast(data, 60);
    expect(r1.status).toBe(r2.status);
    expect(r1.freeCash).toBe(r2.freeCash);
    expect(r1.events.length).toBe(r2.events.length);
  });
});

describe('Forecast engine — credit cards', () => {
  test('generates minimum payment events', () => {
    const data = makeData({
      creditCards: [{
        id: 'cc1',
        name: 'Visa',
        balance: 1000,
        credit_limit: 5000,
        cycle_day_of_month: 15,
        due_offset_days: 25,
        payment_rule: 'minimum',
        payment_account_id: 'a1',
      }],
    });
    const result = runForecast(data, 90);
    const ccEvents = result.events.filter(e => e.type === 'cc_payment');
    expect(ccEvents.length).toBeGreaterThan(0);
    expect(ccEvents[0].amount).toBeGreaterThanOrEqual(25);
  });
});

describe('Forecast engine — scenarios', () => {
  test('scenario overlay adds an event', () => {
    const data = makeData();
    const overlays = [{
      id: 'ov1',
      name: 'Emergency repair',
      amount: 500,
      event_type: 'expense',
      event_date: futureDate(10),
      account_id: 'a1',
    }];
    const baseline = runForecast(data, 30);
    const withScenario = runForecast(data, 30, overlays);
    expect(withScenario.events.length).toBe(baseline.events.length + 1);
    expect(withScenario.freeCash).toBeLessThan(baseline.freeCash);
  });

  test('large scenario expense triggers danger', () => {
    const data = makeData();
    const overlays = [{
      id: 'ov1',
      name: 'Job loss simulation',
      amount: 5000,
      event_type: 'expense',
      event_date: futureDate(5),
      account_id: 'a1',
    }];
    const result = runForecast(data, 30, overlays);
    expect(result.status).toBe('danger');
    expect(result.deficit).toBeGreaterThan(0);
  });
});

describe('Forecast engine — multi-account', () => {
  test('danger triggered by single account going negative', () => {
    const data = {
      accounts: [
        { id: 'a1', name: 'Checking', balance: 100, warning_threshold: null },
        { id: 'a2', name: 'Savings', balance: 10000, warning_threshold: null },
      ],
      income: [],
      bills: [{ id: 'b1', name: 'Auto-draft', amount: 200, frequency: 'once', next_date: futureDate(3), target_account_id: 'a1' }],
      creditCards: [],
    };
    const result = runForecast(data, 30);
    // a1 goes to -100 even though total household is still positive
    expect(result.status).toBe('danger');
    expect(result.deficitAccountId).toBe('a1');
  });
});

describe('Forecast engine — edge cases', () => {
  test('handles empty household gracefully', () => {
    const result = runForecast({ accounts: [], income: [], bills: [], creditCards: [] }, 30);
    expect(result.status).toBe('safe');
    expect(result.freeCash).toBe(0);
    expect(result.events).toHaveLength(0);
  });

  test('minimum deposit needed equals deficit amount', () => {
    const data = makeData({
      bills: [{ id: 'b1', name: 'Overdraft', amount: 3500, frequency: 'once', next_date: futureDate(1), target_account_id: 'a1' }],
    });
    const result = runForecast(data, 30);
    expect(result.minimumDepositNeeded).toBe(result.deficit);
    expect(result.minimumDepositNeeded).toBe(500);
  });
});
