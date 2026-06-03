const axios = require('axios');
const config = require('../config');

const PROFILES = {
  fabrice: () => ({
    token: config.linkedin.fabriceToken,
    urn: config.linkedin.fabriceUrn,
  }),
  michelle: () => ({
    token: config.linkedin.michelleToken,
    urn: config.linkedin.michelleUrn,
  }),
  planetfab: () => ({
    token: config.linkedin.planetfabToken,
    urn: config.linkedin.planetfabPageId
      ? `urn:li:organization:${config.linkedin.planetfabPageId}`
      : null,
  }),
};

async function publishToLinkedIn(item, type) {
  const profileFn = PROFILES[type];
  if (!profileFn) throw new Error(`Unknown LinkedIn profile type: ${type}`);

  const { token, urn } = profileFn();
  if (!token || !urn) {
    throw new Error(
      `LinkedIn credentials not configured for "${type}". ` +
      'Complete the OAuth flow after the app is live at hub.planetfab.com.'
    );
  }

  // Build post text: hook + first source URL if available
  const firstUrl = (item.source_urls || '').split(',').map(u => u.trim()).find(Boolean) || '';
  const postText = firstUrl
    ? `${item.linkedin_hook}\n\n${firstUrl}`
    : item.linkedin_hook;

  const { data } = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  return { linkedinPostId: data.id };
}

module.exports = { publishToLinkedIn };
