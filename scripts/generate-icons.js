/**
 * generate-icons.js
 * 
 * Converts resources/icon.png into all the formats electron-builder needs:
 *   build/icon.ico      — Windows app + installer icon (multi-size)
 *   build/icon.icns     — macOS app icon
 *   build/icon.png      — Fallback / Linux 512×512
 *   build/icons/         — Linux icon set (16–512px)
 *   build/installerSidebar.bmp — NSIS wizard sidebar (164×314)
 */

const fs = require('fs');
const path = require('path');

const SOURCE_ICON = path.join(__dirname, '..', 'resources', 'icon.png');
const BUILD_DIR = path.join(__dirname, '..', 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');

async function main() {
  // Ensure build directories exist
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  if (!fs.existsSync(SOURCE_ICON)) {
    console.error('ERROR: resources/icon.png not found!');
    process.exit(1);
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.warn('sharp not installed — falling back to png2icons only');
    sharp = null;
  }

  const sourceBuffer = fs.readFileSync(SOURCE_ICON);

  // ─── Generate .ico (Windows) ───────────────────────────────────────────
  try {
    const png2icons = require('png2icons');
    const icoBuffer = png2icons.createICO(sourceBuffer, png2icons.BICUBIC2, 0, true, true);
    if (icoBuffer) {
      fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
      console.log('✓ build/icon.ico');
    } else {
      console.warn('⚠ Failed to create ICO — png2icons returned null');
    }
  } catch (err) {
    console.warn('⚠ ICO generation failed:', err.message);
    // Fallback: copy the PNG as icon.ico is not critical for dev builds
  }

  // ─── Generate .icns (macOS) ────────────────────────────────────────────
  try {
    const png2icons = require('png2icons');
    const icnsBuffer = png2icons.createICNS(sourceBuffer, png2icons.BICUBIC2, 0);
    if (icnsBuffer) {
      fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), icnsBuffer);
      console.log('✓ build/icon.icns');
    } else {
      console.warn('⚠ Failed to create ICNS — png2icons returned null');
    }
  } catch (err) {
    console.warn('⚠ ICNS generation failed:', err.message);
  }

  // ─── Copy base PNG ────────────────────────────────────────────────────
  fs.copyFileSync(SOURCE_ICON, path.join(BUILD_DIR, 'icon.png'));
  console.log('✓ build/icon.png');

  // ─── Generate Linux icon sizes ─────────────────────────────────────────
  const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512];
  if (sharp) {
    for (const size of linuxSizes) {
      try {
        await sharp(SOURCE_ICON)
          .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(path.join(ICONS_DIR, `${size}x${size}.png`));
        console.log(`✓ build/icons/${size}x${size}.png`);
      } catch (err) {
        console.warn(`⚠ Failed to generate ${size}x${size}:`, err.message);
      }
    }
  } else {
    // Fallback: just copy the source for all sizes
    for (const size of linuxSizes) {
      fs.copyFileSync(SOURCE_ICON, path.join(ICONS_DIR, `${size}x${size}.png`));
    }
    console.log('✓ build/icons/ (copied source for all sizes — install sharp for proper resizing)');
  }

  // ─── Generate NSIS Installer Sidebar (164×314 BMP) ─────────────────────
  if (sharp) {
    try {
      await generateInstallerSidebar(sharp);
      console.log('✓ build/installerSidebar.bmp');
    } catch (err) {
      console.warn('⚠ Sidebar BMP generation failed:', err.message);
      await generateFallbackSidebar(sharp);
    }
  } else {
    console.warn('⚠ Skipping NSIS sidebar — sharp not available');
  }

  console.log('\nAll build assets generated successfully!');
}

