'use strict';

function normalizedConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  const normalized = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(1, normalized));
}

function faceMatch(result, fallbackThreshold = 0.8) {
  const body = result && typeof result === "object" && result.data && typeof result.data === "object"
    ? result.data
    : result || {};
  const rawMatched = body.matched ?? body.match ?? body.is_matched;
  const confidence = normalizedConfidence(body.confidence ?? body.score ?? body.similarity ?? 0);
  const explicit = rawMatched === true || String(rawMatched).toLowerCase() === "true";
  const absent = rawMatched == null || rawMatched === "";
  return { matched: explicit || (absent && confidence >= fallbackThreshold), confidence };
}

function summarizeCctvFrames(frames) {
  const ordered = [...(Array.isArray(frames) ? frames : [])].sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.timestamp - right.timestamp;
  });
  const best = ordered[0] || null;
  const matching = ordered.filter((frame) => frame.matched);
  const successful = ordered.filter((frame) => !frame.error);
  return {
    matched: matching.length > 0,
    confidence: best ? best.confidence : 0,
    best_frame_index: best ? best.index : null,
    best_timestamp: best ? best.timestamp : null,
    matching_frames: matching.length,
    successful_frames: successful.length,
  };
}

module.exports = { faceMatch, normalizedConfidence, summarizeCctvFrames };
