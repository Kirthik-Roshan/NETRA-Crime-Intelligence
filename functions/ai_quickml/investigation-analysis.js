'use strict';

const crypto = require('crypto');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value || '').trim();
const plate = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const unique = values => [...new Set(values)];

function platesIn(value) {
  return unique((clean(value).toUpperCase().match(/\b[A-Z]{2}[ -]?\d{2}[ -]?[A-Z]{1,3}[ -]?\d{4}\b/g) || []).map(plate));
}

// Every derived finding retains the exact source IDs needed to reproduce it.
function analyzeInvestigation({ firs, links = [], evidence = [], journals = [], observations = [], exclusions = [], warnings = [], question, generatedAt = new Date().toISOString() }) {
  const sources = [];
  const cases = firs.map(row => ({ id: Number(row.id), fir_number: clean(row.fir_number), title: `${clean(row.crime_type)} - ${clean(row.district)}`, district: clean(row.district), crime_type: clean(row.crime_type), status: clean(row.status) }));
  for (const row of firs) sources.push({
    id: `case-${row.id}`, table: 'CaseMaster', record_id: String(row.id), case_id: Number(row.id),
    label: `FIR ${row.fir_number || row.id}`, origin: 'record', excerpt: clean(row.description), record_fingerprint: digest(row),
    fields: { crime_type: clean(row.crime_type), district: clean(row.district), status: clean(row.status), officer: clean(row.officer), station_id: Number(row.station_id) || null, station_name: clean(row.station_name), modus: clean(row.modus), occurred_at: clean(row.occurred_at), occurred_to: clean(row.occurred_to), reported_at: clean(row.reported_at), plates: platesIn(row.description) },
  });
  for (const row of links.filter(row => cases.some(item => item.id === Number(row.fir_id)))) sources.push({
    id: `accused-${row.accused_master_id || row.criminal_id}-${row.fir_id}`, table: 'Accused', record_id: String(row.accused_master_id || row.criminal_id), case_id: Number(row.fir_id),
    label: `Accused record ${row.accused_master_id || row.criminal_id}`, origin: 'record', excerpt: `Recorded association with FIR ${row.fir_id}; role: ${row.role || 'accused'}.`, record_fingerprint: digest(row),
    fields: { profile_id: Number(row.criminal_id) },
  });
  for (const row of evidence.filter(row => cases.some(item => item.id === Number(row.fir_id)))) sources.push({
    id: `evidence-${row.ROWID || row.id}`, table: 'Evidence', record_id: String(row.ROWID || row.id), case_id: Number(row.fir_id),
    label: `${row.type || 'Evidence'} ${row.id || row.ROWID}`, origin: 'analysis', excerpt: clean(row.description).slice(0, 6000), record_fingerprint: digest(row),
    fields: { plates: platesIn(row.description), storage_ref: clean(row.storage_ref), collected_at: clean(row.collected_at || row.CREATEDTIME) },
  });
  const superseded = new Set(journals.map(row => String(row.PreviousRevisionID || '')));
  for (const row of journals.filter(row => !superseded.has(String(row.ROWID)) && cases.some(item => item.id === Number(row.CaseMasterID)))) sources.push({
    id: `journal-${row.ROWID}`, table: 'NetraCaseJournal', record_id: String(row.ROWID), case_id: Number(row.CaseMasterID),
    label: `Journal revision ${row.ROWID}`, origin: 'officer', excerpt: clean(row.Content).slice(0, 12000), record_fingerprint: digest(row),
    fields: { kind: row.Kind, actor: row.ActorID, integrity_hash: row.IntegrityHash, created_at: row.CREATEDTIME },
  });
  for (const row of observations) sources.push({
    id: row.id, table: 'OfficerObservation', record_id: row.id, case_id: Number(row.case_id),
    label: row.label, origin: 'officer', excerpt: row.note,
    fields: { plates: row.plate ? [plate(row.plate)] : [], vehicle_type: row.vehicle_type || '', reference: row.reference, actor: row.actor },
  });
  const excluded = new Map(exclusions.map(item => [item.source_id, item.reason]));
  const findings = [];
  const add = (kind, code, title, detail, ids, strength = 'context') => {
    const sourceIds = unique(ids);
    const caseIds = values => unique(values.map(id => sources.find(source => source.id === id)?.case_id).filter(Boolean));
    const push = (values, active) => findings.push({ id: `${code}-${digest(values).slice(0, 12)}`, kind, title, detail, strength, source_ids: values, case_ids: caseIds(values), active });
    const included = sourceIds.filter(id => !excluded.has(id));
    push(sourceIds, included.length === sourceIds.length);
    if (included.length < sourceIds.length && caseIds(included).length > 1 && (code !== 'vehicle' || unique(included.map(id => sources.find(source => source.id === id).fields.vehicle_type)).length > 1)) push(included, true);
  };
  const groups = (items, getValues) => {
    const result = new Map();
    for (const item of items) for (const value of unique(getValues(item).filter(Boolean))) result.set(value, [...(result.get(value) || []), item]);
    return [...result].filter(([, group]) => unique(group.map(item => item.case_id)).length > 1);
  };
  const caseSources = sources.filter(source => source.table === 'CaseMaster');
  for (const [field, label] of [['crime_type', 'offence category'], ['district', 'district'], ['modus', 'recorded method']]) {
    for (const [value, group] of groups(caseSources, source => [source.fields[field]])) {
      if (/not recorded|unclassified|unknown/i.test(value)) continue;
      add('support', field, `Shared ${label}: ${value}`, `The selected FIRs record the same ${label}. This is contextual similarity and does not establish a common offender.`, group.map(source => source.id));
    }
  }
  for (const [value, group] of groups(sources.filter(source => source.table === 'Accused'), source => [source.fields.profile_id])) {
    add('support', 'association', `Shared accused profile ${value}`, 'Accused records resolve to the same NETRA profile across these FIRs. Verify the underlying identifiers; a shared profile is not proof that the incidents form one series.', group.map(source => source.id), 'recorded_link');
  }
  for (const [value, group] of groups(sources, source => source.fields.plates || [])) {
    add('support', 'plate', `Shared registration observation: ${value}`, 'The registration appears in sources attached to different FIRs. OCR readings and officer observations require source-image verification.', group.map(source => source.id), 'identifier_observation');
  }
  const vehicleSources = sources.filter(source => source.fields.vehicle_type && source.fields.plates?.length);
  for (const [value, group] of groups(vehicleSources, source => source.fields.plates)) {
    if (unique(group.map(source => source.fields.vehicle_type)).length > 1) add('conflict', 'vehicle', `Different vehicle types for ${value}`, `Sources describe ${unique(group.map(source => source.fields.vehicle_type)).join(' and ')} with the same registration. Check for OCR error, duplicate registration use, or a synthetic fixture mismatch.`, group.map(source => source.id), 'review_required');
  }
  for (const source of caseSources) {
    const from = Date.parse(source.fields.occurred_at);
    const to = Date.parse(source.fields.occurred_to);
    if (Number.isFinite(from) && Number.isFinite(to) && to < from) add('conflict', 'dates', `Invalid incident window in ${source.label}`, 'The recorded incident end precedes its start. Verify the dates before using this window for comparison.', [source.id], 'review_required');
  }
  const activeSources = sources.filter(source => !excluded.has(source.id));
  const activeFindings = findings.filter(finding => finding.active);
  const gaps = [];
  for (const item of cases) {
    const present = activeSources.filter(source => source.case_id === item.id);
    if (!present.some(source => source.table === 'Evidence')) gaps.push({ case_id: item.id, title: `No included evidence file for FIR ${item.fir_number || item.id}`, detail: 'Review available media and attach approved evidence. Absence from NETRA is not proof that no evidence exists.' });
    const source = present.find(source => source.table === 'CaseMaster');
    if (source && !source.fields.occurred_at) gaps.push({ case_id: item.id, title: `Incident time missing for FIR ${item.fir_number || item.id}`, detail: 'A recorded time window is needed for temporal comparison.' });
  }
  if (!activeFindings.some(finding => finding.kind === 'support' && finding.strength !== 'context')) gaps.unshift({ case_id: null, title: 'No included cross-case identifier or accused association', detail: 'The included records do not establish a direct connection. Similar offence categories or methods alone are insufficient.' });
  const support = activeFindings.filter(finding => finding.kind === 'support').length;
  const conflicts = activeFindings.filter(finding => finding.kind === 'conflict').length;
  return {
    version: 'investigation-v1', question, generated_at: generatedAt, cases,
    sources: sources.map(source => ({ ...source, fingerprint: digest(source), excluded: excluded.has(source.id), exclusion_reason: excluded.get(source.id) || '' })),
    findings, gaps, warnings,
    summary: conflicts ? `${support} supporting signals and ${conflicts} conflicting detail${conflicts === 1 ? '' : 's'} require review. The proposed connection remains unresolved.` : support ? `${support} supporting signals are recorded. Review their sources and missing information before accepting the proposed connection.` : 'No supporting connection remains in the included sources. Additional evidence is needed.',
    counts: { support, conflicts, gaps: gaps.length, included: activeSources.length, excluded: sources.length - activeSources.length },
    next_checks: unique([
      ...(conflicts ? ['Resolve conflicting source details before relying on the proposed connection.'] : []),
      ...(activeFindings.some(finding => finding.strength === 'identifier_observation') ? ['Verify registration readings against the original media and approved vehicle records.'] : []),
      ...(activeFindings.some(finding => finding.strength === 'recorded_link') ? ['Check the underlying Accused identifiers for each shared profile.'] : []),
      ...gaps.slice(0, 3).map(gap => gap.title),
    ]),
  };
}

function watchMatches(firs, criteria, selectedIds) {
  const selected = new Set(selectedIds);
  return firs.filter(row => !selected.has(Number(row.id))).flatMap(row => {
    const reasons = [];
    for (const field of ['crime_type', 'district']) {
      if (criteria[field] && clean(row[field]).toLowerCase() !== clean(criteria[field]).toLowerCase()) return [];
      if (criteria[field]) reasons.push(`${field === 'crime_type' ? 'Offence' : 'District'}: ${row[field]}`);
    }
    if (criteria.term) {
      if (!`${row.description || ''} ${row.modus || ''} ${row.fir_number || ''}`.toLowerCase().includes(criteria.term.toLowerCase())) return [];
      reasons.push(`Recorded text contains "${criteria.term}"`);
    }
    return [{ case_id: Number(row.id), fir_number: clean(row.fir_number), title: `${row.crime_type} - ${row.district}`, reasons, fingerprint: digest(row) }];
  });
}

module.exports = { analyzeInvestigation, watchMatches, digest, platesIn };
