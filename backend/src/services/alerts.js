'use strict';
/**
 * Alert service — sends email notifications via Resend AND creates in-app
 * notifications when a household forecast crosses into Warning or Danger.
 *
 * In-app notifications are always created (no Resend required).
 * Email is only sent when RESEND_API_KEY is configured.
 *
 * Setup for email:
 *   1. Sign up at https://resend.com (free tier: 3,000 emails/month)
 *   2. Add RESEND_API_KEY to Railway environment variables
 *   3. Add RESEND_FROM (e.g. "Financial Safety <alerts@yourdomain.com>")
 *   4. Add APP_URL (your Vercel URL, used in email CTA button)
 */

const { Resend } = require('resend');
const db = require('../db');
const { runForecast } = require('../engine/forecast');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM || 'Financial Safety <onboarding@resend.dev>';

// ── Email template ─────────────────────────────────────────────────────────
function buildEmailHtml({ status, householdName, freeCash, dangerDate, deficit, horizonDays }) {
  const fmt = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const statusColor = status === 'danger' ? '#a32d2d' : '#854f0b';
  const statusBg = status === 'danger' ? '#fcebeb' : '#faeeda';
  const statusLabel = status === 'danger' ? '🔴 Danger' : '🟡 Warning';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0efec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e8e4">
    <div style="padding:24px 24px 0">
      <div style="font-size:13px;color:#9a9a96;margin-bottom:4px">Financial Safety</div>
      <div style="font-size:20px;font-weight:500;color:#1a1a1a;letter-spacing:-0.02em">${householdName}</div>
    </div>
    <div style="margin:20px 24px;padding:14px 16px;background:${statusBg};border-radius:10px;border:0.5px solid ${statusColor}40">
      <div style="font-size:16px;font-weight:500;color:${statusColor};margin-bottom:6px">${statusLabel}</div>
      <div style="font-size:13px;color:${statusColor}">
        ${status === 'danger'
          ? `Your household is projected to run out of funds${dangerDate ? ` by <strong>${fmtDate(dangerDate)}</strong>` : ''}.`
          : `Your available buffer is approaching a low level over the next ${horizonDays} days.`}
      </div>
    </div>
    <div style="padding:0 24px 20px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px 0;border-bottom:0.5px solid #e8e8e4">
          <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Available buffer (${horizonDays} days)</div>
          <div style="font-size:22px;font-weight:500;color:${freeCash === 0 ? '#a32d2d' : '#1a1a1a'}">${fmt(freeCash)}</div>
        </td></tr>
        ${deficit > 0 ? `
        <tr><td style="padding:10px 0;border-bottom:0.5px solid #e8e8e4">
          <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Projected shortfall</div>
          <div style="font-size:18px;font-weight:500;color:#a32d2d">${fmt(deficit)}</div>
        </td></tr>
        <tr><td style="padding:10px 0">
          <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Minimum deposit to restore safety</div>
          <div style="font-size:18px;font-weight:500;color:#1a1a1a">${fmt(deficit)}</div>
        </td></tr>` : ''}
      </table>
    </div>
    <div style="padding:0 24px 24px">
      <a href="${process.env.APP_URL || 'https://your-app.vercel.app'}"
         style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        View your forecast →
      </a>
    </div>
    <div style="padding:16px 24px;border-top:0.5px solid #e8e8e4;background:#f8f8f6">
      <div style="font-size:11px;color:#9a9a96">
        You're receiving this because you have alerts enabled for ${householdName}.
        Manage alert preferences in the app under Household settings.
      </div>
    </div>
  </div>
</body></html>`;
}

// ── Build notification text ────────────────────────────────────────────────
function buildNotificationText(status, freeCash, deficit, dangerDate) {
  const fmt = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  if (status === 'danger') {
    return `Your available buffer has reached $0. Projected shortfall: ${fmt(deficit)}. Minimum deposit needed: ${fmt(deficit)}.${dangerDate ? ` First failure: ${new Date(dangerDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : ''}`;
  }
  return `Your spendable balance is approaching a warning threshold over the next 30 days. Available buffer: ${fmt(freeCash)}.`;
}

