// crosswalk.js — Correspondência entre operadores (modo "Operador externo").
// Quando o GTFS do operador não segue as nossas normas de IDs, tentamos
// corresponder entidades pelo conteúdo em vez do ID: primeiro por ID exato
// (rápido e sem ambiguidade quando por acaso coincide), depois por
// heurística de conteúdo, sempre conservadores — só assumimos uma
// correspondência quando não há ambiguidade real.


import { STOP_MATCH_MAX_DIST_M, TRIP_MATCH_SCORE_MAX, WEEKDAY_FIELDS } from './config.js';
import { normalizeName, extractRouteNumber, haversineMeters, toSeconds, esc } from './utils.js';

function buildTripTimeIndex(stopTimesRows){
  const byTrip = new Map();
  (stopTimesRows || []).forEach(r => {
    const tid = r.trip_id;
    if (tid === undefined) return;
    if (!byTrip.has(tid)) byTrip.set(tid, []);
    byTrip.get(tid).push(r);
  });
  const idx = new Map();
  for (const [tid, rows] of byTrip){
    rows.sort((a,b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const first = rows[0], last = rows[rows.length-1];
    idx.set(tid, {
      first: first.departure_time || first.arrival_time || '',
      last: last.arrival_time || last.departure_time || '',
      count: rows.length,
    });
  }
  return idx;
}

// Linhas: por route_id exato onde coincide; senão por número extraído do
// route_short_name ("808 | Nome" -> "808"), senão por route_long_name normalizado.
function matchRoutes(nossoRows, delesRows){
  const map = new Map(); // deles route_id -> nosso route_id
  const notes = [];
  const nossoById = new Map(nossoRows.map(r => [r.route_id, r]));
  const unmatchedDeles = [];
  let viaId = 0;
  delesRows.forEach(r => {
    if (nossoById.has(r.route_id)){ map.set(r.route_id, r.route_id); viaId++; }
    else unmatchedDeles.push(r);
  });
  const unmatchedNosso = nossoRows.filter(r => !Array.from(map.values()).includes(r.route_id));
  let viaFuzzy = 0;
  unmatchedDeles.forEach(d => {
    const dNum = extractRouteNumber(d.route_short_name);
    const candidates = unmatchedNosso.filter(n => extractRouteNumber(n.route_short_name) === dNum || normalizeName(n.route_long_name) === normalizeName(d.route_long_name));
    if (candidates.length === 1){
      map.set(d.route_id, candidates[0].route_id);
      viaFuzzy++;
    }
  });
  // Nota de convenção: route_short_name do operador inclui texto extra?
  const withPipe = delesRows.filter(r => /\d+\s*\|/.test(r.route_short_name || '')).length;
  if (withPipe > delesRows.length * 0.5){
    notes.push(`O route_short_name do operador inclui a descrição da linha colada ao número (ex.: "${esc((delesRows[0]||{}).route_short_name || '')}"), diferente do nosso padrão de código limpo.`);
  }
  return { map, notes, stats: { total: delesRows.length, viaId, viaFuzzy, unresolved: delesRows.length - viaId - viaFuzzy } };
}

// Paragens: por stop_id exato onde coincide; senão por nome normalizado
// igual + distância geográfica dentro do limiar.
function matchStops(nossoRows, delesRows){
  const map = new Map();
  const nossoIds = new Set(nossoRows.map(r => r.stop_id));
  const unmatchedDeles = [];
  let viaId = 0;
  delesRows.forEach(r => {
    if (nossoIds.has(r.stop_id)){ map.set(r.stop_id, r.stop_id); viaId++; }
    else unmatchedDeles.push(r);
  });
  const matchedNossoIds = new Set(map.values());
  const unmatchedNosso = nossoRows.filter(r => !matchedNossoIds.has(r.stop_id));
  let viaFuzzy = 0;
  unmatchedDeles.forEach(d => {
    const dn = normalizeName(d.stop_name);
    const dlat = parseFloat(d.stop_lat), dlon = parseFloat(d.stop_lon);
    if (!dn || isNaN(dlat) || isNaN(dlon)) return;
    const candidates = [];
    for (const n of unmatchedNosso){
      if (normalizeName(n.stop_name) !== dn) continue;
      const nlat = parseFloat(n.stop_lat), nlon = parseFloat(n.stop_lon);
      if (isNaN(nlat) || isNaN(nlon)) continue;
      const dist = haversineMeters(dlat, dlon, nlat, nlon);
      if (dist <= STOP_MATCH_MAX_DIST_M) candidates.push({ n, dist });
    }
    // Se houver mais que 1 candidato com o mesmo nome perto (ex.: paragens
    // em lados opostos da via, cada uma com o seu próprio ID), não
    // arriscamos escolher "a mais próxima" — fica por corresponder.
    if (candidates.length === 1){
      map.set(d.stop_id, candidates[0].n.stop_id);
      unmatchedNosso.splice(unmatchedNosso.indexOf(candidates[0].n), 1);
      viaFuzzy++;
    }
  });
  return { map, stats: { total: delesRows.length, viaId, viaFuzzy, unresolved: delesRows.length - viaId - viaFuzzy } };
}

// Calendário: por service_id exato onde coincide; senão por padrão de dias
// da semana + período de validade idêntico, só quando não há ambiguidade.
function matchCalendar(nossoRows, delesRows){
  const map = new Map();
  const nossoIds = new Set(nossoRows.map(r => r.service_id));
  const unmatchedDeles = [];
  let viaId = 0;
  delesRows.forEach(r => {
    if (nossoIds.has(r.service_id)){ map.set(r.service_id, r.service_id); viaId++; }
    else unmatchedDeles.push(r);
  });
  const matchedNossoIds = new Set(map.values());
  const unmatchedNosso = nossoRows.filter(r => !matchedNossoIds.has(r.service_id));
  const patternOf = r => WEEKDAY_FIELDS.map(f => r[f]).join('') + '|' + r.start_date + '|' + r.end_date;
  let viaFuzzy = 0;
  unmatchedDeles.forEach(d => {
    const pat = patternOf(d);
    const candidates = unmatchedNosso.filter(n => patternOf(n) === pat);
    if (candidates.length === 1){
      map.set(d.service_id, candidates[0].service_id);
      unmatchedNosso.splice(unmatchedNosso.indexOf(candidates[0]), 1);
      viaFuzzy++;
    }
  });
  return { map, stats: { total: delesRows.length, viaId, viaFuzzy, unresolved: delesRows.length - viaId - viaFuzzy } };
}

// Viagens: por trip_id exato onde coincide; senão por chave grosseira
// (linha correspondida + direção + serviço correspondido + 1ª partida),
// desempatando ambiguidades pela hora de chegada final e nº de paragens.
function matchTrips(nossoTrips, delesTrips, nossoTimeIdx, delesTimeIdx, routeMap, calMap){
  const map = new Map();
  const nossoIds = new Set(nossoTrips.map(t => t.trip_id));
  const unmatchedDeles = [];
  let viaId = 0;
  delesTrips.forEach(t => {
    if (nossoIds.has(t.trip_id)){ map.set(t.trip_id, t.trip_id); viaId++; }
    else unmatchedDeles.push(t);
  });
  const matchedNossoIds = new Set(map.values());
  const unmatchedNosso = nossoTrips.filter(t => !matchedNossoIds.has(t.trip_id));

  const keyOf = (t, isDeles) => {
    const routeId = isDeles ? (routeMap.get(t.route_id) || t.route_id) : t.route_id;
    const serviceId = isDeles ? (calMap.get(t.service_id) || t.service_id) : t.service_id;
    const idx = isDeles ? delesTimeIdx : nossoTimeIdx;
    const first = (idx.get(t.trip_id) || {}).first || '';
    return `${routeId}|${t.direction_id}|${serviceId}|${first}`;
  };

  const nossoByKey = new Map();
  unmatchedNosso.forEach(t => {
    const k = keyOf(t, false);
    if (!nossoByKey.has(k)) nossoByKey.set(k, []);
    nossoByKey.get(k).push(t);
  });
  const delesByKey = new Map();
  unmatchedDeles.forEach(t => {
    const k = keyOf(t, true);
    if (!delesByKey.has(k)) delesByKey.set(k, []);
    delesByKey.get(k).push(t);
  });

  let viaHeuristic = 0;
  for (const [k, nGroup] of nossoByKey){
    const dGroup = delesByKey.get(k);
    if (!dGroup || !dGroup.length) continue;
    if (nGroup.length === 1 && dGroup.length === 1){
      map.set(dGroup[0].trip_id, nGroup[0].trip_id);
      viaHeuristic++;
      continue;
    }
    // ambiguous: greedy nearest by (last-time diff + count diff*20)
    const remainingD = dGroup.slice();
    nGroup.forEach(n => {
      const ni = nossoTimeIdx.get(n.trip_id) || {};
      const nLast = toSeconds(ni.last), nCount = ni.count || 0;
      let best = null, bestScore = null;
      remainingD.forEach(d => {
        const di = delesTimeIdx.get(d.trip_id) || {};
        const dLast = toSeconds(di.last), dCount = di.count || 0;
        if (nLast === null || dLast === null) return;
        const score = Math.abs(nLast - dLast) + Math.abs(nCount - dCount) * 20;
        if (bestScore === null || score < bestScore){ bestScore = score; best = d; }
      });
      if (best && bestScore !== null && bestScore < TRIP_MATCH_SCORE_MAX){
        map.set(best.trip_id, n.trip_id);
        remainingD.splice(remainingD.indexOf(best), 1);
        viaHeuristic++;
      }
    });
  }

  return { map, stats: { total: delesTrips.length, viaId, viaHeuristic, unresolved: delesTrips.length - viaId - viaHeuristic } };
}

// Os nossos ficheiros de referência (stops.txt, calendar.txt) são muitas
// vezes partilhados por toda a rede (várias UTs), não só pela rede do
// operador em análise. Sem isto, paragens/calendários de OUTRAS redes
// apareceriam como "removidos" só por não existirem no ficheiro do operador.
export function scopeNossoToUsage(nossoData){
  const trips = (nossoData['trips.txt'] || {}).rows || [];
  const stopTimes = (nossoData['stop_times.txt'] || {}).rows || [];
  const usedTripIds = new Set(trips.map(t => t.trip_id));
  const usedRouteIds = new Set(trips.map(t => t.route_id));
  const usedServiceIds = new Set(trips.map(t => t.service_id));
  const usedStopIds = new Set();
  stopTimes.forEach(r => { if (usedTripIds.has(r.trip_id)) usedStopIds.add(r.stop_id); });

  const out = {};
  for (const filename of Object.keys(nossoData)){
    const entry = nossoData[filename];
    let rows = entry.rows;
    if (filename === 'routes.txt') rows = rows.filter(r => usedRouteIds.has(r.route_id));
    else if (filename === 'stops.txt') rows = rows.filter(r => usedStopIds.has(r.stop_id));
    else if (filename === 'calendar.txt' || filename === 'calendar_dates.txt') rows = rows.filter(r => usedServiceIds.has(r.service_id));
    out[filename] = { rows, fields: entry.fields };
  }
  return {
    data: out,
    scoping: {
      stops: { used: (out['stops.txt']||{rows:[]}).rows.length, total: ((nossoData['stops.txt']||{}).rows||[]).length },
      calendar: { used: (out['calendar.txt']||{rows:[]}).rows.length, total: ((nossoData['calendar.txt']||{}).rows||[]).length },
    },
  };
}

export function stripFields(entry, fields){
  if (!entry) return entry;
  const rows = entry.rows.map(r => {
    const copy = { ...r };
    fields.forEach(f => { delete copy[f]; });
    return copy;
  });
  return { rows, fields: (entry.fields || []).filter(f => !fields.includes(f)) };
}

export function buildCrosswalk(nossoData, delesData){
  const routeResult = matchRoutes((nossoData['routes.txt']||{}).rows || [], (delesData['routes.txt']||{}).rows || []);
  const stopResult = matchStops((nossoData['stops.txt']||{}).rows || [], (delesData['stops.txt']||{}).rows || []);
  const calResult = matchCalendar((nossoData['calendar.txt']||{}).rows || [], (delesData['calendar.txt']||{}).rows || []);
  const nossoTimeIdx = buildTripTimeIndex((nossoData['stop_times.txt']||{}).rows || []);
  const delesTimeIdx = buildTripTimeIndex((delesData['stop_times.txt']||{}).rows || []);
  const tripResult = matchTrips(
    (nossoData['trips.txt']||{}).rows || [], (delesData['trips.txt']||{}).rows || [],
    nossoTimeIdx, delesTimeIdx, routeResult.map, calResult.map
  );
  return {
    routeMap: routeResult.map, stopMap: stopResult.map, calMap: calResult.map, tripMap: tripResult.map,
    report: { routes: routeResult, stops: stopResult, calendar: calResult, trips: tripResult, notes: routeResult.notes },
  };
}

// Constrói uma cópia dos dados do operador com os IDs traduzidos para o
// nosso espaço de nomes sempre que há correspondência; o que não tem
// correspondência mantém o ID original do operador (aparecerá como novo).
export function remapDelesData(delesData, crosswalk){
  const remapField = (row, field, map) => {
    if (row[field] !== undefined && map.has(row[field])) return { ...row, [field]: map.get(row[field]) };
    return row;
  };
  const out = {};
  for (const filename of Object.keys(delesData)){
    if (filename === 'shapes.txt') continue; // shape_id não é correspondível de forma fiável
    const entry = delesData[filename];
    let rows = entry.rows;
    if (filename === 'routes.txt'){
      rows = rows.map(r => remapField(r, 'route_id', crosswalk.routeMap));
    } else if (filename === 'stops.txt'){
      rows = rows.map(r => remapField(r, 'stop_id', crosswalk.stopMap));
    } else if (filename === 'calendar.txt' || filename === 'calendar_dates.txt'){
      rows = rows.map(r => remapField(r, 'service_id', crosswalk.calMap));
    } else if (filename === 'trips.txt'){
      rows = rows.map(r => {
        let row = remapField(r, 'route_id', crosswalk.routeMap);
        row = remapField(row, 'service_id', crosswalk.calMap);
        row = remapField(row, 'trip_id', crosswalk.tripMap);
        return row;
      });
    } else if (filename === 'stop_times.txt' || filename === 'frequencies.txt'){
      rows = rows.map(r => {
        let row = remapField(r, 'trip_id', crosswalk.tripMap);
        row = remapField(row, 'stop_id', crosswalk.stopMap);
        return row;
      });
    }
    out[filename] = { rows, fields: entry.fields };
  }
  return out;
}
