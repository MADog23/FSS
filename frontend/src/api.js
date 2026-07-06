// In development, Vite proxies /api → localhost:3001 so BASE stays '/api'.
// In production (Vercel), VITE_API_URL is set to the live Railway backend URL
// (e.g. https://financial-safety-backend.up.railway.app) and we call it directly.
const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') // strip any trailing slash
  : '/api';

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
  forgotPassword: (email) => request('POST', '/auth/forgot-password', { email }),
  validateResetToken: (token) => request('GET', `/auth/reset-password?token=${token}`),
  resetPassword: (token, password) => request('POST', '/auth/reset-password', { token, password }),

  // Admin portal (ADMIN_SECRET protected — used by /admin frontend only)
  adminRequest: (method, path, body) => {
    const secret = localStorage.getItem('adminSecret') || '';
    return fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}` },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Request failed: ${r.status}`);
      return data;
    });
  },
  adminGetStats: () => api.adminRequest('GET', '/admin/stats'),
  adminGetHouseholds: (search) => api.adminRequest('GET', `/admin/households${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  adminGetHousehold: (id) => api.adminRequest('GET', `/admin/households/${id}`),
  adminUpdateHousehold: (id, body) => api.adminRequest('PATCH', `/admin/households/${id}`, body),
  adminClearAlerts: (id) => api.adminRequest('POST', `/admin/households/${id}/clear-alerts`),
  adminResetUserPassword: (id, password) => api.adminRequest('POST', `/admin/users/${id}/reset-password`, { password }),
  adminGetAnnouncements: () => api.adminRequest('GET', '/admin/announcements'),
  adminPostAnnouncement: (body) => api.adminRequest('POST', '/admin/announcements', body),
  adminDeleteAnnouncement: (id) => api.adminRequest('DELETE', `/admin/announcements/${id}`),

  // Notifications
  getNotifications: () => request('GET', '/notifications'),
  getUnreadCount: () => request('GET', '/notifications/unread-count'),
  markNotificationRead: (id) => request('PATCH', `/notifications/${id}/read`),
  markAllNotificationsRead: () => request('POST', '/notifications/read-all'),
  deleteNotification: (id) => request('DELETE', `/notifications/${id}`),

  // Accounts
  getAccounts: () => request('GET', '/accounts'),
  createAccount: (body) => request('POST', '/accounts', body),
  updateAccount: (id, body) => request('PUT', `/accounts/${id}`, body),
  deleteAccount: (id) => request('DELETE', `/accounts/${id}`),
  quickUpdateBalance: (id, balance) => request('PATCH', `/accounts/${id}/balance`, { balance }),
  getBalanceHistory: (id) => request('GET', `/accounts/${id}/balance-history`),

  // Income
  getIncome: () => request('GET', '/income'),
  createIncome: (body) => request('POST', '/income', body),
  updateIncome: (id, body) => request('PUT', `/income/${id}`, body),
  deleteIncome: (id) => request('DELETE', `/income/${id}`),
  getIncomeOverrides: (id) => request('GET', `/income/${id}/overrides`),
  setIncomeOverride: (id, body) => request('POST', `/income/${id}/overrides`, body),
  deleteIncomeOverride: (id, overrideId) => request('DELETE', `/income/${id}/overrides/${overrideId}`),

  // Alerts
  getCompletions: (horizon) => request('GET', `/completions?horizon=${horizon}`),
  completeEvent: (body) => request('POST', '/completions', body),
  updateCompletion: (id, body) => request('PATCH', `/completions/${id}`, body),
  uncompleteEvent: (id) => request('DELETE', `/completions/${id}`),

  getAlertPrefs: () => request('GET', '/alerts'),
  saveAlertPrefs: (body) => request('PUT', '/alerts', body),
  sendTestAlert: () => request('POST', '/alerts/test'),

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
