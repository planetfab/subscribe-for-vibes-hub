const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
const crypto = require('crypto');
const config = require('./config');
const { processContent } = require('./claude');
const db = require('./database');

async function checkEmails() {
  if (!config.imap.password) {
    console.log('[email] IMAP_PASSWORD not configured — skipping');
    return 0;
  }

  console.log(`[email] Connecting to ${config.imap.host}:${config.imap.port} as ${config.imap.user}`);

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
    console.log('[email] Connected successfully');

    const lock = await client.getMailboxLock('INBOX');
    console.log('[email] INBOX locked');

    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`[email] Mailbox status — total: ${status.messages}, unseen: ${status.unseen}`);

      // Search for all emails from the last 7 days regardless of seen flag,
      // since another mail client marks messages read before we can see them.
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const uids = await client.search({ since });
      console.log(`[email] UIDs in last 7 days: [${uids.join(', ')}] (${uids.length} total)`);

      if (!uids.length) {
        console.log('[email] No messages in the last 7 days — done');
        return 0;
      }

      for (const uid of uids) {
        console.log(`[email] Downloading uid ${uid}`);
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true });
          const chunks = [];
          for await (const chunk of content) chunks.push(chunk);
          const rawBuffer = Buffer.concat(chunks);
          console.log(`[email] uid ${uid} — raw size: ${rawBuffer.length} bytes`);

          const parsed = await simpleParser(rawBuffer);
          const subject = parsed.subject || 'No Subject';
          console.log(`[email] uid ${uid} — subject: "${subject}"`);
          console.log(`[email] uid ${uid} — from: ${parsed.from?.text || '(unknown)'}`);
          console.log(`[email] uid ${uid} — date: ${parsed.date || '(unknown)'}`);

          // Use the email's Message-ID header as the dedup key.
          // Fall back to a hash of subject+date+from if the header is absent.
          const rawMessageId = parsed.messageId?.trim();
          const messageId = rawMessageId
            || crypto.createHash('sha1')
                 .update(`${subject}|${parsed.date?.toISOString() || ''}|${parsed.from?.text || ''}`)
                 .digest('hex');
          console.log(`[email] uid ${uid} — message-id: ${rawMessageId || `(none, using hash ${messageId.substring(0, 12)}…)`}`);

          const alreadyDone = await db.hasProcessedEmail(messageId);
          if (alreadyDone) {
            console.log(`[email] uid ${uid} — already processed, skipping`);
            continue;
          }

          console.log(`[email] uid ${uid} — has text: ${!!parsed.text}, has html: ${!!parsed.html}`);

          let bodyText = parsed.text || '';
          if (!bodyText && parsed.html) {
            console.log(`[email] uid ${uid} — using HTML fallback`);
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

          console.log(`[email] uid ${uid} — sanitized body: ${sanitized.length} chars`);
          if (sanitized.length > 0) {
            console.log(`[email] uid ${uid} — preview: "${sanitized.substring(0, 120)}…"`);
          }

          if (!sanitized) {
            console.log(`[email] uid ${uid} — skipping: empty body after sanitization`);
            await db.markEmailProcessed(messageId);
            continue;
          }

          console.log(`[email] uid ${uid} — sending to Claude`);
          const result = await processContent(subject, sanitized);
          await db.create({ ...result, email_subject: subject, raw_content: sanitized });
          await db.markEmailProcessed(messageId);
          console.log(`[email] uid ${uid} — stored as "${result.piece_title}"`);
          processed++;

        } catch (err) {
          console.error(`[email] uid ${uid} — error: ${err.message}`);
        }
      }
    } finally {
      lock.release();
      console.log('[email] Mailbox lock released');
    }

    await client.logout();
    console.log(`[email] Done — processed ${processed} new message${processed !== 1 ? 's' : ''}`);
  } catch (err) {
    console.error(`[email] IMAP error: ${err.message}`);
    if (err.response) console.error(`[email] Server response: ${err.response}`);
    try { await client.logout(); } catch {}
  }

  return processed;
}

function startEmailWatcher() {
  console.log('[email] Watcher started — polling every 5 minutes');
  checkEmails().catch(err => console.error('[email] Initial check failed:', err.message));
  cron.schedule('*/5 * * * *', () => {
    checkEmails().catch(err => console.error('[email] Scheduled check failed:', err.message));
  });
}

module.exports = { startEmailWatcher, checkEmails };
