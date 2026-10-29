'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 120000;
const ROLES = ['administrator', 'senior_officer', 'investigation_officer', 'analyst'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const identifier = value => {
  if (!/^(document|report)-[a-f0-9]{32}$/.test(String(value || ''))) fail('Invalid library identifier.');
  return value;
};
function authorize(context) {
  if (!context.authenticated) fail('Sign in to access your document library.', 401);
  if (!ROLES.includes(context.officer.role)) fail('Your role cannot access the document library.', 403);
}
function archive(context, bucketName) {
  authorize(context);
  return { bucket: context.app.stratus().bucket(bucketName), prefix: `library/${hash(String(context.officer.id)).slice(0, 32)}/` };
}
async function collect(value, limit = MAX_BYTES) {
  if (Buffer.isBuffer(value)) { if (value.length > limit) fail('Stored file exceeds the download limit.', 413); return value; }
  const chunks = []; let size = 0;
  for await (const chunk of value) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length; if (size > limit) fail('Stored file exceeds the download limit.', 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
async function readJson(bucket, key) { return JSON.parse((await collect(await bucket.getObject(key), 2 * 1024 * 1024)).toString('utf8')); }
async function writeJson(bucket, key, value) {
  if (await bucket.putObject(key, JSON.stringify(value), { overwrite: false, contentType: 'application/json' }) === false) fail('The library did not confirm the metadata save.', 502);
}
function publicFile(file) {
  const { text, storage, storage_ref, owner, ...metadata } = file;
  return metadata;
}
async function getFile(context, id, bucketName) {
  const { bucket, prefix } = archive(context, bucketName);
  let file;
  try { file = await readJson(bucket, `${prefix}metadata/${identifier(id)}.json`); }
  catch (error) { if (error.statusCode === 400) throw error; fail('This file is unavailable in your library.', 404); }
  if (file.owner !== String(context.officer.id) || file.id !== id) fail('This file is unavailable in your library.', 404);
  return file;
}
function passages(text) {
  const blocks = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 1600, text.length);
    const newline = text.lastIndexOf('\n', end);
    if (end < text.length && newline > start + 700) end = newline;
    blocks.push({ number: blocks.length + 1, text: text.slice(start, end).trim() });
    start = end;
  }
  return blocks.filter(block => block.text);
}

async function saveLibraryFile(context, input, bucketName) {
  const { bucket, prefix } = archive(context, bucketName);
  const { buffer, mime, kind } = input;
  if (!['document', 'report'].includes(kind) || !Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES) fail('Use a non-empty file up to 8 MB.', 413);
  const id = `${kind}-${crypto.randomBytes(16).toString('hex')}`;
  const filename = String(input.filename || 'document.pdf').replace(/[^\p{L}\p{M}\p{N}._ -]/gu, '_').slice(0, 160);
  const fullText = String(input.text || '').replace(/\u0000/g, '').trim();
  const text = fullText.slice(0, MAX_TEXT);
  const folderId = input.storageProvider === 'stratus' ? null : process.env.NETRA_FILESTORE_FOLDER_ID;
  let storage, storageRef;
  if (folderId) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'netra-library-'));
    let uploaded;
    try {
      const temporary = path.join(directory, filename);
      fs.writeFileSync(temporary, buffer);
      uploaded = await context.app.filestore().folder(folderId).uploadFile({ code: fs.createReadStream(temporary), name: `${id}-${filename}` });
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    if (!uploaded?.id) fail('Catalyst FileStore did not confirm the upload.', 502);
    storage = { provider: 'filestore', folder_id: String(folderId), file_id: String(uploaded.id) };
    storageRef = `filestore://${folderId}/${uploaded.id}`;
  } else {
    const key = `${prefix}files/${id}`;
    if (await bucket.putObject(key, buffer, { overwrite: false, contentType: mime }) === false) fail('Catalyst Stratus did not confirm the upload.', 502);
    storage = { provider: 'stratus', key };
    storageRef = `stratus://${bucketName}/${key}`;
  }
  const file = {
    version: 'library-v1', id, owner: String(context.officer.id), kind, filename,
    title: String(input.title || filename).slice(0, 180), mime, size: buffer.length,
    created_at: new Date().toISOString(), sha256: hash(buffer), provider: storage.provider,
    extraction: input.extraction || 'NETRA generated report', text_characters: text.length,
    text_truncated: fullText.length > MAX_TEXT, passage_count: passages(text).length,
    text, storage, storage_ref: storageRef,
    ...(input.photo_context ? { photo_context: input.photo_context } : {}),
    ...(kind === 'report' ? { report_id: input.report_id || null, template_version: input.template_version || null } : {}),
  };
  await writeJson(bucket, `${prefix}metadata/${id}.json`, file);
  return file;
}

