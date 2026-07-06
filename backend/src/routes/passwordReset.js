'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { Resend } = require('resend');

const router = express.Router();
const SALT_ROUNDS = 12;
const TOKEN_EXPIRY_MINUTES = 30;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM || 'Financial Safety <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// POST /auth/forgot-password
// Sends a password reset email to the user's registered email address.
// Always returns 200 regardless of whether the email exists (prevents enumeration).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const { rows: [user] } = await db.query(
      `SELECT u.id, u.email, h.name as household_name, h.is_disabled
       FROM users u JOIN households h ON h.id = u.household_id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    // Always respond with success to prevent email enumeration
    if (!user || user.is_disabled) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Expire any existing tokens for this user
    await db.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;

    if (resend) {
      await resend.emails.send({
        from: FROM,
        to: user.email,
        subject: 'Reset your Financial Safety password',
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0efec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e8e4">
    <div style="padding:28px 28px 0">
      <div style="font-size:13px;color:#9a9a96;margin-bottom:4px">Financial Safety</div>
      <div style="font-size:20px;font-weight:500;color:#1a1a1a;letter-spacing:-0.02em">Reset your password</div>
    </div>
    <div style="padding:20px 28px">
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 20px">
        We received a request to reset the password for <strong>${user.email}</strong> on the
        <strong>${user.household_name}</strong> household.
      </p>
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 24px">
        Click the button below to set a new password. This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.
      </p>
      <a href="${resetUrl}"
         style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:13px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;margin-bottom:20px">
        Reset my password →
      </a>
      <p style="font-size:12px;color:#9a9a96;margin:0">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    </div>
  </div>
</body>
</html>`,
      });
    } else {
      // Dev fallback — log the reset URL since Resend isn't configured
      console.log(`[DEV] Password reset URL for ${user.email}: ${resetUrl}`);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    // Still return success to prevent enumeration
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  }
});

// GET /auth/reset-password?token=xxx
// Validates a reset token without consuming it (used by the frontend to check before showing the form)
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const { rows: [row] } = await db.query(
      `SELECT prt.id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()`,
      [token]
    );
    if (!row) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    res.json({ valid: true, email: row.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

// POST /auth/reset-password
// Consumes the token and updates the password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [row] } = await client.query(
      `SELECT prt.id, prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       FOR UPDATE`,
      [token]
    );

    if (!row) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    // Mark token as used
    await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [row.id]
    );

    // Update password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, row.user_id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Password updated. You can now log in with your new password.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  } finally {
    client.release();
  }
});

module.exports = router;
