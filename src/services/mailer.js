// src/services/mailer.js
//
// Resend wrapper for transactional emails. Currently sends:
//   - PIN reset codes
//
// Required env vars:
//   RESEND_API_KEY  - https://resend.com/api-keys
//   EMAIL_FROM      - "Staff Arts <hello@yourdomain.com>"
//                     (domain must be verified in Resend dashboard)

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || 'Staff Arts <onboarding@resend.dev>';

if (!resend && process.env.NODE_ENV === 'production') {
  console.warn('[mailer] RESEND_API_KEY not set — emails will not be sent.');
}

// ── PIN reset email ─────────────────────────────────────────────────────

const PIN_RESET_TEMPLATE_EN = ({ displayName, code, ttlMinutes }) => ({
  subject: 'Your Staff Arts PIN reset code',
  text: `Hi ${displayName || 'there'},

You requested to reset your Staff Arts PIN. Enter this code in the app:

    ${code}

This code is valid for ${ttlMinutes} minutes. If you didn't request a reset, you can safely ignore this email.

— Staff Arts`,
  html: `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1a1a1a">
      <h1 style="font-size:20px;margin:0 0 16px;color:#2D4A6E">Reset your PIN</h1>
      <p>Hi ${displayName || 'there'},</p>
      <p>You requested to reset your Staff Arts PIN. Enter this code in the app:</p>
      <div style="background:#FAF7F2;border:1px solid #e8e2d5;border-radius:8px;padding:18px 24px;text-align:center;margin:24px 0">
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#C97060">${code}</div>
      </div>
      <p style="color:#666;font-size:14px">This code is valid for <strong>${ttlMinutes} minutes</strong>. If you didn't request a reset, you can safely ignore this email.</p>
      <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">— Staff Arts</p>
    </div>
  `.trim(),
});

export async function sendPinResetEmail({ to, displayName, code, ttlMinutes }) {
  const tpl = PIN_RESET_TEMPLATE_EN({ displayName, code, ttlMinutes });

  if (!resend) {
    // Dev fallback: log to console so you can test the flow without Resend.
    console.log(
      `[mailer:dev] Would send PIN reset to ${to}:\n  subject: ${tpl.subject}\n  code: ${code}`,
    );
    return { id: 'dev-noop' };
  }

  const { data, error } = await resend.emails.send({
    from: FROM,
    to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return data;
}