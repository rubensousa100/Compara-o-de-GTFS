// export.js — Exportação de relatórios: Excel (folhas focadas) e JSON.
/* global XLSX */

import { WEEKDAY_FIELDS } from './config.js';
import { formatGtfsDate } from './utils.js';
import { buildFirstDeparture } from './diff.js';
import { state } from './state.js';

// ---------- Excel export (focado nas categorias mais relevantes) ----------

export function buildExcelReport(oldData, newData, results){
  const wb = XLSX.utils.book_new();
  const isExterna = state.comparisonMode === 'externa';
  // No modo externo, "removido/adicionado" é ambíguo — explicitamos a
  // direção (nosso GTFS = referência, operador = o que está a ser validado).
  const LBL = {
    linhasRemovidas:      isExterna ? 'Linhas só no nosso GTFS'        : 'Linhas removidas',
    paragensAdicionadas:  isExterna ? 'Paragens só no operador'        : 'Paragens adicionadas',
    paragensRemovidas:    isExterna ? 'Paragens só no nosso GTFS'      : 'Paragens removidas',
    viagensAdicionadas:   isExterna ? 'Viagens só no operador'         : 'Viagens adicionadas',
    viagensRemovidas:     isExterna ? 'Viagens só no nosso GTFS'       : 'Viagens removidas',
  };

  // Resumo — números-chave de um relance, para confirmar rapidamente o que mudou
  const byFile = name => results.find(r => r.filename === name);
  const routesResult0 = byFile('routes.txt');
  const stopsResult0 = byFile('stops.txt');
  const tripsResult0 = byFile('trips.txt');
  const stResult0 = byFile('stop_times.txt');
  const calResult0 = byFile('calendar.txt');
  const calDatesResult0 = byFile('calendar_dates.txt');
  const n = (r, key) => r ? (key === 'renamed' ? (r.diff.renamed || []).length : r.diff[key].length) : 0;
  const summaryRows = [
    { categoria: LBL.linhasRemovidas, quantidade: n(routesResult0, 'removed') },
    { categoria: 'Linhas correspondidas mas com diferenças', quantidade: n(routesResult0, 'modified') },
    { categoria: LBL.paragensAdicionadas, quantidade: n(stopsResult0, 'added') },
    { categoria: LBL.paragensRemovidas, quantidade: n(stopsResult0, 'removed') },
    { categoria: LBL.viagensAdicionadas, quantidade: n(tripsResult0, 'added') },
    { categoria: LBL.viagensRemovidas, quantidade: n(tripsResult0, 'removed') },
    { categoria: 'Viagens - prováveis correspondências (só ID mudou)', quantidade: n(tripsResult0, 'renamed') },
    { categoria: 'Viagens com horário alterado', quantidade: n(stResult0, 'modified') },
    { categoria: 'Serviços de calendário novos', quantidade: n(calResult0, 'added') },
    { categoria: 'Serviços de calendário removidos', quantidade: n(calResult0, 'removed') },
    { categoria: 'Exceções de calendário novas (total)', quantidade: n(calDatesResult0, 'added') },
    { categoria: 'Exceções de calendário removidas (total)', quantidade: n(calDatesResult0, 'removed') },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumo');

  // Linhas removidas
  const routesResult = results.find(r => r.filename === 'routes.txt');
  if (routesResult && routesResult.diff.removed.length){
    const rows = routesResult.diff.removed.map(it => ({
      route_id: it.key,
      nome_curto: it.row.route_short_name || '',
      nome_longo: it.row.route_long_name || '',
      agencia: it.row.agency_id || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), LBL.linhasRemovidas.slice(0, 31));
  }

  // Horários alterados (viagens cujos stop_times mudaram)
  const stResult = results.find(r => r.filename === 'stop_times.txt');
  if (stResult && stResult.diff.modified.length){
    const oldTripsById = new Map(((oldData['trips.txt']||{}).rows || []).map(r => [r.trip_id, r]));
    const newTripsById = new Map(((newData['trips.txt']||{}).rows || []).map(r => [r.trip_id, r]));
    const oldFirstDep = buildFirstDeparture((oldData['stop_times.txt']||{}).rows || []);
    const newFirstDep = buildFirstDeparture((newData['stop_times.txt']||{}).rows || []);
    const rows = stResult.diff.modified.map(it => {
      const tripRow = newTripsById.get(it.key) || oldTripsById.get(it.key) || {};
      return {
        trip_id: it.key,
        linha: tripRow.route_id || '',
        destino: tripRow.trip_headsign || '',
        direcao: tripRow.direction_id || '',
        partida_antiga: oldFirstDep.get(it.key) || '',
        partida_nova: newFirstDep.get(it.key) || '',
        paragens_antigo: it.oldCount,
        paragens_novo: it.newCount,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Horários alterados');
  }

  // Paragens só num dos lados
  const stopsResult = results.find(r => r.filename === 'stops.txt');
  if (stopsResult){
    if (stopsResult.diff.added.length){
      const rows = stopsResult.diff.added.map(it => ({
        stop_id: it.key, nome: it.row.stop_name || '', lat: it.row.stop_lat || '', lon: it.row.stop_lon || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), LBL.paragensAdicionadas.slice(0, 31));
    }
    if (stopsResult.diff.removed.length){
      const rows = stopsResult.diff.removed.map(it => ({
        stop_id: it.key, nome: it.row.stop_name || '', lat: it.row.stop_lat || '', lon: it.row.stop_lon || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), LBL.paragensRemovidas.slice(0, 31));
    }
  }

  // Calendário: novidades — resumido por service_id (evita milhares de linhas
  // quando um feed introduz muitos padrões novos, cada um com muitas exceções)
  const calResult = results.find(r => r.filename === 'calendar.txt');
  const calDatesResult = results.find(r => r.filename === 'calendar_dates.txt');
  const diasDe = row => WEEKDAY_FIELDS.filter(f => row[f] === '1').map(f => f.slice(0,3)).join('/');
  const calEntry = new Map();
  const ensureEntry = sid => {
    if (!calEntry.has(sid)) calEntry.set(sid, { service_id: sid, estado: '(sem alteração ao padrão semanal)', dias: '', periodo: '', excecoes_novas: 0, excecoes_removidas: 0 });
    return calEntry.get(sid);
  };
  if (calResult){
    calResult.diff.added.forEach(it => {
      const e = ensureEntry(it.key);
      e.estado = 'Serviço novo'; e.dias = diasDe(it.row);
      e.periodo = `${formatGtfsDate(it.row.start_date)} - ${formatGtfsDate(it.row.end_date)}`;
    });
    calResult.diff.removed.forEach(it => {
      const e = ensureEntry(it.key);
      e.estado = 'Serviço removido'; e.dias = diasDe(it.row);
      e.periodo = `${formatGtfsDate(it.row.start_date)} - ${formatGtfsDate(it.row.end_date)}`;
    });
  }
  if (calDatesResult){
    calDatesResult.diff.added.forEach(it => { ensureEntry(it.row.service_id).excecoes_novas++; });
    calDatesResult.diff.removed.forEach(it => { ensureEntry(it.row.service_id).excecoes_removidas++; });
  }
  const calRows = [...calEntry.values()].sort((a, b) =>
    (b.excecoes_novas + b.excecoes_removidas) - (a.excecoes_novas + a.excecoes_removidas)
  );
  if (calRows.length){
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calRows), 'Calendário - novidades');
  }

  if (wb.SheetNames.length === 0){
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ info: 'Sem alterações nas categorias exportadas.' }]), 'Resumo');
  }

  XLSX.writeFile(wb, 'relatorio-gtfs.xlsx');
}

// Relatório completo em JSON (todas as categorias, com IDs e detalhe de alterações).
export function buildJsonReport(results){
  const report = results.map(r => ({
    ficheiro: r.filename,
    apenas_no_antigo: r.onlyOld,
    apenas_no_novo: r.onlyNew,
    adicionados: r.diff.added.length,
    removidos: r.diff.removed.length,
    alterados: r.diff.modified.length,
    provaveis_correspondencias: (r.diff.renamed || []).length,
    inalterados: r.diff.unchanged,
    ids_adicionados: r.diff.added.map(i => i.key),
    ids_removidos: r.diff.removed.map(i => i.key),
    alteracoes: r.diff.modified.map(i => ({
      id: i.key,
      detalhe: i.changes ? i.changes.map(c => ({ campo: c.field, antes: c.old, depois: c.new })) : `${i.oldCount} -> ${i.newCount} registos`,
    })),
    correspondencias_provaveis: (r.diff.renamed || []).map(i => ({
      id_antigo: i.oldKey,
      id_novo: i.newKey,
      detalhe: i.changes.map(c => ({ campo: c.field, antes: c.old, depois: c.new })),
    })),
  }));
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'relatorio-diferencas-gtfs.json';
  a.click();
  URL.revokeObjectURL(url);
}
