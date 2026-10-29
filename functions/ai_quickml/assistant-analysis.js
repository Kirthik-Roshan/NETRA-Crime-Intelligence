'use strict';

const { loadSources, buildAnalysis } = require('./investigations');
const { digest } = require('./investigation-analysis');
const { isAnalysisQuery, ANALYSIS_FOLLOWUP: followup, VISUAL_TERMS, analysisAnchor } = require('./conversation');
const DAY = 86400000;
const clean = value => String(value || '').trim();
const normal = value => clean(value).normalize('NFKC').toLowerCase();
const unique = values => [...new Set(values)];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const ROLES = ['administrator', 'senior_officer', 'investigation_officer', 'analyst'];
const aliases = {
  'Bengaluru Urban': ['bengaluru', 'bangalore', 'ಬೆಂಗಳೂರು'],
  Mysuru: ['mysore', 'ಮೈಸೂರು'], Belagavi: ['belgaum', 'ಬೆಳಗಾವಿ'],
  Kalaburagi: ['gulbarga', 'ಕಲಬುರಗಿ'], 'Hubballi-Dharwad': ['hubli', 'hubballi', 'dharwad', 'ಹುಬ್ಬಳ್ಳಿ', 'ಧಾರವಾಡ'],
  Mangaluru: ['mangalore', 'ಮಂಗಳೂರು'], Tumakuru: ['tumkur', 'ತುಮಕೂರು'],
  'Vehicle Theft': ['vehicle theft', 'vehicle thefts', 'ವಾಹನ ಕಳ್ಳತನ'],
  Burglary: ['burglaries', 'ಮನೆ ಕಳ್ಳತನ'], Murder: ['murders', 'ಕೊಲೆ'],
  Cybercrime: ['cyber crime', 'cybercrime', 'ಸೈಬರ್'], Assault: ['assaults', 'ಹಲ್ಲೆ'],
};
function mentions(query, value) {
  return [value, `${value}s`, clean(value).replace(/y$/, 'ies'), ...(aliases[value] || [])].some(term => {
    if (/[\u0c80-\u0cff]/.test(term)) return normal(query).includes(normal(term).replace(/ು$/, ''));
    const escaped = normal(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normal(query));
  });
}
function clarification(answer) { return { answer, response: answer, sources: [], response_kind: 'clarification', confidence: null, model: 'NETRA Analysis Clarification' }; }

