'use strict';

const crypto = require('crypto');
const { analyzeInvestigation, watchMatches, digest } = require('./investigation-analysis');
const ROLES = ['administrator', 'senior_officer', 'investigation_officer', 'analyst'];
const REVIEWERS = ['administrator', 'senior_officer', 'investigation_officer'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, max = 200) => String(value || '').trim().slice(0, max);
const stamp = () => `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
function identifier(value) {
  if (!/^[a-z0-9-]{8,80}$/.test(String(value || ''))) fail('Invalid investigation or revision identifier.');
  return String(value);
}

async function readJson(bucket, key) {
  const stream = await bucket.getObject(key);
  const parts = [];
  for await (const part of stream) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

async function documents(bucket, prefix) {
  const keys = []; let token;
  do {
    const page = await bucket.listPagedObjects({ prefix, maxKeys: '200', ...(token ? { continuationToken: token } : {}) });
    keys.push(...(page.contents || []).map(item => item.key || item.keyDetails?.key).filter(key => key?.startsWith(prefix) && key.endsWith('.json')));
    token = page.next_continuation_token;
    if (keys.length > 2000) fail('This investigation archive exceeds the interactive read limit. Contact your administrator.', 413);
    if (String(page.truncated) === 'true' && !token) fail('The investigation archive returned an incomplete page.', 502);
  } while (token);
  const result = [];
  for (let offset = 0; offset < keys.length; offset += 20) result.push(...await Promise.all(keys.slice(offset, offset + 20).map(key => readJson(bucket, key))));
  return result;
}

function latestRevisions(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.id) || [];
    group.push(row); groups.set(row.id, group);
  }
  return [...groups.values()].map(group => {
    const previous = new Set(group.map(row => row.previous_revision).filter(Boolean));
    const heads = group.filter(row => !previous.has(row.revision_id));
    if (heads.length !== 1) fail('Concurrent investigation revisions need reconciliation. Reload the revision history before saving again.', 409);
    return heads[0];
  }).sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

function validateInput(payload, officer) {
  if (!Array.isArray(payload.case_ids)) fail('Select between two and six FIRs.');
  const ids = [...new Set(payload.case_ids.map(Number))];
  if (ids.length < 2 || ids.length > 6 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) fail('Select between two and six valid FIRs.');
  const question = text(payload.question, 1000);
  if (question.length < 8) fail('Enter an investigation question of at least eight characters.');
  const exclusions = Array.isArray(payload.exclusions) ? payload.exclusions : [];
  if (exclusions.length > 200 || exclusions.some(item => !item || typeof item.source_id !== 'string' || text(item.reason, 501).length < 5 || text(item.reason, 501).length > 500)) fail('Every excluded source requires a reason of 5 to 500 characters.');
  const observations = (Array.isArray(payload.observations) ? payload.observations : []).map(row => {
    if (!row || !/^obs-[a-z0-9-]{8,70}$/.test(row.id) || !ids.includes(Number(row.case_id))) fail('An observation must have a valid identifier and selected FIR.');
    const registration = text(row.plate, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (registration && !/^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/.test(registration)) fail('Enter a complete registration number.');
    const type = text(row.vehicle_type);
    if (!['', 'car', 'motorcycle', 'truck', 'bus', 'autorickshaw', 'other'].includes(type)) fail('Unsupported vehicle type.');
    if (text(row.reference, 500).length < 3 || text(row.note, 2000).length < 5) fail('An observation requires a source reference and review note.');
    return { id: row.id, case_id: Number(row.case_id), label: text(row.label, 120) || 'Officer observation', plate: registration, vehicle_type: type, reference: text(row.reference, 500), note: text(row.note, 2000), actor: text(officer.id) };
  });
  if (observations.length > 24 || new Set(observations.map(row => row.id)).size !== observations.length) fail('Use up to 24 uniquely identified observations.');
  return { ids, question, exclusions: exclusions.map(row => ({ source_id: row.source_id, reason: text(row.reason, 500) })), observations };
}

async function loadSources(context, dependencies) {
  const views = await dependencies.readKspViews(context.app, ['Firs', 'FirCriminals'], { requiredTables: ['CaseMaster', 'Accused'] });
  if (!(views.Firs || []).length) fail('No FIR records are available in this Catalyst environment.', 503);
  const warnings = [];
  let evidence = [], journals = [];
  try { evidence = (await dependencies.listRows(context, 'Evidence', 5000, true)).rows; }
  catch { warnings.push('Evidence register unavailable. Evidence coverage could not be verified.'); }
  if (evidence.length >= 5000) warnings.push('Evidence coverage reached the 5,000-record read limit. Additional evidence may not be included.');
  try {
    let token;
    do {
      const page = await context.app.datastore().table('NetraCaseJournal').getPagedRows({ nextToken: token, maxRows: 200 });
      journals.push(...(page.data || []));
      if (page.more_records && (!page.next_token || page.next_token === token)) fail('The journal returned an incomplete page.', 502);
      token = page.more_records ? page.next_token : null;
      if (journals.length > 10000) fail('Journal read limit exceeded.', 413);
    } while (token);
  } catch { journals = []; warnings.push('Case journal unavailable. Supplemental updates could not be checked.'); }
  return { firs: views.Firs || [], links: views.FirCriminals || [], evidence, journals, warnings };
}

function buildAnalysis(data, input) {
  const firs = input.ids.map(id => data.firs.find(row => Number(row.id) === id));
  if (firs.some(row => !row)) fail('One or more selected FIRs are no longer available.', 404);
  const result = analyzeInvestigation({ ...data, firs, question: input.question, observations: input.observations, exclusions: input.exclusions });
  const known = new Set(result.sources.map(source => source.id));
  if (known.size !== result.sources.length) fail('Duplicate source identifiers were returned. Resolve the source records before comparing these FIRs.', 409);
  if (result.sources.length > 300) fail('This comparison has more than 300 sources. Select fewer FIRs to review it in one brief.', 413);
  if (input.exclusions.some(row => !known.has(row.source_id))) fail('An excluded source is no longer available. Refresh the comparison before saving.', 409);
  result.source_fingerprint = digest(result.sources.map(source => source.fingerprint).sort());
  return result;
}

function criteriaInput(value) {
  const criteria = { enabled: value?.enabled === true, crime_type: text(value?.crime_type, 100), district: text(value?.district, 100), term: text(value?.term, 100) };
  if (criteria.enabled && !criteria.crime_type && !criteria.district && !criteria.term) fail('Choose at least one watch criterion.');
  return criteria;
}

function selectedFingerprints(analysis) {
  return Object.fromEntries(analysis.cases.map(item => [item.id, digest(analysis.sources.filter(source => source.case_id === item.id).map(source => source.fingerprint).sort())]));
}

function briefPayload(saved) {
  const analysis = saved.analysis;
  const section = (question, answer) => ({ question, answer });
  const sources = analysis.sources.map(source => `${source.id} | ${source.table} #${source.record_id} | FIR ${source.case_id}\n${source.excerpt}\nFields: ${JSON.stringify(source.fields)}\nSHA-256: ${source.fingerprint}${source.excluded ? `\nEXCLUDED: ${source.exclusion_reason}` : ''}`);
  return {
    title: saved.title,
    filename: `netra-investigation-${saved.id}-${saved.revision_id}.pdf`,
    source_register: sources,
    relationship_graph: { cases: analysis.cases, findings: analysis.findings },
    investigation_findings: analysis.findings,
    turns: [
      section('Investigation snapshot', `${saved.question}\nRevision: ${saved.revision_id}\nPrevious: ${saved.previous_revision || 'None'}\nSaved: ${saved.saved_at}\nOfficer: ${saved.actor.name} (${saved.actor.id})\nStatus: ${saved.review_status}\nReview note: ${saved.review_note || 'None'}\nSnapshot SHA-256: ${saved.integrity_hash}`),
      section('Assessment', analysis.summary),
      section('Missing information and next checks', [...analysis.gaps.map(item => `${item.title}: ${item.detail}`), ...analysis.next_checks].join('\n')),
      section('Officer annotations', saved.annotation || 'None.'),
      section('Coverage and provenance', [...analysis.warnings, 'Schema-aligned synthetic KSP records. Findings are reviewable associations, not determinations of guilt.'].join('\n')),
    ],
  };
}

