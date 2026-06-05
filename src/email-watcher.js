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
      // Pass { uid: true } so search returns actual UIDs, not sequence numbers.
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const uids = await client.search({ since }, { uid: true });
      console.log(`[email] UIDs in last 7 days: [${uids.join(', ')}] (${uids.length} total)`);

      if (!uids.length) {
        console.log('[email] No messages in the last 7 days — done');
        return 0;
      }

      // fetch() with source:true returns the full raw RFC822 message as a Buffer on
      // message.source. uid:true in options makes the range be interpreted as UIDs.
      // Do not include uid in the query — it is always present in FetchMessageObject.
      for await (const message of client.fetch(uids, { source: true }, { uid: true })) {
        const uid = message.uid;
        console.log(`[email] Processing uid ${uid}`);
        try {
          const rawBuffer = message.source;
          if (!rawBuffer) {
            console.log(`[email] uid ${uid} — server returned no source data, skipping`);
            continue;
          }
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

          // Extract image attachments for Claude vision
          const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
          const images = (parsed.attachments || [])
            .filter(a => SUPPORTED_IMAGE_TYPES.has(a.contentType?.toLowerCase()))
            .map(a => ({ data: a.content, contentType: a.contentType.toLowerCase(), filename: a.filename || 'image' }));
          if (images.length > 0) {
            console.log(`[email] uid ${uid} — image attachments: ${images.map(i => `${i.filename} (${Math.round(i.data.length / 1024)}KB)`).join(', ')}`);
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

          if (!sanitized && images.length === 0) {
            console.log(`[email] uid ${uid} — skipping: no body and no image attachments`);
            await db.markEmailProcessed(messageId);
            continue;
          }

          const imageOnlyPrompt = 'These images were sent as inspiration for the Subscribe for Vibes newsletter. Analyze what you see — the place, object, experience, or idea being shown — and generate newsletter content in Michelle\'s voice as if she discovered and wanted to share this. Use the same three-move structure and section names as always.';
          const contentToProcess = sanitized || imageOnlyPrompt;

          console.log(`[email] uid ${uid} — sending to Claude${images.length > 0 ? ` with ${images.length} image(s)` : ''}${!sanitized ? ' (image-only)' : ''}`);
          const result = await processContent(subject, contentToProcess, images);
          await db.create({ ...result, email_subject: subject, raw_content: sanitized || '(image-only email)' });
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
  // Purge trash items older than 5 days — runs once daily at 3 am
  db.purgeOldTrash().catch(err => console.error('[db] Initial trash purge failed:', err.message));
  cron.schedule('0 3 * * *', () => {
    db.purgeOldTrash().catch(err => console.error('[db] Trash purge failed:', err.message));
  });
}

module.exports = { startEmailWatcher, checkEmails };
