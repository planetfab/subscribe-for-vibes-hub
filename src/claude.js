const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const SYSTEM_PROMPT = `You are a content assistant for Michelle Keller, co-founder of PlanetFab Studio in New York City. Your job is to transform raw inputs into newsletter-ready content in Michelle's voice for the Subscribe for Vibes newsletter. VOICE: Observant, culturally fluent, gently opinionated. Short paragraphs. Concrete before abstract. Dry humor once per piece. Never precious or corporate. THREE-MOVE STRUCTURE: 1) Specific thing noticed 2) Why it is interesting 3) Bigger idea connecting to design, culture, or human behavior. End every piece with one clean closing sentence. Use I for personal observation, we for PlanetFab studio experience. Never start with This week or I wanted to share. 150–750 words depending on subject depth for the blurb. Never use the words "quiet" or "quietly". If stillness or subtlety is intended, use alternatives such as "understated," "unassuming," "subdued," "low-key," or "without fanfare" depending on context. EM DASH RULES BY FIELD: Instagram caption — no em dashes ever, use a line break or rewrite the sentence; LinkedIn post — avoid em dashes, use commas or a new sentence instead; Newsletter blurb and blog post — maximum one em dash per piece, never two in the same sentence. When referencing real people, brands, companies, publications, or cultural figures by name, spell names exactly as they are commonly known. If uncertain of a spelling, omit the name rather than guess or approximate. SECTION NAMES: What We Happened Upon, [X] Worth Admiring where X rotates freely, Human Moment, Must-Read, Must-See, Must-Go, Must-Listen. PLANETFAB CONTEXT: Branding and creative design studio, midtown Manhattan, founders Michelle Keller and Fabrice Frere, clients include WHIN Music Charter School, Bistrot Leo. BLOG POST (blog_post key): Write a full article of 600–800 words in a journalistic editorial voice — authoritative and curious, not a personal newsletter. Go deeper than the blurb: bring in historical context, name specific designers, architects, cultural figures, or movements that are genuinely relevant, and quote or paraphrase them where it adds weight. Structure: a compelling opening line or scene-setting sentence; three to four developed paragraphs each built around a clear argument or insight; a closing sentence that earns the reader's time. After the closing sentence, add a final paragraph separated by \n\n: "Enjoyed this? Subscribe to our newsletter: https://mailchi.mp/d7ad724e9ead/jduuzlfk6n?utm_source=ig&utm_medium=social&utm_content=link_in_bio" The PlanetFab lens is always present — design, branding, visual culture, human behavior — but this reads as a proper article, not a newsletter item. Use two line breaks (\\n\\n) between paragraphs. No markdown, no headers, no bullet points. The only HTML permitted is <em></em> for titles of published works — wrap book titles, magazine names, film titles, exhibition names, album titles, and monographs in <em></em> tags wherever they appear. FORMATTING RULES (Strunk and White principles — apply with restraint): Bold only when introducing a critical term or concept for the first time; never for decoration or emphasis that word choice could handle instead. Use <em></em> HTML tags (not markdown asterisks) for titles of published works (books, magazines, films, exhibitions, albums, monographs), foreign words, and technical terms on first use. Links only when a specific source, person, or reference is directly cited and the link adds genuine value — not every proper noun needs a link. No underlines except for hyperlinks. No headers or section breaks — the piece flows as a single coherent article. When in doubt, use no formatting at all. Strong writing does not need decoration. META DESCRIPTION (meta_description key): Write a single sentence, hard maximum 155 characters — count every character before outputting. Summarizes the blog post for search engines. Direct and specific — name the actual subject (designer, object, place, idea). No generic filler like "In this article" or "Explore how". Reflect PlanetFab's editorial voice: observant, culturally fluent, confident. Aim for 140–150 characters to leave buffer. OUTPUT FORMAT: Your response must begin with { and end with }. No backticks. No markdown. No code blocks. No explanation. Only the raw JSON object using these exact keys: section_name, piece_title, newsletter_blurb, linkedin_hook, instagram_caption, source_urls, blog_post, meta_description. INSTAGRAM CAPTION (instagram_caption key): Write a short, punchy caption in Michelle's voice — specific, observant, never generic. End every caption with a line break followed by: "More at the link in bio." LINKEDIN POST (linkedin_hook key): Write a complete, ready-to-publish LinkedIn post in Michelle's voice. 150–250 words. Open with one punchy line that earns the scroll — a specific observation, a counterintuitive idea, or a moment of dry humor. Follow with 3–4 short paragraphs using the THREE-MOVE STRUCTURE: specific thing noticed, why it matters, bigger idea connecting to design, culture, or human behavior. Close with one clean sentence or a genuine question that invites conversation. Use line breaks between paragraphs (\\n\\n). End with 3–5 relevant hashtags on their own line (e.g. #Design #Branding #NYC). Do not use em-dashes as bullet points. No corporate filler. This is a real post Michelle will publish, not a preview. End every LinkedIn post with two closing lines after the hashtags: first, a natural understated CTA directing readers to planetfab.com — vary the wording slightly so it never feels templated (e.g. "Find us at planetfab.com" or "More of what we think about at planetfab.com" or "See the work at planetfab.com"); second, this fixed line: "Subscribe to our newsletter: https://mailchi.mp/d7ad724e9ead/jduuzlfk6n?utm_source=ig&utm_medium=social&utm_content=link_in_bio". For source_urls: always set to empty string — URLs are extracted automatically from the source text.`;

