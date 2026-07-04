require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRouter = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const { incomeRouter, billsRouter, cardsRouter } = require('./routes/financial');
const { forecastRouter, scenarioRouter } = require('./routes/forecast');
const alertsRouter = require('./routes/alerts');
const { checkAndSendAlerts } = require('./services/alerts');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Trust Railway/Render/Vercel proxy so rate limiting uses real client IPs
app.set('trust proxy', 1);

// ── Rate limiters ─────────────────────────────────────────────────────────
// Auth endpoints: 20 attempts per 15 minutes per IP — stops brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait 15 minutes and try again.' },
});

// General API: 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

// ── CORS ──────────────────────────────────────────────────────────────────
// CORS_ORIGIN can be a comma-separated list of allowed origins, e.g.:
//   CORS_ORIGIN=https://financial-safety.vercel.app,https://www.yourdomain.com
// In development it defaults to localhost:5173.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, Railway health checks)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
// Health check — no rate limit, used by Railway for uptime monitoring
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authLimiter, authRouter);
app.use('/accounts', apiLimiter, requireAuth, accountsRouter);
app.use('/income', apiLimiter, requireAuth, incomeRouter);
app.use('/bills', apiLimiter, requireAuth, billsRouter);
app.use('/cards', apiLimiter, requireAuth, cardsRouter);
app.use('/forecast', apiLimiter, requireAuth, forecastRouter);

// After every real forecast fetch (not simulate), check if alerts should fire.
// Done async so it never delays the response.
app.use('/forecast', (req, res, next) => {
  if (req.method === 'GET' && req.user) {
    checkAndSendAlerts(req.user.householdId).catch(() => {});
  }
  next();
});
app.use('/scenarios', apiLimiter, requireAuth, scenarioRouter);
app.use('/alerts', apiLimiter, requireAuth, alertsRouter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
