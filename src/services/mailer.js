// src/services/mailer.js
//
// Email sending via Resend. Currently used for the forgot-PIN reset code.
// qupda.com is verified in Resend, so EMAIL_FROM should be an address on that
// domain (e.g. "Staff Arts <no-reply@qupda.com>").
//
// Required env vars:
//   RESEND_API_KEY  — your Resend API key
//   EMAIL_FROM      — verified sender, e.g. "Staff Arts <no-reply@qupda.com>"
//
// Install once in the API:  npm install resend

import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'Staff Arts <no-reply@qupda.com>';

// Construct lazily-safe: if the key is missing we still export a function that
// throws a clear error when called, rather than crashing on import (so the rest
// of auth — login/register — keeps working even if email is misconfigured).
const resend = apiKey ? new Resend(apiKey) : null;

// Bilingual (Norwegian + English) reset-code email. Transactional emails run
// server-side with no i18n context, so we keep it to the two most relevant
// languages for this audience.
function buildResetEmail({ displayName, code, ttlMinutes }) {
  const name = displayName || '';
  const greetingNo = name ? `Hei ${name},` : 'Hei,';
  const greetingEn = name ? `Hi ${name},` : 'Hi,';

  const subject = 'Staff Arts — tilbakestill PIN / reset your PIN';

  const text = [
    `${greetingNo}`,
    ``,
    `Bruk denne koden for å tilbakestille PIN-koden din: ${code}`,
    `Koden er gyldig i ${ttlMinutes} minutter.`,
    `Hvis du ikke ba om dette, kan du se bort fra denne e-posten.`,
    ``,
    `— — —`,
    ``,
    `${greetingEn}`,
    ``,
    `Use this code to reset your PIN: ${code}`,
    `The code is valid for ${ttlMinutes} minutes.`,
    `If you didn't request this, you can ignore this email.`,
    ``,
    `Staff Arts · Qup DA`,
  ].join('\n');

  const html = `
  <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#1a1a1a;line-height:1.6">
    <h2 style="color:#2d4a6e;margin-bottom:4px">Staff Arts</h2>
    <p>${greetingNo}</p>
    <p>Bruk denne koden for å tilbakestille PIN-koden din:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#c97060;margin:16px 0">${code}</p>
    <p style="color:#666;font-size:14px">Koden er gyldig i ${ttlMinutes} minutter. Hvis du ikke ba om dette, kan du se bort fra denne e-posten.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p>${greetingEn}</p>
    <p>Use this code to reset your PIN:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#c97060;margin:16px 0">${code}</p>
    <p style="color:#666;font-size:14px">The code is valid for ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>
    <p style="color:#999;font-size:12px;margin-top:24px">Staff Arts · Qup DA</p>
  </div>`;

  return { subject, text, html };
}

export async function sendPinResetEmail({ to, displayName, code, ttlMinutes }) {
  if (!resend) {
    throw new Error(
      'Email not configured: set RESEND_API_KEY (and EMAIL_FROM) env vars.',
    );
  }

  const { subject, text, html } = buildResetEmail({ displayName, code, ttlMinutes });

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text,
    html,
  });

  if (error) {
    // Surface so the caller can log it (forgotPin catches and swallows).
    throw new Error(error.message || 'Resend send failed');
  }
}