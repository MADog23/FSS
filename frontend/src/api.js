const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  // Auth
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  me: () => request('GET', '/auth/me'),
  invite: (body) => request('POST', '/auth/invite', body),
  inviteFamilyMember: (body) => request('POST', '/auth/invite', body),
  getMembers: () => request('GET', '/auth/members'),
  updateMember: (id, body) => request('PATCH', `/auth/members/${id}`, body),
  removeMember: (id) => request('DELETE', `/auth/members/${id}`),

  // Accounts
  getAccounts: () => request('GET', '/accounts'),
  createAccount: (body) => request('POST', '/accounts', body),
  updateAccount: (id, body) => request('PUT', `/accounts/${id}`, body),
  deleteAccount: (id) => request('DELETE', `/accounts/${id}`),

  // Income
  getIncome: () => request('GET', '/income'),
  createIncome: (body) => request('POST', '/income', body),
  updateIncome: (id, body) => request('PUT', `/income/${id}`, body),
  deleteIncome: (id) => request('DELETE', `/income/${id}`),

  // Bills
  getBills: () => request('GET', '/bills'),
  createBill: (body) => request('POST', '/bills', body),
  updateBill: (id, body) => request('PUT', `/bills/${id}`, body),
  deleteBill: (id) => request('DELETE', `/bills/${id}`),

  // Credit cards
  getCards: () => request('GET', '/cards'),
  createCard: (body) => request('POST', '/cards', body),
  updateCard: (id, body) => request('PUT', `/cards/${id}`, body),
  deleteCard: (id) => request('DELETE', `/cards/${id}`),
  getCardOverrides: (id) => request('GET', `/cards/${id}/overrides`),
  setCardOverride: (id, body) => request('POST', `/cards/${id}/overrides`, body),
  deleteCardOverride: (id, overrideId) => request('DELETE', `/cards/${id}/overrides/${overrideId}`),

  // Bill paid marks
  getBillPaidMarks: (id) => request('GET', `/bills/${id}/paid-marks`),
  markBillPaid: (id, occurrence_date) => request('POST', `/bills/${id}/paid-marks`, { occurrence_date }),
  unmarkBillPaid: (id, markId) => request('DELETE', `/bills/${id}/paid-marks/${markId}`),

  // Forecast
  getForecast: (horizon) => request('GET', `/forecast?horizon=${horizon}`),
  simulate: (body) => request('POST', '/forecast/simulate', body),

  // Scenarios
  getScenarios: () => request('GET', '/scenarios'),
  createScenario: (body) => request('POST', '/scenarios', body),
  deleteScenario: (id) => request('DELETE', `/scenarios/${id}`),
  scenarioForecast: (id, horizon) => request('GET', `/scenarios/${id}/forecast?horizon=${horizon}`),
};