function planQuery(query, previous, firs, profiles, now, language) {
  const text = normal(query);
  const inherit = previous && (followup.test(query) || VISUAL_TERMS.test(query));
  const plan = { districts: [], offences: [], statuses: [], severity: null, profile_id: null, days: null, year: null, end_date: null, view: 'bar', group: 'district', case_ids: [], exclusions: [] };
  if (inherit) for (const key of Object.keys(plan)) if (previous[key] !== undefined) plan[key] = previous[key];
  // Context is a selection request, never an authorization or trusted record snapshot.
  for (const key of ['districts', 'offences', 'statuses', 'case_ids', 'exclusions']) if (!Array.isArray(plan[key])) fail('Invalid analysis context.');
  if (plan.case_ids.length > 6 || plan.exclusions.length > 200) fail('Use at most six comparison FIRs and 200 source exclusions.');
  const districts = unique(firs.map(row => row.district).filter(Boolean));
  const offences = unique(firs.map(row => row.crime_type).filter(Boolean));
  const matchedDistricts = districts.filter(value => mentions(query, value));
  const matchedOffences = offences.filter(value => mentions(query, value));
  if (matchedDistricts.length) plan.districts = matchedDistricts;
  if (matchedOffences.length) plan.offences = matchedOffences;
  const statuses = unique(firs.map(row => row.status).filter(Boolean));
  const matchedStatuses = statuses.filter(status => text.includes(status.replace(/_/g, ' ')));
  if (matchedStatuses.length) plan.statuses = matchedStatuses;
  if (/\b(open|active) cases\b/.test(text)) plan.statuses = statuses.filter(status => !['closed', 'chargesheeted'].includes(status));
  if (/all statuses/.test(text)) plan.statuses = [];
  const severity = text.match(/\b(critical|high|medium|low)(?: priority| severity| risk)?\s+(?:cases|firs|crimes)\b/)?.[1];
  if (severity) plan.severity = severity;
  if (plan.statuses.some(status => !statuses.includes(status)) || (plan.severity != null && !['critical', 'high', 'medium', 'low'].includes(plan.severity))) fail('Invalid case status or severity.');
  if (/all districts|statewide|across karnataka|ಎಲ್ಲಾ ಜಿಲ್ಲೆ/.test(text)) plan.districts = [];
  if (/all (?:crime|offence|offense)|ಎಲ್ಲಾ ಅಪರಾಧ/.test(text)) plan.offences = [];
  if (plan.districts.some(value => !districts.includes(value)) || plan.offences.some(value => !offences.includes(value))) return { question: 'A selected district or offence is not present in the current records. Choose an available value.' };
  const names = profiles.filter(row => mentions(query, row.name));
  if (names.length > 1) return { question: 'More than one profile matches this request. Select a specific profile before analyzing its links.' };
  if (names.length) plan.profile_id = Number(names[0].id);
  if (plan.profile_id != null && !profiles.some(row => Number(row.id) === Number(plan.profile_id))) return { question: 'The selected profile is unavailable. Specify a recorded person or FIR.' };
  // Do not turn unsupported filters or unknown locations into an all-record answer.
  const location = text.match(/\b(?:in|for)\s+([a-z][a-z -]+?)(?=\s+(?:over|during|by|last|this|from|for|with|in)\b|[?.!,]|$)/)?.[1];
  if (location && !matchedDistricts.length && !/^(?:karnataka|all districts|these|those|this scope|that scope|same scope|the|each|every|selected|cases|firs|vehicle theft|burglary|cybercrime)/.test(location) && !names.length) return { question: `I could not resolve "${location}" to a recorded district. Specify a district present in the database.` };
  if (/\b(?:gender|age|religion|caste|occupation|income|education|migration|transactions?|bank accounts?|money trail|arrests?|victims?|complainants?)\b|ಲಿಂಗ|ವಯಸ್ಸು|ಸಂತ್ರಸ್ತ/.test(text)) return { question: 'This visual analysis counts FIRs by district, offence or incident month. For demographic, custody or financial questions, ask for the relevant source records; this result must not substitute FIR counts for those measures.' };
  const days = text.match(/(?:last|past|previous)\s+(\d{1,3})\s*(days?|weeks?|months?)\b/);
  const knDays = text.match(/(?:ಕಳೆದ|ಹಿಂದಿನ)\s*(\d{1,3})\s*(ದಿನ|ವಾರ|ತಿಂಗಳ)/);
  if (days || knDays) {
    const match = days || knDays;
    plan.days = Number(match[1]) * (/week|ವಾರ/.test(match[2]) ? 7 : /month|ತಿಂಗಳ/.test(match[2]) ? 30 : 1);
    plan.year = null;
    if (plan.days < 1 || plan.days > 366) return { question: 'Use a trailing window between 1 and 366 days. Month windows use 30 days.' };
  }
  if (/this month|ಈ ತಿಂಗಳ/.test(text)) { plan.days = Number(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', day: 'numeric' })); plan.year = null; }
  const year = text.match(/\b(?:in|during|for|year)\s+(20\d{2})\b/);
  if (year) { plan.year = Number(year[1]); plan.days = null; }
  const ending = text.match(/ending\s+(\d{4}-\d{2}-\d{2})/);
  if (ending) plan.end_date = ending[1];
  if (/all time|all dates|ಎಲ್ಲಾ ದಿನಾಂಕ/.test(text)) { plan.days = null; plan.year = null; plan.end_date = null; }
  if (!days && !knDays && !year && !ending && /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|yesterday|today|last month|last year|this year|between|since|before|after)\b|\d{4}-\d{2}-\d{2}/.test(text)) return { question: 'Specify a trailing window such as "last 30 days", an ending date such as "ending 2026-06-30", or a full year such as "in 2026".' };
  if (/by (?:month|time)|monthly|trend|ಪ್ರವೃತ್ತಿ/.test(text)) { plan.group = 'month'; plan.view = 'line'; }
  if (/by (?:crime|offence|offense|categor)|crime mix|ಅಪರಾಧದ ಪ್ರಕಾರ/.test(text)) { plan.group = 'crime_type'; plan.view = 'bar'; }
  if (/by (?:type|category)|offen[cs]e[- ]wise|crime[- ]wise/.test(text)) { plan.group = 'crime_type'; plan.view = 'bar'; }
  if (/by district|ಜಿಲ್ಲೆವಾರು/.test(text)) { plan.group = 'district'; plan.view = 'bar'; }
  if (/\bmap\b|hotspot|ನಕ್ಷೆ/.test(text)) plan.view = 'map';
  if (/network|connections|relationship graph|ಸಂಬಂಧಗಳ/.test(text)) plan.view = 'graph';
  else if (VISUAL_TERMS.test(text)) plan.view = /pie|donut|doughnut/i.test(text) ? 'pie' : /line (?:chart|graph)|trend|by month|monthly/i.test(text) ? 'line' : 'bar';
  if (/compare|comparison|ಹೋಲಿಸ/.test(text)) plan.view = /period|window|ತಿಂಗಳ|ಅವಧಿ/.test(text) ? 'periods' : 'comparison';
  if (/warnings?|forecast|what changed|ಮುನ್ನೆಚ್ಚರಿಕೆ/.test(text)) plan.view = 'warnings';
  if (['warnings', 'periods'].includes(plan.view) && plan.year) return { question: 'For equal-length period comparisons, specify a window such as "last 30 days ending 2026-06-30". For a calendar-year view, ask "Show crime trends in 2026". The selected year has not been replaced with a different window.' };
  if (['warnings', 'periods'].includes(plan.view) && !plan.days) { plan.days = 30; plan.year = null; }
  if (['warnings', 'periods'].includes(plan.view)) { plan.case_ids = []; plan.exclusions = []; }
  if (/exclude source|restore source|supporting evidence|conflicting evidence/.test(text)) plan.view = 'comparison';
  const numbers = unique(query.match(/\b\d{5,}\b/g) || []);
  if (numbers.length) {
    const selected = firs.filter(row => numbers.includes(String(row.fir_number)) || numbers.includes(String(row.case_number)));
    if (numbers.some(number => !selected.some(row => String(row.fir_number) === number || String(row.case_number) === number))) return { question: 'One or more FIR/case numbers were not found. Please use the complete recorded identifiers.' };
    if (selected.length !== numbers.length) return { question: 'A case number resolves to more than one FIR. Use the full FIR numbers to identify the intended cases.' };
    plan.case_ids = selected.map(row => Number(row.id));
  }
  if (matchedDistricts.length || matchedOffences.length || names.length || days || knDays || year) { if (!numbers.length) plan.case_ids = []; plan.exclusions = []; }
  if (!['bar', 'line', 'pie', 'map', 'graph', 'comparison', 'warnings', 'periods'].includes(plan.view) || !['district', 'crime_type', 'month'].includes(plan.group)) fail('Unsupported analysis view.');
  if (plan.days != null && (!Number.isInteger(plan.days) || plan.days < 1 || plan.days > 366)) fail('Invalid time window.');
  if (plan.year != null && (!Number.isInteger(plan.year) || plan.year < 1900 || plan.year > 2200)) fail('Invalid year.');
  if (plan.end_date != null && (!Number.isFinite(incidentDay(plan.end_date)) || incidentDay(plan.end_date) > now.getTime())) fail('Use a valid window ending date no later than today.');
  plan.case_ids = unique(plan.case_ids.map(Number));
  if (plan.case_ids.some(id => !Number.isSafeInteger(id) || id < 1)) fail('Invalid FIR selection.');
  if (plan.exclusions.some(item => !item || typeof item.source_id !== 'string' || clean(item.reason).length < 5 || clean(item.reason).length > 500)) fail('Each excluded source needs a reason of 5 to 500 characters.');
  let residual = text;
  for (const value of [...matchedDistricts, ...matchedOffences, ...names.map(row => row.name), ...matchedStatuses.map(value => value.replace(/_/g, ' '))]) {
    for (const phrase of [value, `${value}s`, clean(value).replace(/y$/, 'ies'), ...(aliases[value] || [])].sort((a, b) => b.length - a.length)) residual = residual.split(normal(phrase)).join(' ');
  }
  const vocabulary = new Set('a an the please can could you me i show give display plot draw make create how many count counts number total fir firs case cases crime crimes recorded records file files database data all across karnataka statewide district districts offence offences offense offenses type types category categories incident incidents date dates time month months monthly day days week weeks year years in on at of for from and or with to by over during last past previous current this these those that them it same instead now only also selected two period periods window windows compare comparison compared versus vs trend trends pattern patterns hotspot hotspots distribution breakdown statistics statistics chart charts graph graphs map maps network connections connection documented explain their our supporting conflicting evidence source sources exclude restore recalculate review analyze analyse warning warnings early forecast what changed ending risk priority severity critical high medium low open active statuses linked links relationship relationships are were is was have been registered filed happen happened occurred n s finding findings'.split(' '));
  vocabulary.add('scope');
  for (const word of 'visual representation representations graphical graphically visually visualize visualise visualization visualisation report reports statistical stats statistics bar bars pie donut doughnut line histogram table tables as into using about want need would like help represent present presentation format result results summary summarise summarize detail details get provide its do up us to see based collected hi hello hey wise'.split(' ')) vocabulary.add(word);
  const unknown = unique((residual.match(/[a-z]+/g) || []).filter(word => !vocabulary.has(word)));
  if (unknown.length) return { question: `I could not resolve these analysis terms: ${unknown.slice(0, 5).join(', ')}. Specify an available district, offence, FIR number, or a supported date window; no filters have been guessed.` };
  return { plan };
}

function incidentDay(value) {
  const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return NaN;
  const time = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === match[1] ? time : NaN;
}
function dayText(time) { return new Date(time).toISOString().slice(0, 10); }
function groupRows(rows, group) {
  const counts = new Map();
  for (const row of rows) {
    const key = group === 'month' ? (Number.isFinite(incidentDay(row.occurred_at)) ? clean(row.occurred_at).slice(0, 7) : 'Date not recorded') : clean(row[group]) || 'Not recorded';
    const item = counts.get(key) || { label: key, count: 0, case_ids: [] };
    item.count++; item.case_ids.push(Number(row.id)); counts.set(key, item);
  }
  return [...counts.values()].sort((a, b) => group === 'month' ? a.label.localeCompare(b.label) : b.count - a.count || a.label.localeCompare(b.label));
}

async function assistantAnalysis(context, payload, dependencies, event = () => {}, now = new Date()) {
  const query = clean(payload.query || payload.prompt);
  if (!isAnalysisQuery(query, payload.analysis_context, payload.history)) return null;
  if (VISUAL_TERMS.test(query) && !payload.analysis_context && !analysisAnchor(payload.history) && !/\b(?:firs?|cases?|crimes?|offences?|offenses?|districts?|statewide|karnataka|burglary|theft|murder|cybercrime)\b|ಅಪರಾಧ|ಪ್ರಕರಣ|ಜಿಲ್ಲೆ/.test(normal(query))) {
    return clarification('Which report or statistics should I visualize? Ask for crime counts by district, offence or month, attach a report with a numeric table, or provide labelled values. I will plot the actual figures rather than invent data.');
  }
  if (!context.authenticated) fail('A verified Catalyst session is required for record analysis.', 401);
  if (!ROLES.includes(context.officer.role)) fail('Your role cannot analyze crime records.', 403);
  const started = Date.now();
  event('Analysis retrieval', 'running', 'Reading FIRs and recorded accused links from the KSP tables');
  const views = await dependencies.readKspViews(context.app, ['Firs', 'Criminals', 'FirCriminals'], { requiredTables: ['CaseMaster', 'Accused'], requireComplete: true });
  const firs = views.Firs || [], profiles = views.Criminals || [], links = views.FirCriminals || [];
  if (!firs.length) fail('No FIR records are available in this Catalyst environment.', 503);
  if (firs.length > 20000) fail('This selection exceeds the interactive analysis limit.', 413);
  let previous = payload.analysis_context;
  if (!previous && VISUAL_TERMS.test(query)) {
    const anchor = analysisAnchor(payload.history);
    if (anchor) {
      const anchored = planQuery(anchor, null, firs, profiles, now, payload.language);
      if (anchored.question) return clarification('I need a clearer report scope before drawing a chart. Specify the district, offence or complete FIR number, or request statewide crime statistics. No unrelated case has been selected.');
      previous = anchored.plan;
    }
  }
  const parsed = planQuery(query, previous, firs, profiles, now, payload.language);
  const finish = async result => {
    const audit = await dependencies.writeAudit(context.app, context.officer, { action: 'AI_QUERY', entity: 'conversation-analysis', model: result.model, processing_ms: Date.now() - started, detail: { query: query.slice(0, 2000), scope: result.analysis?.context, fingerprint: result.analysis?.fingerprint, record_count: result.analysis?.total || 0 } });
    event('Audit archive', audit.ref ? 'complete' : 'warning', audit.ref ? audit.id : 'Audit archive unavailable');
    return { ...result, audit_id: audit.id, processing_ms: Date.now() - started };
  };
  if (parsed.question) return finish(clarification(parsed.question));
  const plan = parsed.plan;
  const today = incidentDay(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }));
  const end = (plan.end_date ? incidentDay(plan.end_date) : today) + DAY, start = plan.days ? end - plan.days * DAY : plan.year ? Date.UTC(plan.year, 0, 1) : null;
  const windowEnd = plan.year ? Date.UTC(plan.year + 1, 0, 1) : end;
  const profileCases = new Set(links.filter(row => Number(row.criminal_id) === Number(plan.profile_id)).map(row => Number(row.fir_id)));
  const base = firs.filter(row => (!plan.districts.length || plan.districts.includes(row.district)) && (!plan.offences.length || plan.offences.includes(row.crime_type)) && (!plan.statuses.length || plan.statuses.includes(row.status)) && (!plan.severity || row.severity === plan.severity) && (plan.profile_id == null || profileCases.has(Number(row.id))));
  const filtered = base.filter(row => start == null || (incidentDay(row.occurred_at) >= start && incidentDay(row.occurred_at) < windowEnd));
  const selected = plan.case_ids.length ? filtered.filter(row => plan.case_ids.includes(Number(row.id))) : filtered;
  if (plan.case_ids.length && selected.length !== plan.case_ids.length) return finish(clarification('Some selected FIRs are unavailable or outside the current filters. Clear the selection or revise the filters.'));
  const warnings = ['Counts describe recorded FIRs, not population-adjusted crime rates or proof of guilt.'];
  const latestIncident = base.reduce((latest, row) => Math.max(latest, Number.isFinite(incidentDay(row.occurred_at)) ? incidentDay(row.occurred_at) : 0), 0);
  if (latestIncident && end - latestIncident > 7 * DAY) warnings.push(`Latest incident date in this scope: ${dayText(latestIncident)}. Recent empty windows do not establish an absence of crime; check source freshness.`);
  const undated = base.filter(row => !Number.isFinite(incidentDay(row.occurred_at))).length;
  if (undated) warnings.push(`${undated} FIRs have missing or invalid incident dates${start == null ? '; grouped separately in monthly results' : ' and are excluded from date-window counts'}.`);
  const scope = [plan.districts.join(', ') || 'All recorded districts', plan.offences.join(', ') || 'All recorded offences', plan.statuses.length ? plan.statuses.join(', ') : '', plan.severity ? `${plan.severity} severity` : '', plan.profile_id ? `Profile ${profiles.find(row => Number(row.id) === Number(plan.profile_id))?.name}` : '', start == null ? 'All recorded dates' : `${dayText(start)} to ${dayText(windowEnd - DAY)} (incident dates, Asia/Kolkata)`].filter(Boolean).join(' | ');
  let comparison = null;
  if (['comparison', 'graph'].includes(plan.view)) {
    if (selected.length < 2 || selected.length > 6) return finish(clarification(`The current scope contains ${selected.length} FIRs. Select between two and six FIRs from an analysis result, or specify their full FIR numbers, to inspect documented connections.`));
    plan.case_ids = selected.map(row => Number(row.id));
    event('Evidence comparison', 'running', `Joining evidence and recorded associations for ${selected.length} FIRs`);
    const data = await loadSources(context, { ...dependencies, readKspViews: async () => ({ Firs: firs, FirCriminals: links }) });
    comparison = buildAnalysis(data, { ids: plan.case_ids, question: query, observations: [], exclusions: plan.exclusions });
    warnings.push(...comparison.warnings);
    event('Evidence comparison', 'complete', `${comparison.counts.support} supporting signals; ${comparison.counts.conflicts} conflicts; ${comparison.counts.excluded} sources excluded`);
  }
  let periods = null;
  if (['periods', 'warnings'].includes(plan.view)) {
    const priorStart = start - plan.days * DAY;
    const preceding = base.filter(row => incidentDay(row.occurred_at) >= priorStart && incidentDay(row.occurred_at) < start);
    const currentGroups = groupRows(filtered, 'district'), previousGroups = groupRows(preceding, 'district');
    const changes = unique([...currentGroups, ...previousGroups].map(row => row.label)).map(label => {
      const current = currentGroups.find(row => row.label === label)?.count || 0, previous = previousGroups.find(row => row.label === label)?.count || 0;
      return { label, current, previous, delta: current - previous, percent: previous ? Math.round((current - previous) / previous * 1000) / 10 : null, flagged: current >= 5 && current - previous >= 3 && (previous === 0 || current >= previous * 1.5) };
    }).sort((a, b) => b.delta - a.delta);
    periods = { current: filtered.length, previous: preceding.length, current_start: dayText(start), current_end: dayText(end - DAY), previous_start: dayText(priorStart), previous_end: dayText(start - DAY), changes, previous_sources: preceding.map(row => ({ id: Number(row.id), fir_number: clean(row.fir_number) })) };
    warnings.push('Descriptive early-warning rule: at least 5 current FIRs, an increase of at least 3, and at least 50% above the preceding equal-length window (or a zero baseline). This is not a trained forecast or a causal explanation.');
    warnings.push('The current day may be incomplete. Late reporting and incomplete imports can change both periods.');
  }
  const rows = groupRows(selected, plan.group);
  const records = selected.map(row => ({ id: Number(row.id), fir_number: clean(row.fir_number), crime_type: clean(row.crime_type), district: clean(row.district), occurred_at: clean(row.occurred_at), severity: clean(row.severity), lat: row.latitude ?? row.lat, lng: row.longitude ?? row.lng }));
  const points = records.filter(row => row.lat != null && row.lng != null && clean(row.lat) && clean(row.lng) && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) && Number(row.lat) >= 11.5 && Number(row.lat) <= 18.6 && Number(row.lng) >= 73.8 && Number(row.lng) <= 78.8).map(row => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) }));
  if (plan.view === 'map' && points.length !== selected.length) warnings.push(`${selected.length - points.length} FIRs lack usable Karnataka coordinates and are not plotted.`);
  const generated = now.toISOString();
  const sourceRows = selected.map(row => ({ id: Number(row.id), fir_number: clean(row.fir_number) }));
  const analysis = { version: 'track1-v1', context: plan, scope, total: selected.length, latest_incident: latestIncident ? dayText(latestIncident) : null, generated_at: generated, fingerprint: digest({ selected, periods, comparison }), rows, records: records.slice(0, 200), records_truncated: records.length > 200, points: points.slice(0, 1000), points_truncated: points.length > 1000, sources: sourceRows, warnings, periods, comparison };
  let answer = comparison ? comparison.summary : periods ? `${periods.current} FIRs in ${periods.current_start} to ${periods.current_end}, compared with ${periods.previous} in ${periods.previous_start} to ${periods.previous_end}. ${periods.changes.filter(row => row.flagged).length} districts meet the stated descriptive warning rule.` : `${selected.length} FIRs match this scope. ${rows.slice(0, 4).map(row => `${row.label}: ${row.count}`).join('; ')}.`;
  if (payload.language === 'kn' || /[\u0c80-\u0cff]/.test(query)) answer = comparison ? `ದಾಖಲೆಗಳ ಹೋಲಿಕೆ: ${comparison.counts.support} ಬೆಂಬಲ ಸೂಚನೆಗಳು, ${comparison.counts.conflicts} ವಿರೋಧಾಭಾಸಗಳು. ಮೂಲಗಳು ಮತ್ತು ಕೊರತೆಯ ಮಾಹಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಿ.` : periods ? `ಈ ಅವಧಿಯಲ್ಲಿ ${periods.current} FIRಗಳು; ಹಿಂದಿನ ಸಮಾನ ಅವಧಿಯಲ್ಲಿ ${periods.previous} FIRಗಳು. ಇದು ದಾಖಲೆಗಳ ಹೋಲಿಕೆ, ತರಬೇತಿ ಪಡೆದ ಮುನ್ಸೂಚನೆ ಅಲ್ಲ.` : `ಈ ಆಯ್ಕೆಗೆ ${selected.length} FIRಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತವೆ. ${rows.slice(0, 4).map(row => `${row.label}: ${row.count}`).join('; ')}.`;
  answer += `\n\n${scope}`;
  event('Analysis retrieval', 'complete', `${firs.length} FIRs read; ${selected.length} match; source IDs attached`);
  event('Analysis calculation', 'complete', `${plan.view}; deterministic aggregation; no generated counts`);
  return finish({ answer, response: answer, analysis, sources: selected.slice(0, 8).map(row => ({ title: `FIR ${row.fir_number}`, snippet: `${row.crime_type} | ${row.district} | ${row.occurred_at}`, score: null })), response_kind: selected.length ? 'records' : 'no_data', confidence: null, model: 'Catalyst Cloud Scale Verified Analysis' });
}

module.exports = { assistantAnalysis, isAnalysisQuery, planQuery, incidentDay };
