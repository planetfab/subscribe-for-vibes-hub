const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
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
      // Log mailbox status so we can see total vs unseen counts
      const status = await client.status('INBOX', { messages: true, unseen: true, recent: true });
      console.log(`[email] Mailbox status — total: ${status.messages}, unseen: ${status.unseen}, recent: ${status.recent}`);

      const uids = await client.search({ seen: false });
      console.log(`[email] Unseen UIDs found: [${uids.join(', ')}] (${uids.length} message${uids.length !== 1 ? 's' : ''})`);

      if (!uids.length) {
        console.log('[email] No unseen messages — done');
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
          console.log(`[email] uid ${uid} — has text: ${!!parsed.text}, has html: ${!!parsed.html}`);

          // Prefer plain text; fall back to HTML → text conversion
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

          console.log(`[email] uid ${uid} — sanitized body length: ${sanitized.length} chars`);
          if (sanitized.length > 0) {
            console.log(`[email] uid ${uid} — body preview: "${sanitized.substring(0, 120)}…"`);
          }

          if (!sanitized) {
            console.log(`[email] uid ${uid} — skipping: empty body after sanitization`);
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            continue;
          }

          console.log(`[email] uid ${uid} — sending to Claude`);
          const result = await processContent(subject, sanitized);
          await db.create({ ...result, email_subject: subject, raw_content: sanitized });
          console.log(`[email] uid ${uid} — stored as "${result.piece_title}"`);
          processed++;

          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          console.log(`[email] uid ${uid} — marked as seen`);
        } catch (err) {
          console.error(`[email] uid ${uid} — error: ${err.message}`);
        }
      }
    } finally {
      lock.release();
      console.log('[email] Mailbox lock released');
    }

    await client.logout();
    console.log(`[email] Done — processed ${processed} message${processed !== 1 ? 's' : ''}`);
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
