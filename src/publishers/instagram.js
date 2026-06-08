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
  const containerRes = await axios.post(`${GRAPH}/${accountId}/media`, {
    image_url: imageUrl,
    caption: item.instagram_caption,
    access_token: token,
  });

  // Step 2: publish the container
  const publishRes = await axios.post(`${GRAPH}/${accountId}/media_publish`, {
    creation_id: containerRes.data.id,
    access_token: token,
  });

  return { instagramPostId: publishRes.data.id };
}

module.exports = { publishToInstagram };