async function investigations(context, payload, dependencies) {
  if (!context.authenticated) fail('A verified Catalyst session is required.', 401);
  if (!ROLES.includes(context.officer.role)) fail('Your role cannot access investigations.', 403);
  const prefix = `investigations/${digest(String(context.officer.id)).slice(0, 32)}/`;
  const bucket = context.app.stratus().bucket(dependencies.STRATUS_BUCKET);
  const archive = () => documents(bucket, `${prefix}revisions/`);
  const write = async (key, value) => {
    const ok = await bucket.putObject(key, JSON.stringify(value), { overwrite: false, contentType: 'application/json', metaData: { actor: String(context.officer.id), kind: 'investigation' } });
    if (ok === false) fail('Stratus did not confirm the investigation write.', 502);
  };
  const audit = async (action, id, detail) => {
    const result = await dependencies.writeAudit(context.app, context.officer, { action, entity: 'Investigation', entity_id: id, detail });
    return { audit_id: result.id, warning: result.ref ? null : 'Saved, but the separate audit archive could not be confirmed.' };
  };
  const mode = payload.mode;
  if (mode === 'investigation:list') {
    const rows = latestRevisions(await archive()).map(({ analysis, baseline, observations, exclusions, ...row }) => ({ ...row, counts: analysis.counts }));
    return { rows };
  }
  if (mode === 'investigation:analyze') {
    const input = validateInput(payload, context.officer);
    const analysis = buildAnalysis(await loadSources(context, dependencies), input);
    return { analysis, ...await audit('INVESTIGATION_ANALYZE', '', { case_ids: input.ids, exclusions: input.exclusions, counts: analysis.counts }) };
  }
  if (mode === 'investigation:save') {
    const input = validateInput(payload, context.officer);
    const reviewStatus = payload.review_status || 'draft';
    if (!['draft', 'reviewed'].includes(reviewStatus)) fail('Invalid review status.');
    if (reviewStatus === 'reviewed' && !REVIEWERS.includes(context.officer.role)) fail('An investigation officer or supervisor must review the brief.', 403);
    const reviewNote = text(payload.review_note, 2000);
    if (reviewStatus === 'reviewed' && reviewNote.length < 5) fail('A review note is required.');
    const title = text(payload.title, 160);
    if (title.length < 3) fail('Enter a title of at least three characters.');
    const criteria = criteriaInput(payload.criteria);
    const rows = await archive();
    const requestId = identifier(payload.request_id);
    const annotation = text(payload.annotation, 6000);
    const requestHash = digest({ input, title, criteria, reviewStatus, reviewNote, annotation, id: payload.id || null, previous_revision: payload.previous_revision || null, source: payload.analysis_fingerprint });
    const duplicate = rows.find(row => row.request_id === requestId);
    if (duplicate) {
      if (duplicate.request_hash !== requestHash) fail('This save request ID was already used for different content.', 409);
      return { saved: duplicate, duplicate: true };
    }
    const id = payload.id ? identifier(payload.id) : `inv-${digest([context.officer.id, requestId]).slice(0, 32)}`;
    const group = rows.filter(row => row.id === id);
    const prior = group.length ? latestRevisions(group)[0] : null;
    if (payload.id && !prior) fail('Saved investigation not found.', 404);
    if (prior && payload.previous_revision !== prior.revision_id) fail('A newer revision exists. Open it before saving your changes.', 409);
    if (criteria.enabled && !prior?.criteria.enabled && latestRevisions(rows).filter(row => row.criteria.enabled).length >= 30) fail('Use up to 30 active saved watches per officer.', 413);
    const data = await loadSources(context, dependencies);
    const analysis = buildAnalysis(data, input);
    if (payload.analysis_fingerprint !== analysis.source_fingerprint) fail('Source records changed after this comparison. Run the analysis again before saving.', 409);
    const saved = {
      id, revision_id: `rev-${digest([id, prior?.revision_id || 'initial']).slice(0, 32)}`, revision_number: (prior?.revision_number || 0) + 1, previous_revision: prior?.revision_id || null,
      request_id: requestId, request_hash: requestHash, title, question: input.question, case_ids: input.ids, observations: input.observations, exclusions: input.exclusions,
      annotation, criteria, review_status: reviewStatus, review_note: reviewNote,
      actor: { id: String(context.officer.id), name: context.officer.full_name || context.officer.username || String(context.officer.id), role: context.officer.role },
      saved_at: new Date().toISOString(), analysis,
      baseline: { matches: criteria.enabled ? watchMatches(data.firs, criteria, input.ids) : [], selected: selectedFingerprints(analysis) },
      changes: prior ? analysis.sources.flatMap(source => {
        const previous = prior.analysis.sources.find(item => item.id === source.id);
        return !previous ? [`Added ${source.label}`] : previous.fingerprint !== source.fingerprint || previous.excluded !== source.excluded || previous.exclusion_reason !== source.exclusion_reason ? [`Changed ${source.label}`] : [];
      }).concat(prior.analysis.sources.filter(source => !analysis.sources.some(item => item.id === source.id)).map(source => `Removed ${source.label}`), ['New review snapshot; see annotations and watch criteria.']) : ['Initial investigation snapshot'],
    };
    saved.integrity_hash = digest(saved);
    // A fixed next-revision key with overwrite disabled makes simultaneous saves compete for one slot.
    const key = `${prefix}revisions/${id}/${saved.revision_id}.json`;
    try { await write(key, saved); }
    catch (error) {
      let existing;
      try { existing = await readJson(bucket, key); } catch { throw error; }
      if (existing.request_hash === requestHash) return { saved: existing, duplicate: true };
      fail('Another tab saved this revision first. Open the latest revision before saving again.', 409);
    }
    return { saved, ...await audit('INVESTIGATION_SAVE', id, { revision: saved.revision_id, previous_revision: saved.previous_revision, review_status: reviewStatus, integrity_hash: saved.integrity_hash }) };
  }
  if (mode === 'investigation:open' || mode === 'investigation:pdf') {
    const id = identifier(payload.id);
    const rows = (await archive()).filter(row => row.id === id);
    if (!rows.length) fail('Saved investigation not found.', 404);
    const saved = payload.revision_id ? rows.find(row => row.revision_id === identifier(payload.revision_id)) : latestRevisions(rows)[0];
    if (!saved) fail('Revision not found.', 404);
    const { integrity_hash, ...body } = saved;
    if (digest(body) !== integrity_hash) fail('The saved investigation failed its integrity check.', 409);
    if (mode === 'investigation:pdf') {
      const pdf = await dependencies.generatePdf(context, briefPayload(saved));
      return { ...pdf, revision_id: saved.revision_id, ...await audit('INVESTIGATION_EXPORT_PDF', id, { revision: saved.revision_id, storage_ref: pdf.storage_ref }) };
    }
    return { saved, revisions: rows.map(row => ({ revision_id: row.revision_id, revision_number: row.revision_number, saved_at: row.saved_at, review_status: row.review_status, changes: row.changes })).sort((a, b) => b.revision_number - a.revision_number) };
  }
  if (mode === 'investigation:check') {
    const saved = latestRevisions(await archive()).filter(row => row.criteria.enabled);
    if (saved.length > 30) fail('Use up to 30 active saved watches per officer.', 413);
    const events = await documents(bucket, `${prefix}watch/`);
    const statuses = await documents(bucket, `${prefix}status/`);
    const warnings = [];
    if (saved.length) {
      const data = await loadSources(context, dependencies);
      warnings.push(...data.warnings);
      for (const row of saved) {
        const current = watchMatches(data.firs, row.criteria, row.case_ids);
        const candidates = current.filter(item => !row.baseline.matches.some(old => old.case_id === item.case_id && old.fingerprint === item.fingerprint)).map(item => ({ ...item, kind: row.baseline.matches.some(old => old.case_id === item.case_id) || events.some(event => event.investigation_id === row.id && event.case_id === item.case_id) ? 'updated_case' : 'new_case' }));
        // Partial optional-source failures must never create spurious disappearance alerts.
        if (!data.warnings.length) {
          const analysis = buildAnalysis(data, validateInput({ ...row, exclusions: [] }, context.officer));
          for (const [caseId, fingerprint] of Object.entries(selectedFingerprints(analysis))) if (row.baseline.selected[caseId] !== fingerprint) candidates.push({ case_id: Number(caseId), fir_number: analysis.cases.find(item => item.id === Number(caseId))?.fir_number || '', title: 'Selected case sources changed', reasons: ['The saved snapshot differs from current FIR, accused, evidence or journal records. Open a new comparison to review the changes.'], fingerprint, kind: 'selected_source_change' });
        }
        for (const item of candidates) {
          const id = `alert-${digest([row.id, item.case_id, item.fingerprint]).slice(0, 32)}`;
          if (events.some(event => event.id === id)) continue;
          const event = { ...item, id, investigation_id: row.id, investigation_title: row.title, detected_at: new Date().toISOString() };
          try { await write(`${prefix}watch/${row.id}/${id}.json`, event); }
          catch (error) {
            // Another tab may have written this same deterministic alert first.
            try { const existing = await readJson(bucket, `${prefix}watch/${row.id}/${id}.json`); if (existing.id !== id) throw error; }
            catch { throw error; }
          }
          events.push(event);
        }
      }
    }
    return { checked_at: new Date().toISOString(), watched: saved.length, warnings, alerts: events.map(event => ({ ...event, status: statuses.filter(item => item.alert_id === event.id).sort((a, b) => b.at.localeCompare(a.at))[0]?.status || 'unread' })).sort((a, b) => b.detected_at.localeCompare(a.detected_at)) };
  }
  if (mode === 'investigation:alert') {
    const id = identifier(payload.alert_id);
    if (!['read', 'dismissed', 'unread'].includes(payload.status)) fail('Invalid alert status.');
    const events = await documents(bucket, `${prefix}watch/`);
    if (!events.some(event => event.id === id)) fail('Alert not found.', 404);
    await write(`${prefix}status/${id}/${stamp()}.json`, { alert_id: id, status: payload.status, at: new Date().toISOString() });
    return { ok: true, ...await audit('INVESTIGATION_ALERT_REVIEW', events.find(event => event.id === id).investigation_id, { alert_id: id, status: payload.status }) };
  }
  fail('Unsupported investigation operation.');
}

module.exports = { investigations, briefPayload, validateInput, buildAnalysis, loadSources, latestRevisions };
