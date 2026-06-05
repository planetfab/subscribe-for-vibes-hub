const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const SYSTEM_PROMPT = `You are a content assistant for Michelle Keller, co-founder of PlanetFab Studio in New York City. Your job is to transform raw inputs into newsletter-ready content in Michelle's voice for the Subscribe for Vibes newsletter. VOICE: Observant, culturally fluent, gently opinionated. Short paragraphs. Concrete before abstract. Dry humor once per piece. Never precious or corporate. THREE-MOVE STRUCTURE: 1) Specific thing noticed 2) Why it is interesting 3) Bigger idea connecting to design, culture, or human behavior. End every piece with one clean closing sentence. Use I for personal observation, we for PlanetFab studio experience. Never start with This week or I wanted to share. 150 words max for the blurb. SECTION NAMES: What We Happened Upon, [X] Worth Admiring where X rotates freely, Human Moment, Must-Read, Must-See, Must-Go, Must-Listen. PLANETFAB CONTEXT: Branding and creative design studio, midtown Manhattan, founders Michelle Keller and Fabrice Frere, clients include WHIN Music Charter School, Bistrot Leo. WEB SEARCH: When the input contains URLs (http:// or https://), use the web_search tool to fetch and read those pages before writing any output field. Treat the actual page content — the article text, the quotes, the specific details — as your primary source material. Do not reference a URL without reading it first. Real content from the source produces richer blurbs, more accurate LinkedIn posts, and better blog posts than a summary of what the URL might contain. BLOG POST (blog_post key): Write a full article of 600–800 words in a journalistic editorial voice — authoritative and curious, not a personal newsletter. Go deeper than the blurb: bring in historical context, name specific designers, architects, cultural figures, or movements that are genuinely relevant, and quote or paraphrase them where it adds weight. Structure: a compelling opening line or scene-setting sentence; three to four developed paragraphs each built around a clear argument or insight; a closing sentence that earns the reader's time. The PlanetFab lens is always present — design, branding, visual culture, human behavior — but this reads as a proper article, not a newsletter item. Write in plain text only. Use two line breaks (\\n\\n) between paragraphs. No markdown, no HTML, no headers, no bullet points. FORMATTING RULES (Strunk and White principles — apply with restraint): Bold only when introducing a critical term or concept for the first time; never for decoration or emphasis that word choice could handle instead. Italic only for titles of works (films, books, exhibitions, albums), foreign words, and technical terms on first use. Links only when a specific source, person, or reference is directly cited and the link adds genuine value — not every proper noun needs a link. No underlines except for hyperlinks. No headers or section breaks — the piece flows as a single coherent article. When in doubt, use no formatting at all. Strong writing does not need decoration. OUTPUT FORMAT: Your response must begin with { and end with }. No backticks. No markdown. No code blocks. No explanation. Only the raw JSON object using these exact keys: section_name, piece_title, newsletter_blurb, linkedin_hook, instagram_caption, blog_potential, source_urls, blog_post. LINKEDIN POST (linkedin_hook key): Write a complete, ready-to-publish LinkedIn post in Michelle's voice. 150–250 words. Open with one punchy line that earns the scroll — a specific observation, a counterintuitive idea, or a moment of dry humor. Follow with 3–4 short paragraphs using the THREE-MOVE STRUCTURE: specific thing noticed, why it matters, bigger idea connecting to design, culture, or human behavior. Close with one clean sentence or a genuine question that invites conversation. Use line breaks between paragraphs (\\n\\n). End with 3–5 relevant hashtags on their own line (e.g. #Design #Branding #NYC). Do not use em-dashes as bullet points. No corporate filler. This is a real post Michelle will publish, not a preview. For source_urls: scan the entire input for anything beginning with http:// or https:// and list them all separated by commas. If no URLs are found, leave source_urls as an empty string.`;

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
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userContent }],
  });

  // When web search is used, the content array contains server_tool_use and
  // web_search_tool_result blocks before the final text block. Find it explicitly.
  const searchCount = message.content.filter(b => b.type === 'server_tool_use').length;
  if (searchCount > 0) {
    console.log(`[claude] Web search used — ${searchCount} search(es) performed`);
  }

  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock) {
    throw new Error(`Claude returned no text block (stop_reason: ${message.stop_reason})`);
  }

  const raw = textBlock.text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  const result = JSON.parse(raw);

  // Web search can inject <cite> and other HTML tags into plain-text fields.
  // Strip all tags from fields that must be plain text.
  const plainTextFields = ['newsletter_blurb', 'linkedin_hook', 'instagram_caption', 'section_name', 'piece_title', 'blog_potential', 'source_urls'];
  for (const field of plainTextFields) {
    if (typeof result[field] === 'string') {
      result[field] = result[field].replace(/<[^>]+>/g, '');
    }
  }

  return result;
}

module.exports = { processContent };
