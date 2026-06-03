const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
const config = require('./config');
const { processContent } = require('./claude');
const db = require('./database');

async function checkEmails() {
  if (!config.imap.password) {
    console.log('IMAP_PASSWORD not configured — skipping email check');
    return 0;
  }

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.password },
    logger: false,
  });

  let processed = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const uids = await client.search({ seen: false });
      if (!uids.length) {
        return 0;
      }

      for (const uid of uids) {
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true });
          const chunks = [];
          for await (const chunk of content) chunks.push(chunk);
          const rawBuffer = Buffer.concat(chunks);

          const parsed = await simpleParser(rawBuffer);
          const subject = parsed.subject || 'No Subject';

          // Prefer plain text; fall back to HTML → text conversion
          let bodyText = parsed.text || '';
          if (!bodyText && parsed.html) {
            bodyText = parsed.html
              .replace(/<[^>]*>/g, ' ')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
          }

          // Replicate Make.com sanitization: strip newlines and tabs
          const sanitized = bodyText
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/\t/g, '')
            .trim();

          if (!sanitized) {
            console.log(`Skipping empty email: "${subject}"`);
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            continue;
          }

          console.log(`Processing: "${subject}"`);
          const result = await processContent(subject, sanitized);
          await db.create({ ...result, email_subject: subject, raw_content: sanitized });
          console.log(`Stored: "${result.piece_title}"`);
          processed++;

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        } catch (err) {
          console.error(`Error processing uid ${uid}:`, err.message);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error('IMAP connection error:', err.message);
    try { await client.logout(); } catch {}
  }

  return processed;
}

function startEmailWatcher() {
  console.log('Email watcher started — polling every 5 minutes');
  checkEmails().catch(err => console.error('Initial email check failed:', err.message));
  cron.schedule('*/5 * * * *', () => {
    checkEmails().catch(err => console.error('Scheduled email check failed:', err.message));
  });
}

module.exports = { startEmailWatcher, checkEmails };
