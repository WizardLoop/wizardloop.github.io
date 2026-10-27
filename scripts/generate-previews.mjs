import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Keep lossless poster masters and original TGS files unchanged. These small
// delivery copies preserve dimensions and alpha for responsive portfolio cards.
const source = new URL('../public/media/posters/', import.meta.url);
const destination = new URL('../public/media/previews/', import.meta.url);
await mkdir(destination, { recursive: true });
sharp.concurrency(2);
let inputBytes = 0, outputBytes = 0, count = 0;
for (const name of (await readdir(source)).filter(name => name.endsWith('.webp')).sort()) {
  const original = await readFile(new URL(name, source));
  const before = await sharp(original).metadata();
  const optimized = await sharp(original).webp({ quality: 94, alphaQuality: 100, effort: 5 }).toBuffer();
  const after = await sharp(optimized).metadata();
  if (after.width !== before.width || after.height !== before.height || after.hasAlpha !== before.hasAlpha) throw new Error(`Preview dimensions or alpha changed: ${name}`);
  const output = optimized.length < original.length ? optimized : original;
  await writeFile(new URL(name, destination), output);
  inputBytes += original.length;
  outputBytes += output.length;
  count += 1;
}
console.log(JSON.stringify({ previews: count, inputBytes, outputBytes, quality: 94, alphaQuality: 100, originalsUnchanged: true }));
