/**
 * @fileoverview Client-side cover image compression utility.
 * Resizes gallery or camera photos onto an offscreen canvas (`<= 480px`, JPEG 0.82)
 * so custom book covers remain crisp while keeping IndexedDB / JSON backups compact.
 */

/**
 * Reads an image `File` and compresses it to a compact `data:image/jpeg;base64,...` URL.
 * Falls back gracefully to the raw FileReader Data URL in environments without 2D canvas.
 *
 * @param {File} file
 * @param {{ maxDimension?: number, quality?: number }} [options]
 * @returns {Promise<string>}
 */
export async function compressImageFileToDataUrl(file, options = {}) {
  const maxDimension = options.maxDimension || 480;
  const quality = options.quality || 0.82;

  const rawDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });

  if (!rawDataUrl.startsWith('data:image/')) {
    throw new Error('Selected file is not a supported image.');
  }

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return rawDataUrl;
  }

  try {
    const compressed = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const srcW = img.naturalWidth || img.width || maxDimension;
        const srcH = img.naturalHeight || img.height || maxDimension;
        const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
        const targetW = Math.max(1, Math.round(srcW * scale));
        const targetH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.fillStyle = '#FAF6EE';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not decode image file.'));
      img.src = rawDataUrl;
    });
    return compressed;
  } catch (_) {
    return rawDataUrl;
  }
}
