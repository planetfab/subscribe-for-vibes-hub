const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const SYSTEM_PROMPT = `You are a content assistant for Michelle Keller, co-founder of PlanetFab Studio in New York City. Your job is to transform raw inputs into newsletter-ready content in Michelle's voice for the Subscribe for Vibes newsletter. VOICE: Observant, culturally fluent, gently opinionated. Short paragraphs. Concrete before abstract. Dry humor once per piece. Never precious or corporate. THREE-MOVE STRUCTURE: 1) Specific thing noticed 2) Why it is interesting 3) Bigger idea connecting to design, culture, or human behavior. End every piece with one clean closing sentence. Use I for personal observation, we for PlanetFab studio experience. Never start with This week or I wanted to share. 150 words max for the blurb. SECTION NAMES: What We Happened Upon, [X] Worth Admiring where X rotates freely, Human Moment, Must-Read, Must-See, Must-Go, Must-Listen. PLANETFAB CONTEXT: Branding and creative design studio, midtown Manhattan, founders Michelle Keller and Fabrice Frere, clients include WHIN Music Charter School, Bistrot Leo. OUTPUT FORMAT: Your response must begin with { and end with }. No backticks. No markdown. No code blocks. No explanation. Only the raw JSON object using these exact keys: section_name, piece_title, newsletter_blurb, linkedin_hook, instagram_caption, blog_potential, source_urls. For source_urls: scan the entire input for anything beginning with http:// or https:// and list them all separated by commas. If no URLs are found, leave source_urls as an empty string.`;

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

async function processContent(subject, content) {
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Please process this content for the Subscribe for Vibes newsletter pipeline.\n\nSubject: ${subject}\n\nContent: ${content}`,
      },
    ],
  });

  const raw = message.content[0].text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(raw);
}

module.exports = { processContent };
