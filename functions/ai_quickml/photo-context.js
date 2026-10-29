'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decodeFile, saveLibraryFile, publicFile, authorize, passages } = require('./file-library');
const { sourceChat, intelligenceBlocks, fail } = require('./source-chat');
const manifest = require('./profile-assets.json');

async function uploadPhoto(context, payload, dependencies) {
  authorize(context);
  const image = decodeFile(payload);
  if (!image.mime.startsWith('image/')) fail('Photo analysis requires a PNG, JPEG or WebP image.');
  const digest = crypto.createHash('sha256').update(image.buffer).digest('hex');
  const asset = manifest.profiles.find(item => item.synthetic === true && (item.sha256 === digest || item.source_sha256 === digest));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'netra-photo-'));
  let faces = null, warning = null;
  try {
    const temporary = path.join(directory, `source.${image.ext}`);
    fs.writeFileSync(temporary, image.buffer);
    try {
      const detection = await context.app.zia().analyseFace(fs.createReadStream(temporary), { mode: 'basic', gender: 'false' });
      const count = detection?.faces_count ?? detection?.data?.faces_count ?? detection?.faces?.length ?? detection?.data?.faces?.length;
      if (count != null && Number.isInteger(Number(count)) && Number(count) >= 0) faces = Number(count);
      else warning = 'Zia returned no usable face count. No identity was inferred.';
    } catch { warning = 'Zia face detection is unavailable. The photo was saved; no facial identity was inferred.'; }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  const photo_context = { version: 1, faces_count: faces, synthetic: !!asset, profile_id: asset?.profile_id || null,
    link_method: asset ? 'exact_synthetic_asset_sha256' : 'unidentified',
    notice: asset ? `Exact copy of the fictional demonstration portrait labelled ${asset.name}, profile ${asset.profile_id}. This is a file-hash lookup, not biometric identification. ${manifest.notice}` : 'No known synthetic asset matched. A face photo alone does not establish identity. Open a known record separately to review its documented information.' };
  if (!asset) photo_context.notice += ' This lookup checks the original registered file bytes, not facial similarity. A screenshot, crop, resized image or re-encoded copy may not match. To test the fictional dataset, use Choose registered demo portrait in Photo mode.';
  const text = `${photo_context.notice}\nZia detected faces: ${faces == null ? 'unavailable' : faces}.`;
  const file = await saveLibraryFile(context, { ...image, kind: 'document', filename: payload.name || `photo.${image.ext}`, text, photo_context, extraction: 'Catalyst Zia face detection + synthetic asset lookup' }, dependencies.bucketName);
  const audit = await dependencies.writeAudit(context.app, context.officer, { action: 'PHOTO_UPLOAD', entity: 'DocumentLibrary', entity_id: file.id, model: 'Catalyst Zia Face Detection', detail: { sha256: digest, faces_count: faces, profile_id: photo_context.profile_id, link_method: photo_context.link_method } });
  return { file: publicFile(file), audit_id: audit.id, warning: [warning, !audit.ref ? 'Separate audit archive not confirmed.' : null].filter(Boolean).join(' ') || null };
}

async function photoChat(context, payload, files, dependencies, event) {
  const blocks = [];
  for (const file of files) {
    blocks.push(...passages(file.text).map(block => ({ id: `${file.id}:${block.number}`, title: `${file.filename} · ${file.photo_context ? 'Photo observations' : 'Passage ' + block.number}`, text: block.text })));
    const photo = file.photo_context;
    const asset = photo && manifest.profiles.find(item => item.synthetic && item.profile_id === photo.profile_id && (item.sha256 === file.sha256 || item.source_sha256 === file.sha256));
    if (photo?.link_method === 'exact_synthetic_asset_sha256' && photo.synthetic === true && asset) {
      event('Photo record linkage', 'running', 'Loading the recorded profile linked to the labelled synthetic asset');
      const intelligence = await dependencies.criminalIntelligence(context.app, photo.profile_id);
      if (intelligence?.criminal?.name?.trim().toLowerCase() === asset.name.trim().toLowerCase()) blocks.push(...intelligenceBlocks(intelligence, file.id));
      else blocks.push({ id: `${file.id}:missing-profile`, title: 'Current profile linkage unavailable', text: 'The labelled synthetic asset could not be verified against the current database profile. No other person’s record has been substituted.' });
    }
  }
  return sourceChat(context, payload, blocks, dependencies, event, 'documents');
}
module.exports = { uploadPhoto, photoChat };
