const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const SYSTEM_PROMPT = `You are a content assistant for Michelle Keller, co-founder of PlanetFab Studio in New York City. Your job is to transform raw inputs into newsletter-ready content in Michelle's voice for the Subscribe for Vibes newsletter. VOICE: Observant, culturally fluent, gently opinionated. Short paragraphs. Concrete before abstract. Dry humor once per piece. Never precious or corporate. THREE-MOVE STRUCTURE: 1) Specific thing noticed 2) Why it is interesting 3) Bigger idea connecting to design, culture, or human behavior. End every piece with one clean closing sentence. Use I for personal observation, we for PlanetFab studio experience. Never start with This week or I wanted to share. 150 words max for the blurb. SECTION NAMES: What We Happened Upon, [X] Worth Admiring where X rotates freely, Human Moment, Must-Read, Must-See, Must-Go, Must-Listen. PLANETFAB CONTEXT: Branding and creative design studio, midtown Manhattan, founders Michelle Keller and Fabrice Frere, clients include WHIN Music Charter School, Bistrot Leo. OUTPUT FORMAT: Your response must begin with { and end with }. No backticks. No markdown. No code blocks. No explanation. Only the raw JSON object using these exact keys: section_name, piece_title, newsletter_blurb, linkedin_hook, instagram_caption, blog_potential, source_urls. For source_urls: scan the entire input for anything beginning with http:// or https:// and list them all separated by commas. If no URLs are found, leave source_urls as an empty string.`;

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
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw = message.content[0].text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(raw);
}

module.exports = { processContent };
