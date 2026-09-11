/**
 * `npm run icons` — writes the app icons under `src/app/` from the `HikerMark` component, so the
 * favicon, the home-screen icon, and the inline logo are one drawing. Run it after changing the
 * mark and commit the files it writes.
 *
 *   icon.svg        any size, modern browsers
 *   favicon.ico     16, 32, and 48 px for browsers that still ask for one
 *   apple-icon.png  180 px for iOS home screens
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

import { HikerMark } from "../src/components/hiker-mark";

const APP_DIR = path.resolve(import.meta.dirname, "../src/app");
const ICO_SIZES = [16, 32, 48];

const svg = renderToStaticMarkup(<HikerMark />);
const raster = (size: number) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/**
 * An ICO is a 6-byte header, one 16-byte directory entry per image, then the images. Entries may
 * hold PNG data directly, which every browser reads.
 */
function ico(pngs: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries: Buffer[] = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width; 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)]);
}

const pngs = await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await raster(size) })));

await Promise.all([
  writeFile(path.join(APP_DIR, "icon.svg"), `${svg}\n`),
  writeFile(path.join(APP_DIR, "favicon.ico"), ico(pngs)),
  writeFile(path.join(APP_DIR, "apple-icon.png"), await raster(180)),
]);

console.log("Wrote src/app/icon.svg, favicon.ico, and apple-icon.png");
