/**
 * API integration tests.
 * Requires a running test database. Set DATABASE_URL to a disposable test DB
 * before running: DATABASE_URL=postgresql://...test_db npm test
 */
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

let token;
let accountId;

beforeAll(async () => {
  // Clean slate (assumes test DB)
  await db.query('TRUNCATE households CASCADE');
});

afterAll(async () => {
  await db.pool.end();
});

describe('Auth flow', () => {
  test('registers a new household and admin user', async () => {
    const res = await request(app).post('/auth/register').send({
      householdName: 'Test Household',
      email: 'admin@test.com',
      password: 'supersecret123',
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    token = res.body.token;
  });

  test('rejects duplicate email', async () => {
    const res = await request(app).post('/auth/register').send({
      householdName: 'Other Household',
      email: 'admin@test.com',
      password: 'supersecret123',
    });
    expect(res.status).toBe(409);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'admin@test.com',
      password: 'supersecret123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects bad password', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'admin@test.com',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  test('rejects requests without token', async () => {
    const res = await request(app).get('/accounts');
    expect(res.status).toBe(401);
  });
});

describe('Accounts CRUD', () => {
  test('creates an account', async () => {
    const res = await request(app)
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Checking', type: 'checking', balance: 2500, warning_threshold: 300 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Checking');
    accountId = res.body.id;
  });

  test('lists accounts', async () => {
    const res = await request(app).get('/accounts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('updates an account', async () => {
    const res = await request(app)
      .put(`/accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ balance: 3000 });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.balance)).toBe(3000);
  });
});

describe('Forecast endpoint', () => {
  test('returns safe forecast for healthy household', async () => {
    const res = await request(app)
      .get('/forecast?horizon=30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('safe');
    expect(res.body.freeCash).toBeGreaterThan(0);
  });

  test('rejects invalid horizon', async () => {
    const res = await request(app)
      .get('/forecast?horizon=9999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('simulates scenario overlay without persisting', async () => {
    const res = await request(app)
      .post('/forecast/simulate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        horizonDays: 30,
        overlays: [{ name: 'Car repair', amount: 5000, event_type: 'expense', event_date: new Date().toISOString().slice(0, 10), account_id: accountId }],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('danger');

    // Confirm it wasn't persisted — re-fetch baseline forecast
    const baseline = await request(app).get('/forecast?horizon=30').set('Authorization', `Bearer ${token}`);
    expect(baseline.body.status).toBe('safe');
  });
});

describe('Bills and income CRUD', () => {
  test('creates a bill', async () => {
    const res = await request(app)
      .post('/bills')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rent', amount: 1200, frequency: 'monthly', next_date: new Date().toISOString().slice(0, 10), target_account_id: accountId });
    expect(res.status).toBe(201);
  });

  test('creates an income event', async () => {
    const res = await request(app)
      .post('/income')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Salary', amount: 3000, frequency: 'biweekly', next_date: new Date().toISOString().slice(0, 10), source_account_id: accountId });
    expect(res.status).toBe(201);
  });
});

describe('Role-based access', () => {
  let viewerToken;

  test('admin can invite a viewer', async () => {
    const res = await request(app)
      .post('/auth/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'viewer@test.com', password: 'viewerpass123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('viewer');
  });

  test('viewer can log in and read but not write', async () => {
    const loginRes = await request(app).post('/auth/login').send({ email: 'viewer@test.com', password: 'viewerpass123' });
    viewerToken = loginRes.body.token;

    const readRes = await request(app).get('/accounts').set('Authorization', `Bearer ${viewerToken}`);
    expect(readRes.status).toBe(200);

    const writeRes = await request(app)
      .post('/accounts')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Hack attempt', balance: 0 });
    expect(writeRes.status).toBe(403);
  });
});