async function listFiles(context, kind, bucketName) {
  const { bucket, prefix } = archive(context, bucketName);
  const keys = []; let token;
  do {
    const page = await bucket.listPagedObjects({ prefix: `${prefix}metadata/`, maxKeys: '200', ...(token ? { continuationToken: token } : {}) });
    keys.push(...(page.contents || []).map(item => item.key || item.keyDetails?.key).filter(key => key?.startsWith(`${prefix}metadata/`) && key.endsWith('.json')));
    const next = page.next_continuation_token;
    if (String(page.truncated) === 'true' && (!next || next === token)) fail('The library returned an incomplete page. Please retry.', 502);
    token = next;
    if (keys.length > 2000) fail('The library exceeds the interactive listing limit.', 413);
  } while (token);
  const result = [];
  for (let offset = 0; offset < keys.length; offset += 20) {
    const batch = await Promise.all(keys.slice(offset, offset + 20).map(key => readJson(bucket, key)));
    result.push(...batch.filter(file => file.owner === String(context.officer.id) && (!kind || file.kind === kind)).map(publicFile));
  }
  return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
function decodeFile(payload) {
  const base64 = String(payload.file || '');
  if (!base64 || base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 4 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)) fail('Upload a PDF, PNG, JPEG or WebP file up to 8 MB.');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) fail('Files must be between 1 byte and 8 MB.', 413);
  let mime, ext;
  if (buffer.subarray(0, 5).toString() === '%PDF-') { mime = 'application/pdf'; ext = 'pdf'; }
  else if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mime = 'image/png'; ext = 'png'; }
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) { mime = 'image/jpeg'; ext = 'jpg'; }
  else if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') { mime = 'image/webp'; ext = 'webp'; }
  else fail('This file is not a supported PDF or image.');
  return { buffer, mime, ext };
}

async function libraryRequest(context, payload, dependencies) {
  authorize(context);
  const { bucketName, ocrText, writeAudit } = dependencies;
  const audit = async (action, file) => writeAudit(context.app, context.officer, { action, entity: 'DocumentLibrary', entity_id: file.id, detail: { filename: file.filename, sha256: file.sha256, provider: file.provider } });
  if (payload.mode === 'files:list') return { rows: await listFiles(context, ['document', 'report'].includes(payload.kind) ? payload.kind : null, bucketName) };
  if (payload.mode === 'document:upload') {
    const input = decodeFile(payload);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'netra-document-'));
    const temporary = path.join(directory, `source.${input.ext}`);
    try {
      fs.writeFileSync(temporary, input.buffer);
      const result = await context.app.zia().extractOpticalCharacters(fs.createReadStream(temporary), { modelType: 'OCR', language: payload.language === 'kn' ? 'kan' : 'eng' });
      const text = String(ocrText(result) || '').trim();
      if (!text) fail('Zia could not extract text. Try an unlocked PDF or a clearer image.', 422);
      const file = await saveLibraryFile(context, { ...input, kind: 'document', filename: payload.name || `document.${input.ext}`, text, extraction: 'Catalyst Zia OCR' }, bucketName);
      const record = await audit('DOCUMENT_UPLOAD', file);
      return { file: publicFile(file), audit_id: record.id, warning: record.ref ? null : 'The file was saved, but its separate audit archive was not confirmed.' };
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  const file = await getFile(context, payload.id, bucketName);
  if (payload.mode === 'files:info') return { file: publicFile(file) };
  if (payload.mode === 'files:get') {
    const value = file.storage.provider === 'filestore'
      ? await context.app.filestore().folder(file.storage.folder_id).downloadFile(file.storage.file_id)
      : await context.app.stratus().bucket(bucketName).getObject(file.storage.key);
    const buffer = await collect(value);
    if (hash(buffer) !== file.sha256) fail('The stored file failed its integrity check.', 409);
    const record = await audit('LIBRARY_DOWNLOAD', file);
    return { file: publicFile(file), data: buffer.toString('base64'), audit_id: record.id };
  }
  fail('Unsupported library operation.');
}

module.exports = { saveLibraryFile, libraryRequest, getFile, publicFile, passages, authorize, decodeFile, MAX_BYTES };
