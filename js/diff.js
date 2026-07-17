// diff.js — Motor de comparação: diffs por entidade, por assinatura agregada e deteção de viagens renomeadas.

import { FILE_CONFIGS, AGGREGATE_CONFIGS, PRIORITY_ORDER, NUMERIC_FIELDS, DEFAULT_ZERO_FIELDS } from './config.js';

function valuesEqual(field, ov, nv){
  if (ov === nv) return true;
  if (NUMERIC_FIELDS.has(field)){
    const a = parseFloat(ov), b = parseFloat(nv);
    if (!isNaN(a) && !isNaN(b)) return Math.abs(a - b) < 1e-5;
  }
  if (DEFAULT_ZERO_FIELDS.has(field)){
    return (ov === '' ? '0' : ov) === (nv === '' ? '0' : nv);
  }
  return false;
}

function diffEntityFile(oldRows, newRows, keyFn){
  const oldMap = new Map();
  oldRows.forEach(r => oldMap.set(keyFn(r), r));
  const newMap = new Map();
  newRows.forEach(r => newMap.set(keyFn(r), r));

  const added = [], removed = [], modified = [];
  let unchanged = 0;

  for (const [k, r] of oldMap){
    if (!newMap.has(k)) removed.push({ key: k, row: r });
  }
  for (const [k, r] of newMap){
    if (!oldMap.has(k)){
      added.push({ key: k, row: r });
    } else {
      const oldRow = oldMap.get(k);
      const fields = new Set([...Object.keys(oldRow), ...Object.keys(r)]);
      const changes = [];
      for (const f of fields){
        const ov = (oldRow[f] ?? '').toString().trim();
        const nv = (r[f] ?? '').toString().trim();
        if (!valuesEqual(f, ov, nv)) changes.push({ field: f, old: ov, new: nv });
      }
      if (changes.length) modified.push({ key: k, old: oldRow, new: r, changes });
      else unchanged++;
    }
  }
  return { added, removed, modified, unchanged };
}

function buildSignatures(rows, cfg){
  const groups = new Map();
  rows.forEach(r => {
    const pk = r[cfg.parentKey];
    if (pk === undefined) return;
    if (!groups.has(pk)) groups.set(pk, []);
    groups.get(pk).push(r);
  });
  const sigs = new Map();
  for (const [pk, list] of groups){
    list.sort((a,b) => Number(a[cfg.seqField]) - Number(b[cfg.seqField]));
    const sig = list.map(r => cfg.sigFields.map(f => (r[f] ?? '').toString().trim()).join(',')).join(';');
    sigs.set(pk, { sig, count: list.length });
  }
  return sigs;
}

function diffAggregateFile(oldRows, newRows, cfg){
  const oldSigs = buildSignatures(oldRows, cfg);
  const newSigs = buildSignatures(newRows, cfg);
  const added = [], removed = [], modified = [];
  let unchanged = 0;

  for (const [pk, o] of oldSigs){
    if (!newSigs.has(pk)) removed.push({ key: pk, count: o.count });
  }
  for (const [pk, n] of newSigs){
    if (!oldSigs.has(pk)){
      added.push({ key: pk, count: n.count });
    } else {
      const o = oldSigs.get(pk);
      if (o.sig !== n.sig) modified.push({ key: pk, oldCount: o.count, newCount: n.count });
      else unchanged++;
    }
  }
  return { added, removed, modified, unchanged };
}

// Builds trip_id -> departure time at the earliest stop_sequence, used to
// recognise "the same physical trip" even when trip_id itself changes.
export function buildFirstDeparture(rows){
  const map = new Map();
  const bestSeq = new Map();
  rows.forEach(r => {
    const tid = r.trip_id;
    if (tid === undefined) return;
    const seq = Number(r.stop_sequence);
    if (!bestSeq.has(tid) || seq < bestSeq.get(tid)){
      bestSeq.set(tid, seq);
      map.set(tid, r.departure_time || r.arrival_time || '');
    }
  });
  return map;
}

