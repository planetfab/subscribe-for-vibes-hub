const axios = require('axios');
const config = require('../config');
const { resizeToJpeg, decodeBuffer } = require('../image-utils');

// Build a Gutenberg wp:image block, including an optional figcaption.
function wpImageBlock(url, caption) {
  const captionAttr = caption ? `,"caption":${JSON.stringify(caption)}` : '';
  const figcaption = caption
    ? `<figcaption class="wp-element-caption">${caption}</figcaption>`
    : '';
  return `<!-- wp:image {"sizeSlug":"large"${captionAttr}} -->\n<figure class="wp-block-image size-large"><img src="${url}" alt=""/>${figcaption}</figure>\n<!-- /wp:image -->`;
}

// Build Gutenberg-compatible HTML for the post body from plain text.
// Inline images (2nd, 3rd) are inserted as wp:image blocks after the first paragraph.
// inlineImages: [{ url, caption? }]
function buildPostContent(blurb, inlineImages) {
  const paragraphs = (blurb || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<!-- wp:paragraph -->\n<p>${p.replace(/\n/g, '<br>')}</p>\n<!-- /wp:paragraph -->`);

  if (!inlineImages.length) {
    return paragraphs.join('\n\n') || '';
  }

  const imgBlocks = inlineImages.map(m => wpImageBlock(m.url, m.caption)).join('\n\n');

  if (!paragraphs.length) return imgBlocks;

  // Insert image block(s) after the first paragraph
  return [paragraphs[0], imgBlocks, ...paragraphs.slice(1)].join('\n\n');
}

// Build post body from Quill HTML. Inline images are inserted after the first </p>.
// inlineImages: [{ url, caption? }]
function buildPostContentFromHtml(html, inlineImages) {
  if (!inlineImages.length) return html || '';

  const imgBlocks = inlineImages.map(m => wpImageBlock(m.url, m.caption)).join('\n\n');

  if (!html) return imgBlocks;

  const firstParaEnd = html.indexOf('</p>');
  if (firstParaEnd === -1) return html + '\n\n' + imgBlocks;
  return html.slice(0, firstParaEnd + 4) + '\n\n' + imgBlocks + html.slice(firstParaEnd + 4);
}

async function saveToWordPress(item, author = 'fabrice') {
  const creds = config.wordpress[author];
  const { siteUrl } = config.wordpress;

  if (!creds?.username || !creds?.appPassword) {
    const vars = author === 'michelle'
      ? 'WORDPRESS_MICHELLE_USERNAME and WORDPRESS_MICHELLE_APP_PASSWORD'
      : 'WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD';
    throw new Error(`WordPress credentials not configured for ${author}. Set ${vars} in Railway environment variables.`);
  }

  const { username, appPassword } = creds;

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const authHeader = { Authorization: `Basic ${credentials}` };

  // Upload all card images to the WP media library.
  // First image → resized to 1536×1024 JPEG → used as featured image.
  // Additional images → original size/format → embedded inline in the post body.
  // null is pushed on individual failures to keep index alignment; failures are non-blocking.
  const images = item.images || [];
  const uploadedMedia = []; // { id, source_url, caption? } | null per image

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      let imageBuffer, contentType, filename;
      if (i === 0) {
        imageBuffer = await resizeToJpeg(img.data, 1536, 1024);
        contentType = 'image/jpeg';
        filename = img.filename ? img.filename.replace(/\.[^.]+$/, '.jpg') : 'featured.jpg';
      } else {
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

      const mediaId = mediaRes.data.id;
      const caption = img.caption || '';

      // Set the caption on the WP media object so it appears in the media library
      // and in theme templates that render the featured image caption.
      if (caption) {
        try {
          await axios.post(
            `${siteUrl}/wp-json/wp/v2/media/${mediaId}`,
            { caption: { raw: caption } },
            { headers: { ...authHeader, 'Content-Type': 'application/json' } }
          );
        } catch (capErr) {
          console.error(`[wordpress] media ${mediaId} caption update failed: ${capErr.message}`);
        }
      }

      uploadedMedia.push({ id: mediaId, source_url: mediaRes.data.source_url, caption });
      console.log(`[wordpress] uploaded media ${i + 1}/${images.length} — WP media ID ${mediaId}${caption ? ' (with caption)' : ''}`);
    } catch (err) {
      console.error(`[wordpress] media upload ${i + 1} failed: ${err.message}`);
      uploadedMedia.push(null);
    }
  }

  const featuredMediaId = uploadedMedia[0]?.id || null;
  // Images 2 and 3 (if uploaded successfully) are embedded inline in the post body
  const inlineImages = uploadedMedia.slice(1).filter(Boolean).map(m => ({ url: m.source_url, caption: m.caption }));

  // Prefer blog_post (rich Quill HTML or Claude plain text) over newsletter_blurb.
  // If blog_post is HTML from Quill (starts with <), use the HTML-aware builder
  // so inline image blocks land after the first </p> rather than the first Gutenberg block.
  let content;
  const blogPostText = (item.blog_post || '').trim();
  if (blogPostText && blogPostText.startsWith('<')) {
    content = buildPostContentFromHtml(blogPostText, inlineImages);
  } else if (blogPostText) {
    content = buildPostContent(blogPostText, inlineImages);
  } else {
    content = buildPostContent(item.newsletter_blurb, inlineImages);
  }

  // Send meta_description to Yoast SEO (yoast_meta) and as the WP excerpt as fallback.
  // Both fields are included simultaneously: WP silently ignores yoast_meta when the
  // plugin is absent, and Yoast takes precedence over the excerpt when it is present.
  const metaFields = item.meta_description
    ? {
        yoast_meta: { yoast_wpseo_metadesc: item.meta_description },
        excerpt:    { raw: item.meta_description },
      }
    : {};

  const { data } = await axios.post(
    `${siteUrl}/wp-json/wp/v2/posts`,
    {
      title:   item.piece_title,
      content,
      status:  'draft',
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
      ...metaFields,
    },
    { headers: { ...authHeader, 'Content-Type': 'application/json' } }
  );

  return {
    wordpressPostId: data.id,
    editUrl: `${siteUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
    featuredMediaId,
    inlineImagesCount: inlineImages.length,
  };
}

module.exports = { saveToWordPress };
