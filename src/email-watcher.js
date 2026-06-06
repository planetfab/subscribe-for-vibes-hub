const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
const crypto = require('crypto');
const config = require('./config');
const { processContent } = require('./claude');
const db = require('./database');

async function checkEmails(onProgress = () => {}) {
  if (!config.imap.password) {
    console.log('[email] IMAP_PASSWORD not configured — skipping');
    return 0;
  }

  console.log(`[email] Connecting to ${config.imap.host}:${config.imap.port} as ${config.imap.user}`);
  onProgress('Connecting to mailbox...');

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
      const alreadyProcessedCount = await db.countProcessedEmails();
      console.log(`[email] processed_emails table has ${alreadyProcessedCount} record${alreadyProcessedCount !== 1 ? 's' : ''}`);

      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`[email] Mailbox status — total: ${status.messages}, unseen: ${status.unseen}`);

      // Search ALL emails from the last 7 days regardless of seen/unseen flag.
      // Apple Mail marks messages read on the server before the hub can see them,
      // so filtering by unseen would miss everything. Dedup via processed_emails
      // table + email_message_id column on content prevents reprocessing.
      onProgress('Searching last 7 days...');
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const uids = await client.search({ since }, { uid: true });
      console.log(`[email] UIDs in last 7 days: [${uids.join(', ')}] (${uids.length} total)`);

      if (!uids.length) {
        console.log('[email] No messages in the last 7 days — done');
        onProgress('No emails found in last 7 days');
        return 0;
      }

      onProgress(`Found ${uids.length} email${uids.length !== 1 ? 's' : ''} — checking for new...`);

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

          // Check both the processed_emails dedup table AND the email_message_id
          // column on content rows (catches cases where a card was saved but the
          // dedup record was lost, and also prevents reprocessing deleted cards).
          const skipReason = await db.hasProcessedEmail(messageId);
          if (skipReason) {
            console.log(`[email] uid ${uid} — skipping "${subject}": found in ${skipReason} table (message-id: ${messageId.substring(0, 40)}…)`);
            continue;
          }

          // Extract image attachments for Claude vision
          const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
          const MAX_STORED_IMAGES = 3;
          const images = (parsed.attachments || [])
            .filter(a => SUPPORTED_IMAGE_TYPES.has(a.contentType?.toLowerCase()))
            .map(a => ({ data: a.content, contentType: a.contentType.toLowerCase(), filename: a.filename || 'image' }));
          if (images.length > 0) {
            console.log(`[email] uid ${uid} — image attachments: ${images.map(i => `${i.filename} (${Math.round(i.data.length / 1024)}KB)`).join(', ')}`);
          }
          // Convert up to MAX_STORED_IMAGES images to base64 for database storage.
          // { data: Buffer } for Claude → { data: base64 string } for the DB.
          // When migrating to R2, replace this with upload calls and store { url } instead.
          const storedImages = images.slice(0, MAX_STORED_IMAGES).map(img => ({
            data: img.data.toString('base64'),
            contentType: img.contentType,
            filename: img.filename,
          }));

          console.log(`[email] uid ${uid} — has text: ${!!parsed.text}, has html: ${!!parsed.html}`);

          let bodyText = parsed.text || '';
          if (!bodyText && parsed.html) {
            console.log(`[email] uid ${uid} — using HTML fallback`);
            // Convert block-level tags to newlines BEFORE stripping other tags so that
            // the signature regex (which requires \n between name and title) can match.
            bodyText = parsed.html
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<\/(?:p|div|li|tr|td|h[1-6]|blockquote|section|article)>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&nbsp;/g, ' ')
              .replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace only
              .replace(/\n[ \t]+/g, '\n')     // trim leading spaces from each line
              .replace(/[ \t]+\n/g, '\n')     // trim trailing spaces from each line
              .replace(/\n{3,}/g, '\n\n')     // max two consecutive newlines
              .trim();
          }

          // Strip email signature using the two-line trigger unique to each sender:
          //   "Fabrice G. Frere\nCreative Director | PlanetFab Studio"
          //   "Michelle Keller\nArt Director | PlanetFab Studio"
          // Matching the title line prevents false positives from the name alone
          // (e.g. someone quoting or mentioning Fabrice/Michelle in the body).
          // [ \t]* tolerates trailing spaces before the line break; \r?\n handles CRLF and LF.
          const SIG_RE = /Fabrice G\. Frere[ \t]*\r?\nCreative Director \| PlanetFab Studio|Michelle Keller[ \t]*\r?\nArt Director \| PlanetFab Studio/;
          const sigIdx = bodyText.search(SIG_RE);
          if (sigIdx !== -1) {
            console.log(`[email] uid ${uid} — stripping signature at char ${sigIdx}`);
            bodyText = bodyText.substring(0, sigIdx).trimEnd();
          }

          // Replicate Make.com sanitization: strip newlines and tabs
          const sanitized = bodyText
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/\t/g, '')
            .trim();

          // Extract URLs from the signature-stripped body — done here in code so that
          // URLs from the signature block are never captured, regardless of how Claude
          // interprets "the entire input".
          // Denylist: own-domain URLs that only ever appear in the email signature.
          const SIG_DOMAINS = new Set(['planetfab.com']);
          const bodyUrls = [...sanitized.matchAll(/https?:\/\/[^\s,<>"']+/g)]
            .map(m => m[0].replace(/[.,;!?)'"\]]+$/, ''))
            .filter((url, i, arr) => arr.indexOf(url) === i)
            .filter(url => {
              try { return !SIG_DOMAINS.has(new URL(url).hostname.replace(/^www\./, '')); }
              catch { return true; }
            })
            .join(', ');

          console.log(`[email] uid ${uid} — sanitized body: ${sanitized.length} chars`);
          if (sanitized.length > 0) {
            console.log(`[email] uid ${uid} — preview: "${sanitized.substring(0, 120)}…"`);
          }
          if (bodyUrls) console.log(`[email] uid ${uid} — extracted URLs: ${bodyUrls}`);

          if (!sanitized && images.length === 0) {
            console.log(`[email] uid ${uid} — skipping: no body and no image attachments`);
            await db.markEmailProcessed(messageId);
            continue;
          }

          const imageOnlyPrompt = 'These images were sent as inspiration for the Subscribe for Vibes newsletter. Analyze what you see — the place, object, experience, or idea being shown — and generate newsletter content in Michelle\'s voice as if she discovered and wanted to share this. Use the same three-move structure and section names as always.';
          const contentToProcess = sanitized || imageOnlyPrompt;

          console.log(`[email] uid ${uid} — sending to Claude${images.length > 0 ? ` with ${images.length} image(s)` : ''}${!sanitized ? ' (image-only)' : ''}`);
          onProgress(`Processing: "${subject}"...`);
          const result = await processContent(subject, contentToProcess, images);
          onProgress('Saving to database...');
          // source_urls comes from our own extraction (bodyUrls), not from Claude,
          // so signature-block URLs can never leak through.
          await db.create({ ...result, source_urls: bodyUrls, email_subject: subject, raw_content: sanitized || '(image-only email)', images: storedImages, email_message_id: messageId, email_received_at: parsed.date || null });
          await db.markEmailProcessed(messageId);
          console.log(`[email] uid ${uid} — stored as "${result.piece_title}" and marked processed (message-id: ${messageId.substring(0, 40)}…)`);
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
  // Scheduled email checks: 8 am and 2 pm Eastern — cost is zero when no new emails exist
  // because the IMAP dedup check runs before any Claude API call.
  cron.schedule('0 8,14 * * *', () => {
    const stamp = new Date().toISOString();
    console.log(`[email] Scheduled check starting at ${stamp}`);
    checkEmails().then(count => {
      console.log(`[email] Scheduled check complete — ${count} new email${count !== 1 ? 's' : ''} processed`);
    }).catch(err => {
      console.error(`[email] Scheduled check failed: ${err.message}`);
    });
  }, { timezone: 'America/New_York' });
  console.log('[email] Scheduled checks active — 8 am and 2 pm Eastern');

  // Purge trash items older than 5 days — runs once daily at 3 am
  db.purgeOldTrash().catch(err => console.error('[db] Initial trash purge failed:', err.message));
  cron.schedule('0 3 * * *', () => {
    db.purgeOldTrash().catch(err => console.error('[db] Trash purge failed:', err.message));
  });
}

module.exports = { startEmailWatcher, checkEmails };
