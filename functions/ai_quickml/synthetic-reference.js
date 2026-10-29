'use strict';

const crypto = require('crypto');
const manifest = require('./profile-assets.json');

// Registry lookup of fictional test files, never face recognition or a
// filename/client-ID lookup. Both original PNGs and served WebPs are registered.
function syntheticReference(image) {
  const sha256 = crypto.createHash('sha256').update(image.buffer).digest('hex');
  const asset = manifest.profiles.find(item => item.synthetic === true &&
    (item.sha256 === sha256 || item.source_sha256 === sha256));
  return {
    profile_id: asset?.profile_id || null,
    name: asset?.name || null,
    synthetic: !!asset,
    sha256,
    link_method: asset ? 'exact_synthetic_asset_sha256' : 'unidentified',
    notice: asset
      ? 'Registered fictional reference linked automatically by its file fingerprint. Zia comparison must match before case details are returned.'
      : 'Reference not registered. Comparison can continue, but no person or case record will be inferred. Use the original registered PNG or WebP for automatic synthetic record linkage; screenshots and edited copies have different fingerprints.',
  };
}

async function matchedReferenceIntelligence(app, reference, match, loadIntelligence) {
  if (!match.matched || !reference.synthetic || !reference.profile_id) return null;
  const intelligence = await loadIntelligence(app, reference.profile_id);
  if (String(intelligence?.criminal?.name || '').trim().toLowerCase() !== reference.name.trim().toLowerCase() ||
      Number(intelligence?.criminal?.id) !== reference.profile_id) {
    const error = new Error('The registered synthetic reference no longer matches its current database profile. No other person’s record has been substituted.');
    error.statusCode = 409;
    throw error;
  }
  return intelligence;
}

module.exports = { syntheticReference, matchedReferenceIntelligence };
