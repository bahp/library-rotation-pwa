import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

/**
 * Computes CRC32 for PNG chunk integrity.
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a PNG chunk buffer.
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a crisp geometric book-shelf icon PNG with optional maskable safe-zone margin.
 * @param {number} size
 * @param {boolean} maskable
 * @returns {Buffer}
 */
function renderIconPng(size, maskable) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const margin = maskable ? 0.18 : 0.08;
  const radius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;

      // Rounded rect mask for non-maskable icons
      let insideBg = true;
      if (!maskable) {
        const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
        const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
        insideBg = dx * dx + dy * dy <= radius * radius;
      }

      if (!insideBg) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Deep forest-teal background (#0F766E -> #115E59 gradient)
      const grad = y / size;
      let r = Math.round(15 * (1 - grad) + 13 * grad);
      let g = Math.round(118 * (1 - grad) + 88 * grad);
      let b = Math.round(110 * (1 - grad) + 84 * grad);

      // Normalized inner coordinates within safe zone [0, 1]
      const nx = (x / size - margin) / (1 - 2 * margin);
      const ny = (y / size - margin) / (1 - 2 * margin);

      // Three upright book spines + shelf baseline inside safe zone
      const onShelf = nx >= 0.16 && nx <= 0.84 && ny >= 0.78 && ny <= 0.84;
      const book1 = nx >= 0.20 && nx <= 0.35 && ny >= 0.22 && ny <= 0.75;
      const book2 = nx >= 0.41 && nx <= 0.56 && ny >= 0.16 && ny <= 0.75;
      const book3 = nx >= 0.62 && nx <= 0.78 && ny >= 0.26 && ny <= 0.75;

      if (onShelf || book2) {
        r = 248;
        g = 250;
        b = 252; // Crisp white (#F8FAFC)
      } else if (book1) {
        r = 153;
        g = 246;
        b = 228; // Soft mint-teal (#99F6E4)
      } else if (book3) {
        r = 253;
        g = 230;
        b = 138; // Warm amber-bookmark (#FDE68A)
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <rect width="128" height="128" rx="28" fill="#0F766E"/>
  <rect x="26" y="30" width="20" height="62" rx="4" fill="#99F6E4"/>
  <rect x="53" y="22" width="21" height="70" rx="4" fill="#F8FAFC"/>
  <rect x="81" y="35" width="21" height="57" rx="4" fill="#FDE68A"/>
  <rect x="20" y="98" width="88" height="8" rx="4" fill="#F8FAFC"/>
</svg>
`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderIconPng(180, true));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderIconPng(512, true));

console.log('Generated PWA icons in public/');
