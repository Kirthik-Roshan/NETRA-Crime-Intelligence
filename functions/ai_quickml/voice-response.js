'use strict';

// Read known transcript fields without treating arbitrary error messages as speech.
function transcriptText(value, depth = 0) {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(item => transcriptText(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof value !== 'object') return '';
  if (value.error || ['error', 'failed', 'failure'].includes(String(value.status).toLowerCase())) return '';
  for (const key of ['transcribed_text', 'transcription', 'transcript', 'text']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  for (const key of ['data', 'result', 'output', 'segments', 'results']) {
    const text = transcriptText(value[key], depth + 1);
    if (text) return text;
  }
  return '';
}
module.exports = { transcriptText };