async function generateInstallerSidebar(sharp) {
  const SIDEBAR_W = 164;
  const SIDEBAR_H = 314;
  const ICON_SIZE = 96;
  const ICON_Y = 30;

  const iconResized = await sharp(SOURCE_ICON)
    .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 14, g: 14, b: 20, alpha: 1 } })
    .removeAlpha()
    .png()
    .toBuffer();

  const iconX = Math.floor((SIDEBAR_W - ICON_SIZE) / 2);

  // Composite: dark background + icon + gold accent line
  const sidebarPng = await sharp({
    create: {
      width: SIDEBAR_W,
      height: SIDEBAR_H,
      channels: 3,
      background: { r: 14, g: 14, b: 20 },
    },
  })
    .composite([
      {
        input: iconResized,
        left: iconX,
        top: ICON_Y,
      },
      {
        input: await sharp({
          create: {
            width: ICON_SIZE + 20,
            height: 2,
            channels: 3,
            background: { r: 212, g: 168, b: 83 },
          },
        }).png().toBuffer(),
        left: iconX - 10,
        top: ICON_Y + ICON_SIZE + 16,
      },
    ])
    .removeAlpha()
    .raw()
    .toBuffer();

  // Write 24-bit BMP manually (sharp doesn't support BMP output)
  writeBmp24(path.join(BUILD_DIR, 'installerSidebar.bmp'), SIDEBAR_W, SIDEBAR_H, sidebarPng);
}

async function generateFallbackSidebar(sharp) {
  try {
    const W = 164, H = 314;
    const raw = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 14, g: 14, b: 20 } },
    }).removeAlpha().raw().toBuffer();
    writeBmp24(path.join(BUILD_DIR, 'installerSidebar.bmp'), W, H, raw);
    console.log('✓ build/installerSidebar.bmp (fallback — solid dark)');
  } catch (err) {
    console.warn('⚠ Fallback sidebar failed:', err.message);
  }
}

/**
 * Write a 24-bit uncompressed BMP file from raw RGB pixel data.
 * BMP stores rows bottom-to-top and pixels as BGR.
 */
function writeBmp24(outPath, width, height, rgbBuffer) {
  const rowBytes = width * 3;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const paddedRowBytes = rowBytes + rowPadding;
  const pixelDataSize = paddedRowBytes * height;
  const fileSize = 54 + pixelDataSize; // 14 (file header) + 40 (DIB header) + pixels

  const buf = Buffer.alloc(fileSize);
  let offset = 0;

  // ── BMP File Header (14 bytes) ──
  buf.write('BM', 0);                    // Signature
  buf.writeUInt32LE(fileSize, 2);         // File size
  buf.writeUInt16LE(0, 6);               // Reserved
  buf.writeUInt16LE(0, 8);               // Reserved
  buf.writeUInt32LE(54, 10);             // Pixel data offset

  // ── DIB Header — BITMAPINFOHEADER (40 bytes) ──
  buf.writeUInt32LE(40, 14);             // Header size
  buf.writeInt32LE(width, 18);           // Width
  buf.writeInt32LE(height, 22);          // Height (positive = bottom-up)
  buf.writeUInt16LE(1, 26);              // Color planes
  buf.writeUInt16LE(24, 28);             // Bits per pixel
  buf.writeUInt32LE(0, 30);              // Compression (BI_RGB = none)
  buf.writeUInt32LE(pixelDataSize, 34);  // Image size
  buf.writeInt32LE(2835, 38);            // H resolution (72 DPI)
  buf.writeInt32LE(2835, 42);            // V resolution (72 DPI)
  buf.writeUInt32LE(0, 46);              // Colors in palette
  buf.writeUInt32LE(0, 50);              // Important colors

  // ── Pixel Data (bottom-to-top, BGR) ──
  offset = 54;
  for (let y = height - 1; y >= 0; y--) {
    const srcRow = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const srcIdx = srcRow + x * 3;
      buf[offset++] = rgbBuffer[srcIdx + 2]; // B
      buf[offset++] = rgbBuffer[srcIdx + 1]; // G
      buf[offset++] = rgbBuffer[srcIdx + 0]; // R
    }
    // Row padding
    for (let p = 0; p < rowPadding; p++) {
      buf[offset++] = 0;
    }
  }

  fs.writeFileSync(outPath, buf);
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
