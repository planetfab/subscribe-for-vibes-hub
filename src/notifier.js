const nodemailer = require('nodemailer');
const db = require('./database');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.SMTP_PASS || process.env.IMAP_PASSWORD;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.dreamhost.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true,
    auth: { user, pass },
  });
  // Socket errors on an idle pooled connection must not crash the process
  transporter.on('error', err => console.error('[notifier] transport error:', err.message));
  return transporter;
}

function parseRecipients(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(s => s.includes('@'));
}

async function getRecipients() {
  return parseRecipients(await db.getSetting('notification_recipients'));
}

function easternTime(date = new Date()) {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'full',
    timeStyle: 'short',
  }) + ' ET';
}

async function sendMail({ subject, body }) {
  const recipients = await getRecipients();
  if (!recipients.length) return { sent: false, reason: 'No recipients configured' };

  const t = getTransporter();
  if (!t) throw new Error('SMTP credentials not configured');

  const from = process.env.SMTP_USER || process.env.IMAP_USER;
  await t.sendMail({
    from: `"Subscribe for Vibes Hub" <${from}>`,
    to: recipients.join(', '),
    subject,
    text: body,
  });
  return { sent: true, recipients };
}

function buildBody({ channel, title, section, text }) {
  return [
    `Channel: ${channel}`,
    `Title: ${title || '(untitled)'}`,
    `Section: ${section || '—'}`,
    `Time: ${easternTime()}`,
    '',
    '—— Text ——',
    '',
    text || '(no text)',
    '',
    '—',
    'Sent automatically by Subscribe for Vibes Hub.',
  ].join('\n');
}

// Never throws — a notification failure must not block or fail a publish.
async function notifyPublished({ channel, title, section, text, action = 'published' }) {
  try {
    await sendMail({
      subject: `Subscribe for Vibes Hub: ${channel} post ${action} — ${title || '(untitled)'}`,
      body: buildBody({ channel, title, section, text }),
    });
  } catch (err) {
    console.error(`[notifier] Failed to send notification for ${channel}:`, err.message);
  }
}

// Used by the Settings test button — throws so the UI can show the failure.
async function sendTestNotification() {
  const result = await sendMail({
    subject: 'Subscribe for Vibes Hub: test notification',
    body: buildBody({
      channel: 'Test',
      title: 'Test notification',
      section: 'Settings',
      text: 'This is a test. Publish notifications will be sent to this address.',
    }),
  });
  if (!result.sent) {
    const err = new Error(result.reason);
    err.statusCode = 400;
    throw err;
  }
  return result;
}

module.exports = { notifyPublished, sendTestNotification, parseRecipients };
