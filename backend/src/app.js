require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRouter = require('./routes/auth');
const accountsRouter = require('./routes/accounts');
const { incomeRouter, billsRouter, cardsRouter } = require('./routes/financial');
const { forecastRouter, scenarioRouter } = require('./routes/forecast');
const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Routes
app.use('/auth', authRouter);
app.use('/accounts', requireAuth, accountsRouter);
app.use('/income', requireAuth, incomeRouter);
app.use('/bills', requireAuth, billsRouter);
app.use('/cards', requireAuth, cardsRouter);
app.use('/forecast', requireAuth, forecastRouter);
app.use('/scenarios', requireAuth, scenarioRouter);

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
