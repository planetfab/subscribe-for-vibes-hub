const axios = require('axios');
const config = require('../config');
const db = require('../database');
const { resizeToJpeg } = require('../image-utils');

const GRAPH = 'https://graph.facebook.com/v25.0';

async function uploadImageToWordPress(img) {
  const creds = config.wordpress.fabrice;
  if (!creds?.username || !creds?.appPassword) return null;

  const imageBuffer = await resizeToJpeg(img.data, 1080, 1080);
  const filename = img.filename ? img.filename.replace(/\.[^.]+$/, '.jpg') : 'instagram.jpg';
  const auth = Buffer.from(`${creds.username}:${creds.appPassword}`).toString('base64');

  try {
    const res = await axios.post(
      `${config.wordpress.siteUrl}/wp-json/wp/v2/media`,
      imageBuffer,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
    return res.data.source_url;
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.code || err.message;
    throw new Error(`WordPress image upload failed: ${detail}`);
  }
}

async function publishToInstagram(item) {
  const token     = await db.getSetting('instagram_access_token') || config.meta.instagramToken;
  const accountId = await db.getSetting('instagram_account_id')   || config.meta.instagramUserId;

  if (!token || !accountId) {
    throw new Error('Instagram credentials not configured. Go to /settings and connect via OAuth.');
  }

  const images = item.images || [];
  if (!images.length) {
    throw new Error('Instagram posts require an image. Add an image to this card before publishing.');
  }

  const imageUrl = await uploadImageToWordPress(images[0]);
  if (!imageUrl) {
    throw new Error('WordPress credentials not configured — needed to host the image for Instagram.');
  }

  // Step 1: create media container
  let containerRes;
  try {
    containerRes = await axios.post(`${GRAPH}/${accountId}/media`, {
      image_url: imageUrl,
      caption: item.instagram_caption,
      cross_post_to_facebook_page: true,
      access_token: token,
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(`Instagram media container failed: ${detail}`);
  }

  // Step 1.5: wait for container to be ready (Instagram processes asynchronously)
  const containerId = containerRes.data.id;
  const MAX_POLLS = 10;
  const POLL_INTERVAL_MS = 3000;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await axios.get(`${GRAPH}/${containerId}`, {
      params: { fields: 'status_code', access_token: token },
    });
    const statusCode = statusRes.data.status_code;
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR') throw new Error('Instagram media container processing failed');
    if (i === MAX_POLLS - 1) throw new Error('Instagram media container timed out after 30 seconds');
  }

  // Step 2: publish the container
  let publishRes;
  try {
    publishRes = await axios.post(`${GRAPH}/${accountId}/media_publish`, {
      creation_id: containerId,
      access_token: token,
    });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    throw new Error(`Instagram publish failed: ${detail}`);
  }

  return { instagramPostId: publishRes.data.id };
}

module.exports = { publishToInstagram };
