const axios = require('axios');
const config = require('../config');
const db = require('../database');
const { resizeToJpeg } = require('../image-utils');

async function resolveProfile(type) {
  const dbToken = await db.getSetting(`linkedin_${type}_token`);
  const dbUrn   = await db.getSetting(`linkedin_${type}_urn`);

  let token, urn;

  if (type === 'planetfab') {
    token = dbToken || config.linkedin.planetfabToken;
    urn   = dbUrn
      || (config.linkedin.planetfabPageId ? `urn:li:organization:${config.linkedin.planetfabPageId}` : null);
  } else {
    token = dbToken || config.linkedin[`${type}Token`];
    urn   = dbUrn   || config.linkedin[`${type}Urn`];
  }

  return { token, urn };
}

// Upload an image to LinkedIn and return the asset URN.
// Only called for personal accounts (fabrice/michelle) — company page image
// upload requires Marketing Developer Platform approval.
async function uploadImageToLinkedIn(token, urn, image) {
  const imageBuffer = await resizeToJpeg(image.data, 1200, 627);

  // Step 1: register the upload slot
  const registerRes = await axios.post(
    'https://api.linkedin.com/v2/assets?action=registerUpload',
    {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: urn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
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

  const { asset, uploadMechanism } = registerRes.data.value;
  const uploadUrl = uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

  // Step 2: PUT the binary image to the pre-signed upload URL
  await axios.put(uploadUrl, imageBuffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return asset;
}

async function publishToLinkedIn(item, type) {
  const validTypes = ['fabrice', 'michelle', 'planetfab'];
  if (!validTypes.includes(type)) throw new Error(`Unknown LinkedIn profile type: ${type}`);

  const { token, urn } = await resolveProfile(type);

  if (!token || !urn) {
    throw new Error(
      `LinkedIn credentials not configured for "${type}". ` +
      'Go to /settings and connect the account via OAuth.'
    );
  }

  const firstUrl = (item.source_urls || '').split(',').map(u => u.trim()).find(Boolean) || '';
  const postText = firstUrl ? `${item.linkedin_hook}\n\n${firstUrl}` : item.linkedin_hook;

  // Attempt image upload for personal accounts only
  const firstImage = item.images?.[0];
  let assetUrn = null;
  if (firstImage && (type === 'fabrice' || type === 'michelle')) {
    assetUrn = await uploadImageToLinkedIn(token, urn, firstImage);
  }

  const shareContent = assetUrn
    ? {
        shareCommentary: { text: postText },
        shareMediaCategory: 'IMAGE',
        media: [{
          status: 'READY',
          description: { text: '' },
          media: assetUrn,
          title: { text: item.piece_title || '' },
        }],
      }
    : {
        shareCommentary: { text: postText },
        shareMediaCategory: 'NONE',
      };

  const { data } = await axios.post(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  return { linkedinPostId: data.id, imageAttached: !!assetUrn };
}

module.exports = { publishToLinkedIn };