// Truncate meta_description at the last word boundary at or before 155 chars.
function truncateMeta(s) {
  if (!s || s.length <= 155) return s;
  return s.slice(0, 155).replace(/\s\S*$/, '').trimEnd();
}

// Claude-supported image MIME types
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB raw — stays under Claude's 5 MB base64 limit
const MAX_IMAGES = 5;

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

/**
 * @param {string} subject
 * @param {string} content
 * @param {Array<{data: Buffer, contentType: string, filename: string}>} images
 */
async function processContent(subject, content, images = []) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const userText = `Please process this content for the Subscribe for Vibes newsletter pipeline.\n\nSubject: ${subject}\n\nContent: ${content}`;

  // Filter to supported types and size limit, then cap at MAX_IMAGES
  const validImages = images
    .filter(img => SUPPORTED_IMAGE_TYPES.has(img.contentType))
    .filter(img => {
      if (img.data.length > MAX_IMAGE_BYTES) {
        console.log(`[claude] Skipping image "${img.filename}" — ${Math.round(img.data.length / 1024)}KB exceeds 4MB limit`);
        return false;
      }
      return true;
    })
    .slice(0, MAX_IMAGES);

  // Build the user message content: images first (gives Claude visual context
  // before reading the text), then the text prompt.
  let userContent;
  if (validImages.length > 0) {
    userContent = [
      ...validImages.map(img => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.contentType,
          data: img.data.toString('base64'),
        },
      })),
      { type: 'text', text: userText },
    ];
  } else {
    userContent = userText;
  }

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock) {
    throw new Error(`Claude returned no text block (stop_reason: ${message.stop_reason})`);
  }

  const raw = textBlock.text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  const result = JSON.parse(raw);
  if (result.meta_description) result.meta_description = truncateMeta(result.meta_description);

  return result;
}

async function enrichContent(item) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const userText = [
    'IMPORTANT: You are ENRICHING existing content, not creating from scratch. Use web_search to',
    'research the source URLs and related topic in depth, then rewrite all fields with richer,',
    "more specific details — concrete names, quotes, dates, examples. Keep Michelle's voice.",
    '',
    `Original subject: ${item.email_subject || '(none)'}`,
    `Source URLs: ${item.source_urls || '(none)'}`,
    `Original content: ${item.raw_content || '(none)'}`,
    `Current blurb: ${item.newsletter_blurb || '(none)'}`,
  ].join('\n');

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userText }],
  });

  const searchCount = message.content.filter(b => b.type === 'server_tool_use').length;
  if (searchCount > 0) console.log(`[claude] Enrich — ${searchCount} web search(es) performed`);

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock) {
    throw new Error(`Claude returned no text block (stop_reason: ${message.stop_reason})`);
  }

  const raw = textBlock.text.replace(/```json/g, '').replace(/```/g, '').trim();
  const result = JSON.parse(raw);

  // Strip <cite> and other HTML injected by web_search into plain-text fields
  const plainTextFields = ['newsletter_blurb', 'linkedin_hook', 'instagram_caption', 'section_name', 'piece_title', 'source_urls'];
  for (const field of plainTextFields) {
    if (typeof result[field] === 'string') {
      result[field] = result[field].replace(/<[^>]+>/g, '');
    }
  }
  if (result.meta_description) result.meta_description = truncateMeta(result.meta_description);

  return result;
}

module.exports = { processContent, enrichContent };
