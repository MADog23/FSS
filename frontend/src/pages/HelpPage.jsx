import { useState } from 'react';

const SECTIONS = [
  {
    title: 'What is this app?',
    content: `This is a Financial Safety Forecasting System — not a budgeting app.

It answers one question: "Am I financially safe?"

It does this by taking your real account balances, your income schedule, your recurring bills, and your credit card payments, then simulating your cash flow forward in time to show you the lowest point your money will reach over the next 30, 60, or 90 days.

That lowest point is your Available Buffer. If it stays above $0, you're safe. If it would go negative, the app shows you exactly when, by how much, and what you'd need to deposit to fix it.

The app never guesses. It only uses events you've entered.`,
  },
  {
    title: 'Dashboard',
    content: `The dashboard is the main screen. It shows:

Status indicator — a green, yellow, or red dot with a label (Safe / Warning / Danger) and the date your safety holds through.

Available buffer — the lowest point your spendable balance reaches over the selected horizon, after all income, bills, and card payments are applied in order. Tap "why?" for a full explanation.

Next income chip — shows the next incoming payment so you have context for the buffer figure.

Next obligation — the next bill or payment coming due.

Horizon buttons — switch between 30, 60, and 90-day views. The buffer figure updates for each.

Account projection cards — show where each account balance ends up at the end of the horizon. These are projections, not current balances. Update current balances on the Accounts tab.

Balance projection chart — a line chart of your projected spendable balance over the horizon. Tap to expand.

Event timeline — the full chronological list of every income, bill, and payment in the horizon. Tap any row to see your buffer as of that moment. Use the Edit button on any event to mark it complete or adjust its amount.`,
  },
  {
    title: 'Setting up accounts',
    content: `Accounts represent your actual bank accounts. Add at least one before adding income or bills.

Name — whatever you call it (Checking, Main Account, etc.)

Type — descriptive only, doesn't affect calculations.

Current balance — your real balance right now. Update this regularly from the Accounts tab using the Update button — the more accurate this is, the more accurate your forecast.

Warning threshold — optional. If your balance drops below this during the forecast, the status changes to Warning (yellow) even if it doesn't go negative.

Counts toward free cash — set this to "Yes" for spending accounts (checking). Set it to "No" for savings or emergency funds you don't intend to spend. A "No" account still triggers Danger if it goes negative, but its balance doesn't inflate your available buffer figure.

To update your current balance: go to Accounts, find the account, tap the Update button below it, type your real bank balance, and press Save. The dashboard forecast reruns automatically.`,
  },
  {
    title: 'Income',
    content: `Income events represent recurring or one-time money coming in.

Frequency options: Weekly, Biweekly, Bimonthly, Quarterly, Yearly, One-time.

Next date — the date of the next expected payment. For recurring income, the app projects forward from this date at the chosen frequency.

Deposits into — which account receives this income.

Tip: if someone's pay fluctuates (hourly workers, tipped employees), set the default amount to the typical or minimum expected amount. Then use the timeline's Edit button to adjust specific paychecks when you know the actual amount.`,
  },
  {
    title: 'Bills',
    content: `Bills represent recurring or one-time expenses.

Frequency options: Weekly, Biweekly, Monthly, Quarterly, Yearly, One-time. Quarterly and yearly are useful for things like car registration, insurance renewals, or HOA fees.

Paid from — which account the bill comes out of.

Search — use the search bar at the top of the Bills page to quickly find a specific bill by name.

Every bill you enter is treated as required — the app never tries to guess whether something is essential or discretionary. If you enter it, it's included in the forecast.`,
  },
  {
    title: 'Credit cards',
    content: `Credit card entries simulate upcoming payment events based on your statement cycle.

Statement day — the day of month your statement closes.

Days after statement to pay — how many days after the statement date your payment is due (typically 21-25).

Payment rule:
  • Minimum — uses your entered minimum payment amount, or 2% of the balance if none is set.
  • Statement balance — pays the full balance each cycle.
  • Fixed amount — pays the same dollar amount every cycle.

Minimum payment — if your rule is Minimum, enter the actual dollar minimum from your card (e.g. $35) for a more accurate projection.

The card generates payment events automatically in the timeline based on these settings.`,
  },
  {
    title: 'Event timeline',
    content: `The timeline is your most powerful tool for keeping the forecast accurate.

Every event in your horizon appears here — income, bills, card payments — in chronological order with its projected amount and the buffer figure at that point in time.

Scrubbing — tap any event row to see your available buffer as of that moment. The buffer figure at the top of the dashboard updates to match. Tap again to return to the full-horizon view.

Edit mode — tap the Edit button on any event to open an inline panel:
  • The projected amount is pre-filled. Change it if the actual amount differs.
  • Tap "✓ Mark complete" to record that this event has happened. The event gets a strikethrough and a "completed" badge. Completed events stay visible as a record but their actual amount is used going forward.
  • Tap "Save amount only" if you want to record the actual amount without marking it fully complete yet.
  • Tap "Undo" on a completed event to reverse it.

Use Edit + Mark complete regularly to keep your forecast grounded in what has actually happened rather than only projections.`,
  },
  {
    title: 'What-if scenarios',
    content: `The What-if tab lets you test hypothetical events against your forecast without changing any real data.

Add scenario events (income or expense) with a date and amount. The app compares your baseline forecast with and without those events side by side.

The comparison panel shows:
  • Status before and after (Safe / Warning / Danger)
  • Buffer before and after
  • The exact dollar change to your buffer

Toggle the scenario on and off with the "Apply scenario" button. When active, the dashboard also reflects the scenario.

Save a scenario to keep it for future reference. Saved scenarios can be reloaded or deleted from the bottom of the What-if page.

Examples: "What if I lose my job next month?", "What if my car breaks down?", "What if we take a vacation in August?"`,
  },
  {
    title: 'Household & family access',
    content: `The Household tab (⚙) is for managing who has access to your household's data.

Admin — full access. Can add, edit, and delete everything. The person who created the household is automatically the admin.

Read-only — can view the dashboard, forecast, accounts, and timeline, but cannot add, edit, or delete anything. Good for a partner or family member who wants visibility without risk of changing data.

To invite a family member: go to Household → Add a family member, enter their email and a temporary password, then share those credentials with them directly. They log in at the same URL.

After adding a member, use the Manage button next to their name to change their access level (promote to admin or keep as read-only), reset their password, or remove them.

Safety alerts — also on the Household tab. Enter an email address to receive automatic notifications when your forecast enters Warning or Danger status. Requires email service setup on the backend (see DEPLOYMENT.md).`,
  },
  {
    title: 'Keeping your data accurate',
    content: `The forecast is only as good as the data behind it. Here's a simple routine that keeps it useful:

Weekly (5 minutes):
  1. Open your banking app and check your real account balances.
  2. Go to Accounts → tap Update next to each account → type the real balance.
  3. Open the dashboard timeline and mark any events from the past week as complete. Adjust amounts if they came in differently than expected.

When something changes:
  • Got a raise? Update the amount on your income event.
  • New recurring bill? Add it to Bills immediately.
  • One-time expense coming up? Add it as a one-time bill or test it in What-if first.
  • Paid off a credit card? Delete or update the card entry.

The more current your data, the more trustworthy the forecast.`,
  },
  {
    title: 'Understanding the safety status',
    content: `🟢 Safe — your spendable balance stays above $0 (and above any warning thresholds) for the full horizon.

🟡 Warning — your balance stays above $0 but dips below a warning threshold you've set on one of your accounts. Nothing critical, but worth attention.

🔴 Danger — your spendable balance would go negative at some point in the horizon. The app shows you exactly when this first happens, by how much, and the minimum deposit needed to restore safety.

Important rules:
  • Any single account going below $0 triggers Danger, even if your overall household total is still positive. This is intentional — individual accounts going negative means overdrafts in real life.
  • Savings accounts marked "set aside" are excluded from the buffer figure but still trigger Danger if they go negative.
  • The buffer is always floored at $0 in the display. If you're in Danger, the actual shortfall is shown separately in the deficit box.`,
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState(null);

  const toggle = (i) => setOpen(open === i ? null : i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 4px', letterSpacing: '-0.01em' }}>Help & guide</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
          Tap any section to expand it.
        </p>
      </div>

      {SECTIONS.map((section, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            style={{
              background: 'var(--color-background-primary)',
              border: `0.5px solid ${isOpen ? 'var(--color-border-secondary)' : 'var(--color-border-tertiary)'}`,
              borderRadius: 12,
              overflow: 'hidden',
              transition: 'border-color 0.15s',
            }}
          >
            {/* Header row */}
            <button
              onClick={() => toggle(i)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {section.title}
              </span>
              <span style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                flexShrink: 0,
                transition: 'transform 0.2s',
                display: 'inline-block',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>
                ▼
              </span>
            </button>

            {/* Content */}
            {isOpen && (
              <div style={{
                padding: '0 14px 14px',
                borderTop: '0.5px solid var(--color-border-tertiary)',
              }}>
                {section.content.split('\n').map((line, j) => {
                  const isEmpty = line.trim() === '';
                  const isBullet = line.trim().startsWith('•');
                  const isHeader = line.trim().endsWith(':') && !line.includes('—') && line.trim().length < 40;

                  if (isEmpty) return <div key={j} style={{ height: 8 }} />;
                  if (isHeader) return (
                    <div key={j} style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', marginTop: 10, marginBottom: 2 }}>
                      {line.trim()}
                    </div>
                  );
                  if (isBullet) return (
                    <div key={j} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginTop: 3 }}>
                      <span style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}>•</span>
                      <span>{line.trim().slice(2)}</span>
                    </div>
                  );
                  return (
                    <p key={j} style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '4px 0 0' }}>
                      {line}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px 0 4px' }}>
        Financial Safety Forecasting System
      </div>
    </div>
  );
}
