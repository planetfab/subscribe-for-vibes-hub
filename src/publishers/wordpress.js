const axios = require('axios');
const config = require('../config');

async function saveToWordPress(item) {
  const { username, appPassword, siteUrl } = config.wordpress;

  if (!username || !appPassword) {
    throw new Error(
      'WordPress credentials not configured. Set WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD in Railway environment variables.'
    );
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  const { data } = await axios.post(
    `${siteUrl}/wp-json/wp/v2/posts`,
    {
      title:   item.piece_title,
      content: item.newsletter_blurb,
      status:  'draft',
    },
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return {
    wordpressPostId: data.id,
    editUrl: `${siteUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
  };
}

module.exports = { saveToWordPress };