// Attempts to pair up trips that show as "removed" + "added" (different
// trip_id) but are almost certainly the same physical trip - e.g. only the
// service_id/calendar code embedded in the trip_id changed. Matching is
// based on route + direction + headsign + first departure time, and only
// accepted when exactly one candidate exists on each side (no ambiguity).
function matchRenamedTrips(diff, oldFirstDep, newFirstDep){
  const keyOf = (row, firstDepMap) => [
    row.route_id || '',
    row.direction_id || '',
    row.trip_headsign || '',
    row.shape_id || '',
    firstDepMap.get(row.trip_id) || '',
  ].join('|');

  const removedByKey = new Map();
  diff.removed.forEach(item => {
    const k = keyOf(item.row, oldFirstDep);
    if (!removedByKey.has(k)) removedByKey.set(k, []);
    removedByKey.get(k).push(item);
  });
  const addedByKey = new Map();
  diff.added.forEach(item => {
    const k = keyOf(item.row, newFirstDep);
    if (!addedByKey.has(k)) addedByKey.set(k, []);
    addedByKey.get(k).push(item);
  });

  const renamed = [];
  const stillRemoved = [];
  const consumedAdded = new Set();

  for (const [k, removedItems] of removedByKey){
    const addedItems = addedByKey.get(k);
    if (removedItems.length === 1 && addedItems && addedItems.length === 1){
      const oldRow = removedItems[0].row, newRow = addedItems[0].row;
      const fields = new Set([...Object.keys(oldRow), ...Object.keys(newRow)]);
      const changes = [];
      for (const f of fields){
        if (f === 'trip_id') continue; // implied by oldKey -> newKey already
        const ov = (oldRow[f] ?? '').toString().trim();
        const nv = (newRow[f] ?? '').toString().trim();
        if (ov !== nv) changes.push({ field: f, old: ov, new: nv });
      }
      renamed.push({
        key: `${removedItems[0].key} \u2192 ${addedItems[0].key}`,
        oldKey: removedItems[0].key,
        newKey: addedItems[0].key,
        old: oldRow, new: newRow, changes,
      });
      consumedAdded.add(addedItems[0].key);
    } else {
      stillRemoved.push(...removedItems);
    }
  }

  diff.removed = stillRemoved;
  diff.added = diff.added.filter(item => !consumedAdded.has(item.key));
  diff.renamed = renamed;
}

export function computeAllDiffs(oldData, newData){
  const allFiles = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const results = [];

  for (const filename of allFiles){
    const oldEntry = oldData[filename] || { rows: [], fields: [] };
    const newEntry = newData[filename] || { rows: [], fields: [] };
    const onlyOld = !newData[filename];
    const onlyNew = !oldData[filename];

    if (AGGREGATE_CONFIGS[filename]){
      const cfg = AGGREGATE_CONFIGS[filename];
      const diff = diffAggregateFile(oldEntry.rows, newEntry.rows, cfg);
      results.push({ filename, label: cfg.label, type: 'aggregate', diff, onlyOld, onlyNew });
    } else {
      let keyFn, label = filename;
      if (FILE_CONFIGS[filename]){
        keyFn = FILE_CONFIGS[filename].key;
        label = FILE_CONFIGS[filename].label;
      } else {
        const fields = newEntry.fields.length ? newEntry.fields : oldEntry.fields;
        const idField = fields.find(f => f.toLowerCase().endsWith('_id'));
        keyFn = idField ? (r => r[idField]) : (r => JSON.stringify(r));
      }
      const diff = diffEntityFile(oldEntry.rows, newEntry.rows, keyFn);

      if (filename === 'trips.txt' && diff.added.length && diff.removed.length){
        const oldStopTimes = (oldData['stop_times.txt'] || { rows: [] }).rows;
        const newStopTimes = (newData['stop_times.txt'] || { rows: [] }).rows;
        matchRenamedTrips(diff, buildFirstDeparture(oldStopTimes), buildFirstDeparture(newStopTimes));
      } else {
        diff.renamed = [];
      }

      results.push({ filename, label, type: 'entity', diff, onlyOld, onlyNew });
    }
  }

  results.sort((a, b) => {
    const ia = PRIORITY_ORDER.indexOf(a.filename), ib = PRIORITY_ORDER.indexOf(b.filename);
    if (ia === -1 && ib === -1) return a.filename.localeCompare(b.filename);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return results;
}
