'use strict';

// Investigator-facing records derived exclusively from the official KSP FIR
// schema. These are in-memory read models, never duplicate Data Store tables.
const KSP_READ_MODEL_VERSION = 'ksp-er-v2';

const KSP_ER_TABLES = [
  'CaseMaster', 'ComplainantDetails', 'ActSectionAssociation', 'Victim',
  'Accused', 'ArrestSurrender', 'Act', 'Section', 'CrimeHeadActSection',
  'CrimeHead', 'CrimeSubHead', 'CasteMaster', 'ReligionMaster',
  'OccupationMaster', 'CaseStatusMaster', 'Court', 'District', 'State',
  'Unit', 'UnitType', 'Rank', 'Designation', 'Employee', 'CaseCategory',
  'GravityOffence', 'ChargesheetDetails', 'Inv_OccuranceTime',
  'inv_arrestsurrenderaccused',
];

const KSP_VIRTUAL_TABLES = [
  'Firs', 'Cases', 'Criminals', 'FirCriminals', 'Arrests', 'Victims',
  'Complainants', 'Relationships', 'PoliceStations', 'Chargesheets',
  'Phones', 'Vehicles', 'Addresses', 'Weapons', 'Organizations', 'OrgMembers',
];

const CASE_BASE = [
  'CaseMaster', 'CrimeSubHead', 'Unit', 'District', 'CaseStatusMaster',
  'GravityOffence', 'Employee', 'Inv_OccuranceTime',
];

const VIEW_DEPENDENCIES = {
  Firs: [...CASE_BASE, 'ActSectionAssociation', 'Act', 'Section'],
  Cases: CASE_BASE,
  Criminals: [...CASE_BASE, 'Accused', 'ArrestSurrender'],
  FirCriminals: ['CaseMaster', 'Accused'],
  Arrests: [
    'CaseMaster', 'Accused', 'ArrestSurrender', 'Employee', 'District',
    'Unit', 'CrimeSubHead', 'CaseStatusMaster', 'GravityOffence',
    'Inv_OccuranceTime',
  ],
  Victims: ['CaseMaster', 'Victim'],
  Complainants: [
    'CaseMaster', 'ComplainantDetails', 'OccupationMaster', 'ReligionMaster',
    'CasteMaster',
  ],
  Relationships: [
    'CaseMaster', 'Accused', 'Victim', 'ComplainantDetails',
    'ArrestSurrender', 'Unit', 'UnitType', 'District',
    'CrimeSubHead', 'CaseStatusMaster', 'GravityOffence', 'Employee',
    'Inv_OccuranceTime',
  ],
  PoliceStations: ['Unit', 'UnitType', 'District'],
  Chargesheets: ['CaseMaster', 'ChargesheetDetails', 'Employee', 'Court'],
  Phones: [],
  Vehicles: [],
  Addresses: [],
  Weapons: [],
  Organizations: [],
  OrgMembers: [],
};

function value(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== null && row[key] !== undefined) return row[key];
  }
  return null;
}

function text(row, ...keys) {
  const found = value(row, ...keys);
  return found === null ? '' : String(found).trim();
}

function number(row, ...keys) {
  const found = Number(value(row, ...keys));
  return Number.isFinite(found) ? found : 0;
}

function referenceKeys(input) {
  if (input === null || input === undefined || input === '') return [];
  if (typeof input !== 'object') return [String(input)];
  return unique([
    input.ROWID, input.rowid, input.id, input.value,
    ...Object.values(input).filter((item) => ['string', 'number', 'bigint'].includes(typeof item)),
  ]).map(String);
}

function referenceIndex(rows, businessKey) {
  const index = new Map();
  for (const row of rows || []) {
    const keys = [value(row, 'ROWID', 'rowid'), row && row[businessKey]];
    for (const key of keys) {
      if (key !== null && key !== undefined && key !== '') index.set(String(key), row);
    }
  }
  return index;
}

function resolve(index, foreignValue) {
  for (const key of referenceKeys(foreignValue)) {
    const row = index.get(key);
    if (row) return row;
  }
  return null;
}

