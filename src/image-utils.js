const sharp = require('sharp');

// Resize a base64-encoded image to exact dimensions, output as JPEG.
// Used for LinkedIn (1200×627) and WordPress featured image (1536×1024).
// 'cover' fit crops to fill the target rectangle from the centre.
async function resizeToJpeg(base64data, width, height) {
  return sharp(Buffer.from(base64data, 'base64'))
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Decode a base64 image to a Buffer without any format conversion.
// Used for non-featured WordPress media uploads (original size/format).
function decodeBuffer(base64data) {
  return Buffer.from(base64data, 'base64');
}

module.exports = { resizeToJpeg, decodeBuffer };