// ── Check and send alerts for a single household ───────────────────────────
async function checkAndSendAlerts(householdId) {
  try {
    // Load alert preferences — used for email config and dedup.
    // In-app notifications fire regardless of whether prefs exist.
    const { rows: [prefs] } = await db.query(
      'SELECT * FROM alert_preferences WHERE household_id = $1',
      [householdId]
    );

    // Load household data for forecast
    const [accounts, income, bills, creditCards, household] = await Promise.all([
      db.query('SELECT * FROM accounts WHERE household_id = $1', [householdId]),
      db.query('SELECT * FROM income_events WHERE household_id = $1', [householdId]),
      db.query('SELECT * FROM bill_events WHERE household_id = $1', [householdId]),
      db.query('SELECT * FROM credit_cards WHERE household_id = $1', [householdId]),
      db.query('SELECT name FROM households WHERE id = $1', [householdId]),
    ]);

    const data = {
      accounts: accounts.rows,
      income: income.rows,
      bills: bills.rows,
      creditCards: creditCards.rows,
    };

    const forecast = runForecast(data, 30);
    const { status, freeCash, deficit, dangerDate } = forecast;

    // Only alert on danger or warning — safe status never generates a notification
    if (status === 'safe') return;

    const householdName = household.rows[0]?.name || 'Your household';
    const notifTitle = status === 'danger' ? '🔴 Safety alert — action needed' : '🟡 Safety alert — heads up';
    const notifBody = buildNotificationText(status, freeCash, deficit, dangerDate);

    // Dedup: don't fire the same status twice in a row.
    // Use prefs.last_status if prefs exist, otherwise check recent notifications.
    const lastStatus = prefs?.last_status || null;
    if (lastStatus === status) return;

    // Always create an in-app notification (no email config required)
    await db.query(
      `INSERT INTO household_notifications (household_id, type, title, body)
       VALUES ($1, $2, $3, $4)`,
      [householdId, 'safety', notifTitle, notifBody]
    );

    // Send email only if prefs exist, Resend is configured, and user has opted in
    const shouldEmail = prefs &&
      ((status === 'danger' && prefs.alert_on_danger) ||
       (status === 'warning' && prefs.alert_on_warning));

    if (resend && prefs?.alert_email && shouldEmail) {
      await resend.emails.send({
        from: FROM,
        to: prefs.alert_email,
        subject: `${status === 'danger' ? '🔴 Action needed' : '🟡 Heads up'} — ${householdName} financial safety alert`,
        html: buildEmailHtml({ status, householdName, freeCash, dangerDate, deficit, horizonDays: 30 }),
      });
      console.log(`Alert email sent to ${prefs.alert_email} for household ${householdId} — status: ${status}`);
    }

    // Record last alerted status to prevent re-alerting (upsert so it works even without existing prefs row)
    await db.query(
      `INSERT INTO alert_preferences (household_id, last_status, last_alerted_at, alert_on_danger, alert_on_warning)
       VALUES ($1, $2, NOW(), TRUE, FALSE)
       ON CONFLICT (household_id) DO UPDATE SET last_status = $2, last_alerted_at = NOW()`,
      [householdId, status]
    );
  } catch (err) {
    console.error('Alert check failed for household', householdId, err.message);
  }
}

// ── Run alerts for all households ─────────────────────────────────────────
async function checkAllHouseholds() {
  try {
    const { rows } = await db.query('SELECT id FROM households');
    await Promise.allSettled(rows.map(h => checkAndSendAlerts(h.id)));
  } catch (err) {
    console.error('checkAllHouseholds failed:', err.message);
  }
}

module.exports = { checkAndSendAlerts, checkAllHouseholds };
