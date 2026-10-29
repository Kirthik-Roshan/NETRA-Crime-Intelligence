'use strict';

// A valid citation alone does not validate a model's invented quantity.
// Derived statistics belong in deterministic analysis, never a prose guess.
function numbers(text) {
  return (String(text || '').replace(/[೦-೯]/g, digit => String(digit.charCodeAt(0) - 0x0ce6))
    .match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) || [])
    .map(value => value.replace(/,/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
}
function supportedNumbers(answer, sourceText) {
  const prose = String(answer || '').replace(/(^|\n)\s*\d{1,3}[.)]\s+/g, '$1').replace(/\[\d{1,3}\]/g, '');
  const available = new Set(numbers(sourceText));
  return numbers(prose).every(value => available.has(value));
}
module.exports = { supportedNumbers };
