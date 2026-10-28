import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Source art remains unchanged. Derived brand media is outside the code MIT grant.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const profilePath = path.join(publicDir, 'media/profile/avatar.jpg');
const posterDir = path.join(publicDir, 'media/posters');
const palette = {paper:'#f5f2e9', ink:'#202222', violet:'#6241cb', pale:'#e4dcf7'};
const xml = value => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
const svgBuffer = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${body}</svg>`);

// Native Pango on the tested Windows host does not load the site's WOFF2 fonts.
// Use installed Arial for these raster labels. Other hosts may use Pango's sans
// fallback, so pixel-identical typography across operating systems is not claimed.
// No system font files are copied or redistributed by this script.
async function lettering(value, {left, top, size, kind='display', color=palette.ink, weight='Semi-Bold', maxWidth=600}) {
  if (value.includes(String.fromCharCode(0x2014))) throw new Error('Restricted punctuation in brand copy');
  const style = kind === 'italic' ? 'Bold Italic' : weight;
  const {data, info} = await sharp({text:{
    text:`<span foreground="${color}">${xml(value)}</span>`,
    font:`Arial ${style} ${size}`, rgba:true, dpi:72,
  }}).png().toBuffer({resolveWithObject:true});
  if (info.width > maxWidth || top + info.height > 630) throw new Error(`Brand typography exceeds layout: ${value}`);
  return {input:data,left,top};
}

const avatar = await fs.readFile(profilePath);
const avatarInfo = await sharp(avatar).metadata();
if (!avatarInfo.width || !avatarInfo.height) throw new Error('The current profile image is invalid');

async function roundAvatar(size, paletteOutput=false) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
  return sharp(avatar).rotate().resize(size,size,{fit:'cover'})
    .composite([{input:mask,blend:'dest-in'}])
    .png({palette:paletteOutput,colors:64,compressionLevel:9}).toBuffer();
}

const [icon16,icon32,icon180,svgPixel,profileBadge,portal,signature] = await Promise.all([
  roundAvatar(16), roundAvatar(32),
  sharp(avatar).rotate().resize(180,180,{fit:'cover'}).removeAlpha().png({compressionLevel:9}).toBuffer(),
  roundAvatar(32,true), roundAvatar(46),
  sharp(path.join(posterDir,'portal-alchemy.webp')).resize(476,476).png().toBuffer(),
  sharp(path.join(posterDir,'signature-spirit.webp')).resize(148,148).png().toBuffer(),
]);

const background = svgBuffer(`
  <defs>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${palette.ink}" opacity=".11"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="${palette.paper}"/>
  <path d="M54 108H1146M54 545H529" fill="none" stroke="${palette.ink}" stroke-width="1.4"/>
  <circle cx="76" cy="69" r="26" fill="${palette.ink}"/>
  <path d="M400 51v24m-12-12h24m-21-9 18 18m0-18-18 18" stroke="${palette.violet}" stroke-width="1.8"/>
  <path d="M660 131H1148V583H660Z" fill="${palette.ink}"/>
  <path d="M650 121H1138V573H650Z" fill="${palette.pale}" stroke="${palette.ink}" stroke-width="2"/>
  <path d="M651 122H817L651 288ZM1137 572H975L1137 410Z" fill="url(#dots)"/>
  <circle cx="895" cy="347" r="202" fill="${palette.paper}" opacity=".43"/>
  <path d="m1090 150 6 14 14 6-14 6-6 14-6-14-14-6 14-6Z" fill="${palette.paper}" stroke="${palette.ink}" stroke-width="1.5"/>
  <path d="m614 168 7-18 7 18 18 7-18 7-7 18-7-18-18-7Z" fill="${palette.violet}"/>
  <path d="M58 477c123 15 243 13 351-3M64 486c103 11 219 12 309 2" fill="none" stroke="${palette.violet}" stroke-width="3" stroke-linecap="round"/>
  <path d="m1120 55 17 0 0 17m0-17-22 22" fill="none" stroke="${palette.ink}" stroke-width="2"/>
`);

const stamp = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="178" height="184"><path d="M10 12 169 2l8 171-160 10Z" fill="${palette.ink}"/><path d="M1 5 160 1l8 170-160 6Z" fill="${palette.paper}" stroke="${palette.ink}" stroke-width="2"/><path d="m13 14 18 0m-18 0 0 18m139 127-18 0m18 0 0-18" stroke="${palette.violet}" stroke-width="2" fill="none"/></svg>`);

const words = await Promise.all([
  lettering('WizardLoop',{left:114,top:50,size:31,weight:'Bold',maxWidth:266}),
  lettering('DESIGN / MOTION / SOFTWARE',{left:760,top:59,size:13,kind:'body',maxWidth:330}),
  lettering('Code, Design',{left:55,top:179,size:69,maxWidth:550}),
  lettering('& a Little',{left:55,top:267,size:69,maxWidth:510}),
  lettering('Magic.',{left:52,top:342,size:126,kind:'italic',color:palette.violet,maxWidth:480}),
  lettering('wizardloop.com',{left:56,top:567,size:22,weight:'Medium',maxWidth:360}),
]);

const social = await sharp(background).composite([
  {input:portal,left:650,top:112},
  {input:stamp,left:536,top:407},
  {input:signature,left:549,top:423},
  {input:profileBadge,left:53,top:46},
  ...words,
]).removeAlpha().png({compressionLevel:9}).toBuffer();

const svgIcon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32"><title>WizardLoop</title><image width="32" height="32" xlink:href="data:image/png;base64,${svgPixel.toString('base64')}"/></svg>\n`);
const outputs = new Map([
  ['favicon-16.png',icon16], ['favicon-32.png',icon32],
  ['apple-touch-icon.png',icon180], ['favicon.svg',svgIcon],
  ['social-preview.png',social],
]);

// Generate all media before replacing the last valid files.
for (const [name, buffer] of outputs) await fs.writeFile(path.join(publicDir,`${name}.tmp`),buffer);
for (const [name] of outputs) await fs.rename(path.join(publicDir,`${name}.tmp`),path.join(publicDir,name));
console.log(JSON.stringify({generated:[...outputs].map(([name,buffer])=>({name,bytes:buffer.length})),social:{width:1200,height:630},profile:'public/media/profile/avatar.jpg',typography:'Installed Arial or native sans fallback'}));
