'use strict';
/**
 * Alert service — sends email notifications via Resend when a household's
 * forecast crosses into Warning or Danger status.
 *
 * Setup:
 *   1. Sign up at https://resend.com (free tier: 3,000 emails/month)
 *   2. Get your API key from Resend dashboard
 *   3. Add RESEND_API_KEY to your Railway environment variables
 *   4. Add RESEND_FROM to Railway — e.g. "Financial Safety <alerts@yourdomain.com>"
 *      (requires a verified domain in Resend, or use onboarding@resend.dev for testing)
 */

const { Resend } = require('resend');
const db = require('../db');
const { runForecast } = require('../engine/forecast');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM || 'Financial Safety <onboarding@resend.dev>';

// ── Email templates ────────────────────────────────────────────────────────
function buildEmailHtml({ status, householdName, freeCash, dangerDate, deficit, horizonDays }) {
  const fmt = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const statusColor = status === 'danger' ? '#a32d2d' : '#854f0b';
  const statusBg = status === 'danger' ? '#fcebeb' : '#faeeda';
  const statusLabel = status === 'danger' ? '🔴 Danger' : '🟡 Warning';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0efec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e8e4">

    <!-- Header -->
    <div style="padding:24px 24px 0">
      <div style="font-size:13px;color:#9a9a96;margin-bottom:4px">Financial Safety</div>
      <div style="font-size:20px;font-weight:500;color:#1a1a1a;letter-spacing:-0.02em">${householdName}</div>
    </div>

    <!-- Status -->
    <div style="margin:20px 24px;padding:14px 16px;background:${statusBg};border-radius:10px;border:0.5px solid ${statusColor}40">
      <div style="font-size:16px;font-weight:500;color:${statusColor};margin-bottom:6px">${statusLabel}</div>
      <div style="font-size:13px;color:${statusColor}">
        ${status === 'danger'
          ? `Your household is projected to run out of funds${dangerDate ? ` by <strong>${fmtDate(dangerDate)}</strong>` : ''}.`
          : `Your available buffer is approaching a low level over the next ${horizonDays} days.`
        }
      </div>
    </div>

    <!-- Figures -->
    <div style="padding:0 24px 20px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;border-bottom:0.5px solid #e8e8e4">
            <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Available buffer (${horizonDays} days)</div>
            <div style="font-size:22px;font-weight:500;color:${freeCash === 0 ? '#a32d2d' : '#1a1a1a'}">${fmt(freeCash)}</div>
          </td>
        </tr>
        ${deficit > 0 ? `
        <tr>
          <td style="padding:10px 0;border-bottom:0.5px solid #e8e8e4">
            <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Projected shortfall</div>
            <div style="font-size:18px;font-weight:500;color:#a32d2d">${fmt(deficit)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0">
            <div style="font-size:11px;color:#9a9a96;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Minimum deposit to restore safety</div>
            <div style="font-size:18px;font-weight:500;color:#1a1a1a">${fmt(deficit)}</div>
          </td>
        </tr>` : ''}
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:0 24px 24px">
      <a href="${process.env.APP_URL || 'https://your-app.vercel.app'}"
         style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500">
        View your forecast →
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;border-top:0.5px solid #e8e8e4;background:#f8f8f6">
      <div style="font-size:11px;color:#9a9a96">
        You're receiving this because you have alerts enabled for ${householdName}.
        Manage your alert preferences in the app under Household settings.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Check and send alerts for a household ─────────────────────────────────
async function checkAndSendAlerts(householdId) {
  if (!resend) return; // Resend not configured — skip silently

  try {
    // Load alert preferences
    const { rows: [prefs] } = await db.query(
      'SELECT * FROM alert_preferences WHERE household_id = $1',
      [householdId]
    );
    if (!prefs || !prefs.alert_email) return;

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

    // Determine if we should send
    const shouldAlert =
      (status === 'danger' && prefs.alert_on_danger) ||
      (status === 'warning' && prefs.alert_on_warning);

    // Don't re-alert for the same status (avoids spamming)
    if (!shouldAlert || prefs.last_status === status) return;

    const householdName = household.rows[0]?.name || 'Your household';

    await resend.emails.send({
      from: FROM,
      to: prefs.alert_email,
      subject: `${status === 'danger' ? '🔴 Action needed' : '🟡 Heads up'} — ${householdName} financial safety alert`,
      html: buildEmailHtml({ status, householdName, freeCash, dangerDate, deficit, horizonDays: 30 }),
    });

    // Record that we sent this alert
    await db.query(
      'UPDATE alert_preferences SET last_alerted_at = NOW(), last_status = $1 WHERE household_id = $2',
      [status, householdId]
    );

    console.log(`Alert sent to ${prefs.alert_email} for household ${householdId} — status: ${status}`);
  } catch (err) {
    // Never throw — alert failures should not break the main request
    console.error('Alert check failed for household', householdId, err.message);
  }
}

// ── Run alerts for all households (called after forecast requests) ─────────
async function checkAllHouseholds() {
  if (!resend) return;
  try {
    const { rows } = await db.query('SELECT id FROM households');
    await Promise.allSettled(rows.map(h => checkAndSendAlerts(h.id)));
  } catch (err) {
    console.error('checkAllHouseholds failed:', err.message);
  }
}

module.exports = { checkAndSendAlerts, checkAllHouseholds };