function normalizeStatus(input) {
  return String(input || 'Registered').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function normalizeIdentity(input) {
  return String(input || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function gender(valueToMap) {
  const id = Number(valueToMap);
  return id === 2 ? 'F' : id === 3 ? 'T' : 'M';
}

function mode(values, fallback = '') {
  const counts = new Map();
  for (const item of values.filter(Boolean)) counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || fallback;
}

function unique(values) {
  return [...new Set(values.filter((item) => item !== null && item !== undefined && item !== ''))];
}

function modusFromFacts(facts) {
  return String(facts || '').match(/modus operandi\s*:\s*([^.;]+)/i)?.[1]?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || '';
}

function dependenciesForViews(views) {
  const dependencies = new Set();
  for (const view of views || []) {
    for (const table of VIEW_DEPENDENCIES[view] || []) dependencies.add(table);
  }
  return [...dependencies];
}

function buildKspReadModel(source = {}) {
  const rows = (name) => Array.isArray(source[name]) ? source[name] : [];

  const caseRows = rows('CaseMaster');
  const caseIndex = referenceIndex(caseRows, 'CaseMasterID');
  const subHeadIndex = referenceIndex(rows('CrimeSubHead'), 'CrimeSubHeadID');
  const unitIndex = referenceIndex(rows('Unit'), 'UnitID');
  const unitTypeIndex = referenceIndex(rows('UnitType'), 'UnitTypeID');
  const districtIndex = referenceIndex(rows('District'), 'DistrictID');
  const statusIndex = referenceIndex(rows('CaseStatusMaster'), 'CaseStatusID');
  const gravityIndex = referenceIndex(rows('GravityOffence'), 'GravityOffenceID');
  const employeeIndex = referenceIndex(rows('Employee'), 'EmployeeID');
  const actIndex = referenceIndex(rows('Act'), 'ActCode');
  const sectionIndex = referenceIndex(rows('Section'), 'SectionCode');
  const occupationIndex = referenceIndex(rows('OccupationMaster'), 'OccupationID');
  const religionIndex = referenceIndex(rows('ReligionMaster'), 'ReligionID');
  const casteIndex = referenceIndex(rows('CasteMaster'), 'caste_master_id');
  const courtIndex = referenceIndex(rows('Court'), 'CourtID');
  const accusedRows = rows('Accused');
  const accusedIndex = referenceIndex(accusedRows, 'AccusedMasterID');

  const occurrenceByCase = new Map();
  for (const occurrence of rows('Inv_OccuranceTime')) {
    const caseRow = resolve(caseIndex, occurrence.CaseMasterID);
    if (caseRow) occurrenceByCase.set(number(caseRow, 'CaseMasterID'), occurrence);
  }

  const sectionsByCase = new Map();
  for (const association of rows('ActSectionAssociation')) {
    const caseRow = resolve(caseIndex, association.CaseMasterID);
    if (!caseRow) continue;
    const caseId = number(caseRow, 'CaseMasterID');
    const act = resolve(actIndex, association.ActID);
    const section = resolve(sectionIndex, association.SectionID);
    const actLabel = text(act, 'ShortName', 'ActCode') || text(association, 'ActID');
    const sectionLabel = text(section, 'SectionCode') || text(association, 'SectionID');
    const label = [actLabel, sectionLabel].filter(Boolean).join(' ');
    if (!label) continue;
    const list = sectionsByCase.get(caseId) || [];
    list.push({
      label,
      act_order: number(association, 'ActOrderID'),
      section_order: number(association, 'SectionOrderID'),
    });
    sectionsByCase.set(caseId, list);
  }

  const caseFacts = new Map();
  for (const caseRow of caseRows) {
    const id = number(caseRow, 'CaseMasterID');
    const station = resolve(unitIndex, caseRow.PoliceStationID);
    const district = station && resolve(districtIndex, station.DistrictID);
    const subHead = resolve(subHeadIndex, caseRow.CrimeMinorHeadID);
    const caseStatus = resolve(statusIndex, caseRow.CaseStatusID);
    const gravity = resolve(gravityIndex, caseRow.GravityOffenceID);
    const officer = resolve(employeeIndex, caseRow.PolicePersonID);
    const occurrence = occurrenceByCase.get(id);
    const gravityName = text(gravity, 'LookupValue');
    const status = normalizeStatus(text(caseStatus, 'CaseStatusName'));
    const heinous = gravityName.toLowerCase() === 'heinous';
    const active = status === 'registered' || status === 'under_investigation';
    const crimeType = text(subHead, 'CrimeHeadName') || 'Unclassified offence';
    const districtName = text(district, 'DistrictName') || 'District not recorded';
    const sectionLabels = (sectionsByCase.get(id) || [])
      .sort((a, b) => a.act_order - b.act_order || a.section_order - b.section_order)
      .map((item) => item.label);
    caseFacts.set(id, {
      id,
      rowid: text(caseRow, 'ROWID', 'rowid'),
      station_id: number(station, 'UnitID'),
      station_name: text(station, 'UnitName'),
      district_id: number(district, 'DistrictID'),
      district: districtName,
      crime_type: crimeType,
      status,
      severity: heinous ? 'high' : 'medium',
      priority: heinous && active ? 'critical' : heinous ? 'high' : 'medium',
      officer_id: number(officer, 'EmployeeID'),
      officer: text(officer, 'FirstName') || 'Unassigned',
      occurred_at: text(occurrence, 'OccuranceFrom') || text(caseRow, 'IncidentFromDate'),
      occurred_to: text(occurrence, 'OccuranceTo') || text(caseRow, 'IncidentToDate'),
      reported_at: text(caseRow, 'InfoReceivedPSDate', 'CrimeRegisteredDate'),
      opened_at: text(caseRow, 'CrimeRegisteredDate'),
      location: text(occurrence, 'PlaceOfOccurance') || districtName,
      description: text(caseRow, 'BriefFacts'),
      fir_number: text(caseRow, 'CrimeNo'),
      case_number: text(caseRow, 'CaseNo'),
      ipc_sections: unique(sectionLabels).join(', '),
      modus: modusFromFacts(text(caseRow, 'BriefFacts')),
      lat: number(caseRow, 'latitude'),
      lng: number(caseRow, 'longitude'),
      court: resolve(courtIndex, caseRow.CourtID),
      gravity: gravityName,
    });
  }

  const firs = [...caseFacts.values()].map((item) => ({
    ROWID: item.rowid,
    id: item.id,
    fir_number: item.fir_number,
    case_number: item.case_number,
    station_id: item.station_id,
    station_name: item.station_name,
    district_id: item.district_id,
    crime_type: item.crime_type,
    ipc_sections: item.ipc_sections,
    district: item.district,
    taluk: '',
    lat: item.lat,
    lng: item.lng,
    occurred_at: item.occurred_at,
    occurred_to: item.occurred_to,
    reported_at: item.reported_at,
    status: item.status,
    severity: item.severity,
    modus: item.modus,
    location: item.location,
    description: item.description,
    source_table: 'CaseMaster',
  })).sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));

  const cases = [...caseFacts.values()].map((item) => ({
    ROWID: item.rowid,
    id: item.id,
    case_number: item.case_number,
    title: `${item.crime_type} - ${item.district}`,
    fir_id: item.id,
    status: item.status,
    case_priority: item.priority,
    priority: item.priority,
    assigned_officer: item.officer_id,
    officer: item.officer,
    district: item.district,
    opened_at: item.opened_at,
    updated_at: item.reported_at || item.opened_at,
    summary: item.description,
    crime_type: item.crime_type,
    source_table: 'CaseMaster',
  })).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  const profileGroups = new Map();
  const profileIdByAccusedRef = new Map();
  for (const accused of accusedRows) {
    const name = text(accused, 'AccusedName') || `Unidentified accused ${number(accused, 'AccusedMasterID')}`;
    const identity = `${normalizeIdentity(name)}|${number(accused, 'AgeYear')}|${number(accused, 'GenderID')}`;
    const group = profileGroups.get(identity) || { name, occurrences: [] };
    group.occurrences.push(accused);
    profileGroups.set(identity, group);
  }

  const profileById = new Map();
  const firCriminals = [];
  for (const group of profileGroups.values()) {
    const accusedIds = group.occurrences.map((row) => number(row, 'AccusedMasterID')).filter(Boolean);
    const id = Math.min(...accusedIds);
    if (!Number.isFinite(id)) continue;
    const linkedCases = unique(group.occurrences.map((row) => {
      const caseRow = resolve(caseIndex, row.CaseMasterID);
      return caseRow ? number(caseRow, 'CaseMasterID') : 0;
    }).filter(Boolean));
    const facts = linkedCases.map((caseId) => caseFacts.get(caseId)).filter(Boolean);
    const groupRefKeys = [];
    for (const occurrence of group.occurrences) {
      groupRefKeys.push(...referenceKeys(value(occurrence, 'ROWID', 'rowid')));
      groupRefKeys.push(String(number(occurrence, 'AccusedMasterID')));
      const caseRow = resolve(caseIndex, occurrence.CaseMasterID);
      if (caseRow) {
        firCriminals.push({
          fir_id: number(caseRow, 'CaseMasterID'),
          criminal_id: id,
          accused_master_id: number(occurrence, 'AccusedMasterID'),
          role: text(occurrence, 'PersonID').toUpperCase() === 'A1' ? 'prime_accused' : 'accused',
          source_table: 'Accused',
        });
      }
    }
    for (const key of groupRefKeys) profileIdByAccusedRef.set(String(key), id);

    const arrestCount = rows('ArrestSurrender').filter((arrest) => {
      const accused = resolve(accusedIndex, arrest.AccusedMasterID);
      return accused && profileIdByAccusedRef.get(String(value(accused, 'ROWID', 'AccusedMasterID'))) === id;
    }).length;
    const heinousCount = facts.filter((item) => item.gravity.toLowerCase() === 'heinous').length;
    const districts = unique(facts.map((item) => item.district));
    const score = Math.min(98, Math.round(
      18 + Math.min(linkedCases.length, 10) * 5 + Math.min(arrestCount, 6) * 4 +
      Math.min(heinousCount, 5) * 3 + (districts.length > 1 ? Math.min(8, districts.length * 2) : 0),
    ));
    const firstSeen = facts.map((item) => item.occurred_at).filter(Boolean).sort()[0] || '';
    const profile = {
      id,
      name: group.name,
      aliases: '[]',
      gender: gender(value(group.occurrences[0], 'GenderID')),
      age: number(group.occurrences[0], 'AgeYear'),
      status: arrestCount ? 'arrest_recorded' : 'no_arrest_record',
      risk_score: score,
      crime_category: mode(facts.map((item) => item.crime_type), 'Unclassified offence'),
      known_locations: JSON.stringify(districts),
      home_district: mode(facts.map((item) => item.district), 'District not recorded'),
      first_seen: firstSeen,
      photo_seed: id,
      portrait_asset: `/synthetic-profiles/profile-${String(id).padStart(6, '0')}.webp`,
      portrait_key: `synthetic-accused-profiles/v1/profile-${String(id).padStart(6, '0')}.webp`,
      portrait_synthetic: true,
      notes: 'Profile resolved from matching name, age and gender across official Accused records.',
      fir_count: linkedCases.length,
      arrest_count: arrestCount,
      risk_basis: `FIRs ${linkedCases.length}; arrests ${arrestCount}; heinous cases ${heinousCount}; districts ${districts.length}`,
      source_table: 'Accused',
    };
    profileById.set(id, profile);
  }

  // Recompute arrest counts after every accused reference has been mapped.
  const arrests = rows('ArrestSurrender').map((arrest) => {
    const accused = resolve(accusedIndex, arrest.AccusedMasterID);
    const caseRow = resolve(caseIndex, arrest.CaseMasterID);
    const employee = resolve(employeeIndex, arrest.IOID);
    const district = resolve(districtIndex, arrest.ArrestSurrenderDistrictId);
    const accusedRef = accused && (text(accused, 'ROWID', 'rowid') || String(number(accused, 'AccusedMasterID')));
    return {
      ROWID: text(arrest, 'ROWID', 'rowid'),
      id: number(arrest, 'ArrestSurrenderID'),
      criminal_id: accusedRef ? profileIdByAccusedRef.get(accusedRef) || 0 : 0,
      accused_master_id: number(accused, 'AccusedMasterID'),
      fir_id: number(caseRow, 'CaseMasterID'),
      arrested_at: text(arrest, 'ArrestSurrenderDate'),
      arresting_officer: text(employee, 'FirstName') || 'Officer not recorded',
      district: text(district, 'DistrictName') || caseFacts.get(number(caseRow, 'CaseMasterID'))?.district || '',
      arrest_type: number(arrest, 'ArrestSurrenderTypeID') === 2 ? 'surrender' : 'arrest',
      court_id: number(resolve(courtIndex, arrest.CourtID), 'CourtID') || null,
      source_table: 'ArrestSurrender',
    };
  }).filter((row) => row.id && row.fir_id && row.criminal_id)
    .sort((a, b) => String(b.arrested_at).localeCompare(String(a.arrested_at)));

  const arrestCounts = new Map();
  for (const arrest of arrests) arrestCounts.set(arrest.criminal_id, (arrestCounts.get(arrest.criminal_id) || 0) + 1);
  for (const [id, profile] of profileById) {
    const count = arrestCounts.get(id) || 0;
    profile.arrest_count = count;
    profile.status = count ? 'arrest_recorded' : 'no_arrest_record';
  }
  const criminals = [...profileById.values()].sort((a, b) => b.risk_score - a.risk_score || a.name.localeCompare(b.name));

  const victims = rows('Victim').map((victim) => {
    const caseRow = resolve(caseIndex, victim.CaseMasterID);
    return {
      ROWID: text(victim, 'ROWID', 'rowid'),
      id: number(victim, 'VictimMasterID'),
      fir_id: number(caseRow, 'CaseMasterID'),
      name: text(victim, 'VictimName'),
      gender: gender(victim.GenderID),
      age: number(victim, 'AgeYear'),
      police_personnel: ['1', 'true'].includes(text(victim, 'VictimPolice').toLowerCase()),
      source_table: 'Victim',
    };
  }).filter((row) => row.id && row.fir_id);

  const complainants = rows('ComplainantDetails').map((complainant) => {
    const caseRow = resolve(caseIndex, complainant.CaseMasterID);
    const occupation = resolve(occupationIndex, complainant.OccupationID);
    const religion = resolve(religionIndex, complainant.ReligionID);
    const caste = resolve(casteIndex, complainant.CasteID);
    return {
      ROWID: text(complainant, 'ROWID', 'rowid'),
      id: number(complainant, 'ComplainantID'),
      fir_id: number(caseRow, 'CaseMasterID'),
      name: text(complainant, 'ComplainantName'),
      age: number(complainant, 'AgeYear'),
      gender: gender(complainant.GenderID),
      occupation: text(occupation, 'OccupationName') || 'Not stated',
      religion: text(religion, 'ReligionName') || 'Not stated',
      caste: text(caste, 'caste_master_name') || 'Not stated',
      source_table: 'ComplainantDetails',
    };
  }).filter((row) => row.id && row.fir_id);

  const policeStations = rows('Unit').flatMap((unit) => {
    const type = resolve(unitTypeIndex, unit.TypeID);
    const typeName = text(type, 'UnitTypeName');
    if (typeName && typeName.toLowerCase() !== 'police station') return [];
    const district = resolve(districtIndex, unit.DistrictID);
    const id = number(unit, 'UnitID');
    return id ? [{
      ROWID: text(unit, 'ROWID', 'rowid'),
      id,
      station_code: `U-${id}`,
      name: text(unit, 'UnitName'),
      district: text(district, 'DistrictName'),
      source_table: 'Unit',
    }] : [];
  });

  const chargesheets = rows('ChargesheetDetails').map((sheet) => {
    const caseRow = resolve(caseIndex, sheet.CaseMasterID);
    const caseId = number(caseRow, 'CaseMasterID');
    const officer = resolve(employeeIndex, sheet.PolicePersonID);
    const court = caseRow && resolve(courtIndex, caseRow.CourtID);
    const type = text(sheet, 'cstype').toUpperCase();
    return {
      ROWID: text(sheet, 'ROWID', 'rowid'),
      id: number(sheet, 'CSID'),
      fir_id: caseId,
      csdate: text(sheet, 'csdate'),
      cstype: type,
      final_report: type === 'A' ? 'Chargesheet' : type === 'B' ? 'False case' : type === 'C' ? 'Undetected' : 'Final report',
      police_person_id: number(officer, 'EmployeeID'),
      officer: text(officer, 'FirstName'),
      court: text(court, 'CourtName'),
      source_table: 'ChargesheetDetails',
    };
  }).filter((row) => row.id && row.fir_id);

  const relationships = [];
  let relationshipId = 1;
  for (const link of firCriminals) {
    relationships.push({
      id: relationshipId++,
      source_type: 'criminal',
      source_id: link.criminal_id,
      target_type: 'fir',
      target_id: link.fir_id,
      rel_type: link.role === 'prime_accused' ? 'prime_accused_in' : 'involved_in',
      confidence: 1,
      frequency: 1,
      note: `Derived from Accused ${link.accused_master_id}`,
      source_table: 'Accused',
    });
  }

  const profilesByCase = new Map();
  for (const link of firCriminals) {
    const set = profilesByCase.get(link.fir_id) || new Set();
    set.add(link.criminal_id);
    profilesByCase.set(link.fir_id, set);
  }
  const coAccused = new Map();
  for (const [firId, idsSet] of profilesByCase) {
    const ids = [...idsSet].sort((a, b) => a - b);
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const key = `${ids[left]}:${ids[right]}`;
        const item = coAccused.get(key) || { source: ids[left], target: ids[right], firs: [] };
        item.firs.push(firId);
        coAccused.set(key, item);
      }
    }
  }
  for (const item of coAccused.values()) {
    relationships.push({
      id: relationshipId++,
      source_type: 'criminal',
      source_id: item.source,
      target_type: 'criminal',
      target_id: item.target,
      rel_type: 'co_accused',
      confidence: Math.min(0.98, 0.75 + item.firs.length * 0.05),
      frequency: item.firs.length,
      note: `Named together in FIRs ${item.firs.slice(0, 8).join(', ')}`,
      source_table: 'Accused',
    });
  }

  // Add explicit case-context links so an investigator can follow the official
  // chain Accused -> FIR -> victim / complainant / police station. These are
  // projections of foreign keys in the supplied schema, not inferred identity
  // matches or additional operational tables.
  for (const victim of victims) {
    relationships.push({
      id: relationshipId++,
      source_type: 'victim',
      source_id: victim.id,
      target_type: 'fir',
      target_id: victim.fir_id,
      rel_type: 'victim_in',
      confidence: 1,
      frequency: 1,
      note: `Derived from Victim ${victim.id}`,
      source_table: 'Victim',
    });
  }
  for (const complainant of complainants) {
    relationships.push({
      id: relationshipId++,
      source_type: 'complainant',
      source_id: complainant.id,
      target_type: 'fir',
      target_id: complainant.fir_id,
      rel_type: 'complainant_of',
      confidence: 1,
      frequency: 1,
      note: `Derived from ComplainantDetails ${complainant.id}`,
      source_table: 'ComplainantDetails',
    });
  }
  for (const fir of firs) {
    if (!fir.station_id) continue;
    relationships.push({
      id: relationshipId++,
      source_type: 'fir',
      source_id: fir.id,
      target_type: 'station',
      target_id: fir.station_id,
      rel_type: 'registered_at',
      confidence: 1,
      frequency: 1,
      note: `CaseMaster PoliceStationID ${fir.station_id}`,
      source_table: 'CaseMaster',
    });
  }

  return {
    Firs: firs,
    Cases: cases,
    Criminals: criminals,
    FirCriminals: firCriminals,
    Arrests: arrests,
    Victims: victims,
    Complainants: complainants,
    Relationships: relationships,
    PoliceStations: policeStations,
    Chargesheets: chargesheets,
    Phones: [],
    Vehicles: [],
    Addresses: [],
    Weapons: [],
    Organizations: [],
    OrgMembers: [],
  };
}

module.exports = {
  KSP_ER_TABLES,
  KSP_READ_MODEL_VERSION,
  KSP_VIRTUAL_TABLES,
  buildKspReadModel,
  dependenciesForViews,
};
