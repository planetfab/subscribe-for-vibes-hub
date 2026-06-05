const axios = require('axios');
const config = require('../config');
const { resizeToJpeg, decodeBuffer } = require('../image-utils');

async function saveToWordPress(item) {
  const { username, appPassword, siteUrl } = config.wordpress;

  if (!username || !appPassword) {
    throw new Error(
      'WordPress credentials not configured. Set WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD in Railway environment variables.'
    );
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const authHeader = { Authorization: `Basic ${credentials}` };

  // Upload all card images to the WP media library.
  // The first image is resized to 1536×1024 and used as the featured image.
  // Additional images are uploaded at their original size/format.
  // Individual upload failures are logged but don't block post creation.
  const images = item.images || [];
  let featuredMediaId = null;
  const uploadedMediaIds = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      let imageBuffer, contentType, filename;
      if (i === 0) {
        // Featured image: resize to 1536×1024, convert to JPEG
        imageBuffer = await resizeToJpeg(img.data, 1536, 1024);
        contentType = 'image/jpeg';
        filename = img.filename
          ? img.filename.replace(/\.[^.]+$/, '.jpg')
          : 'featured.jpg';
      } else {
        // Additional images: original size and format
        imageBuffer = decodeBuffer(img.data);
        contentType = img.contentType || 'image/jpeg';
        filename = img.filename || `image-${i}.jpg`;
      }

      const mediaRes = await axios.post(
        `${siteUrl}/wp-json/wp/v2/media`,
        imageBuffer,
        {
          headers: {
            ...authHeader,
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      uploadedMediaIds.push(mediaRes.data.id);
      if (i === 0) featuredMediaId = mediaRes.data.id;
      console.log(`[wordpress] uploaded media ${i + 1}/${images.length} — WP media ID ${mediaRes.data.id}`);
    } catch (err) {
      console.error(`[wordpress] media upload ${i + 1} failed: ${err.message}`);
    }
  }

  // Create the draft post, attaching the featured image if upload succeeded
  const postBody = {
    title:   item.piece_title,
    content: item.newsletter_blurb,
    status:  'draft',
    ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
  };

  const { data } = await axios.post(
    `${siteUrl}/wp-json/wp/v2/posts`,
    postBody,
    { headers: { ...authHeader, 'Content-Type': 'application/json' } }
  );

  return {
    wordpressPostId: data.id,
    editUrl: `${siteUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
    featuredMediaId,
    uploadedMediaIds,
  };
}

module.exports = { saveToWordPress };
