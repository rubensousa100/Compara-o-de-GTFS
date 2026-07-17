// render.js — Toda a camada de apresentação: banner do feed, relatório de crosswalk, resumo, abas e listas.

import { FILE_HELP, ENTITY_WORD } from './config.js';
import { esc, fmt, formatGtfsDate, getDisplayInfo, pct, animateCount } from './utils.js';
import { state } from './state.js';

// ---------- Feed period banner ----------

function renderFeedBanner(results){
  const banner = document.getElementById('feedBanner');
  const feedResult = results.find(r => r.filename === 'feed_info.txt');
  const mod = feedResult && feedResult.diff.modified[0];
  if (!mod){ banner.innerHTML = ''; return; }
  const oldRow = mod.old, newRow = mod.new;
  const lines = [];
  if ((oldRow.feed_start_date || '') !== (newRow.feed_start_date || '') || (oldRow.feed_end_date || '') !== (newRow.feed_end_date || '')){
    lines.push(`Per\u00edodo do feed: <b>${esc(formatGtfsDate(oldRow.feed_start_date))} \u2013 ${esc(formatGtfsDate(oldRow.feed_end_date))}</b> &#8594; <b>${esc(formatGtfsDate(newRow.feed_start_date))} \u2013 ${esc(formatGtfsDate(newRow.feed_end_date))}</b>`);
  }
  if ((oldRow.feed_version || '') !== (newRow.feed_version || '')){
    lines.push(`Vers\u00e3o do feed: <b>${esc(oldRow.feed_version || '\u2014')}</b> &#8594; <b>${esc(newRow.feed_version || '\u2014')}</b>`);
  }
  banner.innerHTML = lines.length ? `<div class="feed-banner">${lines.join('<br>')}</div>` : '';
}

export function renderCrosswalkReport(report, scoping){
  const el = document.getElementById('crosswalkReport');
  const rows = [
    { label: 'Linhas', s: report.routes.stats, detail: s => `${fmt(s.viaId)} por ID direto, ${fmt(s.viaFuzzy)} por número/nome` },
    { label: 'Paragens', s: report.stops.stats, detail: s => `${fmt(s.viaId)} por ID direto, ${fmt(s.viaFuzzy)} por nome + geolocalização` },
    { label: 'Calendário', s: report.calendar.stats, detail: s => `${fmt(s.viaId)} por ID direto, ${fmt(s.viaFuzzy)} por padrão de dias` },
    { label: 'Viagens', s: report.trips.stats, detail: s => `${fmt(s.viaId)} por ID direto, ${fmt(s.viaHeuristic)} por horário/paragens` },
  ];
  const rowsHtml = rows.map(({label, s, detail}) => {
    const matched = s.total - s.unresolved;
    const p = pct(matched, s.total);
    return `
      <div class="crosswalk-row">
        <span class="cw-label">${esc(label)}</span>
        <div class="crosswalk-bar"><div class="crosswalk-bar-fill" style="width:${p}%"></div></div>
        <span class="cw-count">${fmt(matched)}/${fmt(s.total)} (${p}%)</span>
      </div>
      <div class="crosswalk-note info" style="margin:-2px 0 4px 140px;">${detail(s)}${s.unresolved ? ` &middot; ${fmt(s.unresolved)} sem correspondência clara — tratadas como novas/removidas` : ''}</div>
    `;
  }).join('');
  const scopingNote = scoping ? `<div class="crosswalk-note info">Nosso GTFS restringido às entidades desta rede: ${fmt(scoping.stops.used)} de ${fmt(scoping.stops.total)} paragens e ${fmt(scoping.calendar.used)} de ${fmt(scoping.calendar.total)} calendários do ficheiro completo (o resto pertence a outras redes/UTs e foi ignorado).</div>` : '';
  const notesHtml = (report.notes || []).map(n => `<div class="crosswalk-note">${n}</div>`).join('')
    + scopingNote
    + `<div class="crosswalk-note info">Traçados (shapes) não comparados — o shape_id é definido pelo operador e não é diretamente correspondível sem análise geométrica.</div>`;
  el.innerHTML = `
    <div class="crosswalk-report">
      <div class="crosswalk-title">Relatório de correspondência (nosso &#8596; operador)</div>
      <p class="crosswalk-legend">O nosso GTFS é sempre a referência; o do operador é o que está a ser validado. Em cada aba: <b>"só no operador"</b> = eles têm, nós não encontrámos correspondência &middot; <b>"só no nosso"</b> = temos, o operador não enviou (ou não correspondeu).</p>
      <div class="crosswalk-rows">${rowsHtml}</div>
      <div class="crosswalk-notes">${notesHtml}</div>
    </div>
  `;
  el.hidden = false;
}

function renderSummary(results){
  const totals = { added: 0, removed: 0, modified: 0, renamed: 0 };
  results.forEach(r => {
    totals.added += r.diff.added.length;
    totals.removed += r.diff.removed.length;
    totals.modified += r.diff.modified.length;
    totals.renamed += (r.diff.renamed || []).length;
  });

  document.getElementById('dashboard').hidden = false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setCount = (id, val) => {
    const el = document.getElementById(id);
    if (reduceMotion) el.textContent = fmt(val);
    else animateCount(el, val);
  };
  setCount('countAdded', totals.added);
  setCount('countRemoved', totals.removed);
  setCount('countModified', totals.modified);
  setCount('countRenamed', totals.renamed);

  const onlyNewFiles = results.filter(r => r.onlyNew).map(r => r.filename);
  const onlyOldFiles = results.filter(r => r.onlyOld).map(r => r.filename);
  let notesHtml = '';
  if (onlyNewFiles.length) notesHtml += `<div class="file-note added">Ficheiros novos: ${onlyNewFiles.map(esc).join(', ')}</div>`;
  if (onlyOldFiles.length) notesHtml += `<div class="file-note removed">Ficheiros removidos: ${onlyOldFiles.map(esc).join(', ')}</div>`;
  document.getElementById('fileNotes').innerHTML = notesHtml;
}

function renderTabs(results){
  const tabsEl = document.getElementById('tabsEl');
  tabsEl.hidden = false;
  tabsEl.innerHTML = '';
  results.forEach(r => {
    const changeCount = r.diff.added.length + r.diff.removed.length + r.diff.modified.length + (r.diff.renamed || []).length;
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.filename = r.filename;
    btn.innerHTML = `${esc(r.label)} <span class="tab-badge ${changeCount ? 'has-changes' : ''}">${fmt(changeCount)}</span>`;
    btn.addEventListener('click', () => selectTab(r.filename));
    tabsEl.appendChild(btn);
  });
}

function renderPaginatedList(container, items, renderItemFn, pageSize){
  pageSize = pageSize || 150;
  container.innerHTML = '';
  if (items.length === 0){
    container.innerHTML = '<div class="empty-note">Sem registos.</div>';
    return;
  }
  const listEl = document.createElement('div');
  listEl.className = 'diff-list';
  container.appendChild(listEl);

  const footer = document.createElement('div');
  footer.className = 'list-footer';
  const countInfo = document.createElement('span');
  countInfo.className = 'count-info';
  const moreBtn = document.createElement('button');
  moreBtn.className = 'btn-more';
  moreBtn.textContent = 'Mostrar mais';
  footer.appendChild(countInfo);
  footer.appendChild(moreBtn);
  container.appendChild(footer);

  let shown = 0;
  function renderMore(){
    const next = items.slice(shown, shown + pageSize);
    const html = next.map(renderItemFn).join('');
    listEl.insertAdjacentHTML('beforeend', html);
    shown += next.length;
    countInfo.textContent = `A mostrar ${fmt(shown)} de ${fmt(items.length)}`;
    moreBtn.style.display = shown < items.length ? '' : 'none';
  }
  moreBtn.addEventListener('click', renderMore);
  renderMore();
}

function getItemRenderer(type, sectionKey){
  if (type === 'aggregate'){
    if (sectionKey === 'modified'){
      return item => `<div class="diff-item"><span class="item-key">${esc(item.key)}</span><span class="item-detail">${fmt(item.oldCount)} &#8594; ${fmt(item.newCount)} registos associados</span></div>`;
    }
    return item => `<div class="diff-item"><span class="item-key">${esc(item.key)}</span><span class="item-detail">${fmt(item.count)} registos associados</span></div>`;
  }
  if (sectionKey === 'renamed'){
    return item => {
      const shown = item.changes.slice(0, 12);
      const changesHtml = shown.map(c => `<span class="change-chip"><b>${esc(c.field)}</b>: <s>${esc(c.old) || '&#8709;'}</s> &#8594; ${esc(c.new) || '&#8709;'}</span>`).join('');
      const extra = item.changes.length > 12 ? `<span class="change-chip more">+${item.changes.length - 12} mais</span>` : '';
      const changesBlock = shown.length ? `<div class="changes">${changesHtml}${extra}</div>` : '<div class="item-detail">Sem outros campos alterados além do ID.</div>';
      return `<div class="diff-item"><span class="item-key">${esc(item.oldKey)}<span class="rename-arrow">&#8594;</span>${esc(item.newKey)}</span>${changesBlock}</div>`;
    };
  }
  if (sectionKey === 'modified'){
    return item => {
      const shown = item.changes.slice(0, 12);
      const changesHtml = shown.map(c => `<span class="change-chip"><b>${esc(c.field)}</b>: <s>${esc(c.old) || '&#8709;'}</s> &#8594; ${esc(c.new) || '&#8709;'}</span>`).join('');
      const extra = item.changes.length > 12 ? `<span class="change-chip more">+${item.changes.length - 12} mais</span>` : '';
      return `<div class="diff-item"><span class="item-key">${esc(item.key)}</span><div class="changes">${changesHtml}${extra}</div></div>`;
    };
  }
  return item => {
    const display = getDisplayInfo(item.row);
    return `<div class="diff-item"><span class="item-key">${esc(item.key)}</span>${display ? `<span class="item-detail">${esc(display)}</span>` : ''}</div>`;
  };
}

// Agrega as alterações de viagens/horários por linha (route_id), para ver
// rapidamente que linhas foram mais afetadas. Usa os dados já carregados
// (state.lastOldData/state.lastNewData) para resolver trip_id -> route_id e o nome.
function buildRouteImpact(filename, result){
  if (!state.lastOldData || !state.lastNewData) return '';
  const tripsOld = (state.lastOldData['trips.txt'] || {}).rows || [];
  const tripsNew = (state.lastNewData['trips.txt'] || {}).rows || [];
  const routeOfTrip = new Map();
  tripsOld.forEach(t => routeOfTrip.set(t.trip_id, t.route_id));
  tripsNew.forEach(t => routeOfTrip.set(t.trip_id, t.route_id));

  const routesRows = [ ...((state.lastOldData['routes.txt']||{}).rows||[]), ...((state.lastNewData['routes.txt']||{}).rows||[]) ];
  const routeName = new Map();
  routesRows.forEach(r => {
    if (!routeName.has(r.route_id)){
      const nm = (r.route_short_name || '').trim() || (r.route_long_name || '').trim() || '';
      routeName.set(r.route_id, nm);
    }
  });

  const perRoute = new Map(); // route_id -> {added, removed, modified}
  const bump = (routeId, kind) => {
    if (routeId === undefined) routeId = '(sem linha)';
    if (!perRoute.has(routeId)) perRoute.set(routeId, { added:0, removed:0, modified:0 });
    perRoute.get(routeId)[kind]++;
  };

  if (filename === 'trips.txt'){
    result.diff.added.forEach(it => bump(it.row.route_id, 'added'));
    result.diff.removed.forEach(it => bump(it.row.route_id, 'removed'));
    result.diff.modified.forEach(it => bump((it.new || it.old || {}).route_id, 'modified'));
    (result.diff.renamed || []).forEach(it => bump((it.newRow || it.oldRow || {}).route_id, 'modified'));
  } else { // stop_times.txt: item.key é o trip_id
    result.diff.added.forEach(it => bump(routeOfTrip.get(it.key), 'added'));
    result.diff.removed.forEach(it => bump(routeOfTrip.get(it.key), 'removed'));
    result.diff.modified.forEach(it => bump(routeOfTrip.get(it.key), 'modified'));
  }

  const rows = [...perRoute.entries()]
    .map(([routeId, c]) => ({ routeId, ...c, total: c.added + c.removed + c.modified }))
    .filter(r => r.total > 0)
    .sort((a,b) => b.total - a.total);

  if (!rows.length) return '';

  const top = rows.slice(0, 12);
  const rowsHtml = top.map(r => {
    const nm = routeName.get(r.routeId) || '';
    const chips = [];
    if (r.added) chips.push(`<span class="impact-chip added">+${fmt(r.added)}</span>`);
    if (r.removed) chips.push(`<span class="impact-chip removed">-${fmt(r.removed)}</span>`);
    if (r.modified) chips.push(`<span class="impact-chip modified">~${fmt(r.modified)}</span>`);
    return `<div class="impact-row" data-route="${esc(r.routeId)}">
      <span class="impact-route">${esc(r.routeId)}</span>
      <span class="impact-name">${esc(nm)}</span>
      <span class="impact-bars">${chips.join('')}</span>
    </div>`;
  }).join('');
  const moreNote = rows.length > 12 ? `<div class="impact-empty">+${fmt(rows.length - 12)} outras linhas com alterações</div>` : '';
  const unit = filename === 'trips.txt' ? 'viagens' : 'horários';

  return `<div class="impact">
    <div class="impact-title">Impacto por linha <span class="hint">&middot; ${unit} afetados &middot; +adicionados / -removidos / ~alterados</span></div>
    <div class="impact-grid">${rowsHtml}</div>
    ${moreNote}
  </div>`;
}

// No modo "Operador externo", "adicionado/removido" é ambíguo (adicionado
// em relação a quê?). Aqui explicitamos sempre a direção: o nosso GTFS é
// sempre a referência, o do operador é o que está a ser validado.
function getSectionLabel(key, filename){
  const word = ENTITY_WORD[filename] || 'registos';
  if (state.comparisonMode === 'externa'){
    if (key === 'added')    return `Só no GTFS do operador — ${word} que faltam no nosso (ou não foi possível corresponder)`;
    if (key === 'removed')  return `Só no nosso GTFS — ${word} que o operador não enviou (ou não foi possível corresponder)`;
    if (key === 'modified') return `Correspondidas, mas com diferenças`;
    if (key === 'renamed')  return `Prováveis correspondências (ID diferente, conteúdo igual)`;
  }
  if (key === 'added')    return 'Adicionados';
  if (key === 'removed')  return 'Removidos';
  if (key === 'modified') return 'Alterados';
  return 'Prováveis correspondências (ID mudou)';
}

function selectTab(filename){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.filename === filename));
  const result = state.results.find(r => r.filename === filename);
  const panel = document.getElementById('panelEl');
  panel.innerHTML = '';

  if (FILE_HELP[filename]){
    panel.insertAdjacentHTML('beforeend', `<div class="tab-desc">${FILE_HELP[filename]}</div>`);
  }

  if (result.onlyOld){
    const msg = state.comparisonMode === 'externa'
      ? 'Este ficheiro só existe no nosso GTFS — o operador não o incluiu.'
      : 'Este ficheiro só existe no GTFS antigo — foi removido no novo feed.';
    panel.insertAdjacentHTML('beforeend', `<div class="file-banner removed">${msg}</div>`);
  } else if (result.onlyNew){
    const msg = state.comparisonMode === 'externa'
      ? 'Este ficheiro só existe no GTFS do operador — não temos equivalente.'
      : 'Este ficheiro é novo — não existia no GTFS antigo.';
    panel.insertAdjacentHTML('beforeend', `<div class="file-banner added">${msg}</div>`);
  }

  if ((result.diff.renamed || []).length){
    const msg = state.comparisonMode === 'externa'
      ? 'Estas viagens não têm o mesmo trip_id, mas parecem ser a mesma viagem física (mesma linha, direção e hora de partida) — normal quando o operador usa a sua própria numeração. Correspondência automática por heurística: confirma sempre antes de assumir.'
      : 'Estas viagens têm um ID totalmente diferente, mas parecem ser a mesma viagem física (mesma linha, direção, destino e hora de partida) — provavelmente só o código de calendário mudou. Correspondência automática por heurística: confirma sempre antes de assumir.';
    panel.insertAdjacentHTML('beforeend', `<div class="file-banner renamed-banner">${msg}</div>`);
  }

  if (filename === 'trips.txt' || filename === 'stop_times.txt'){
    const impactHtml = buildRouteImpact(filename, result);
    if (impactHtml) panel.insertAdjacentHTML('beforeend', impactHtml);
  }

  const sections = [
    { key: 'renamed',  label: getSectionLabel('renamed', filename),  cls: 'renamed',  items: result.diff.renamed || [] },
    { key: 'added',    label: getSectionLabel('added', filename),    cls: 'added',    items: result.diff.added },
    { key: 'removed',  label: getSectionLabel('removed', filename),  cls: 'removed',  items: result.diff.removed },
    { key: 'modified', label: getSectionLabel('modified', filename), cls: 'modified', items: result.diff.modified },
  ];

  let anyShown = false;
  sections.forEach(sec => {
    if (sec.items.length === 0) return;
    anyShown = true;
    const secEl = document.createElement('div');
    secEl.className = `diff-section ${sec.cls}`;
    secEl.innerHTML = `
      <div class="section-header">
        <span class="section-title">${sec.label}</span>
        <span class="section-count">${fmt(sec.items.length)}</span>
        <input type="text" class="search-box" placeholder="Filtrar por ID...">
      </div>
      <div class="list-container"></div>
    `;
    panel.appendChild(secEl);
    const listContainer = secEl.querySelector('.list-container');
    const searchBox = secEl.querySelector('.search-box');
    const renderFn = getItemRenderer(result.type, sec.key);

    renderPaginatedList(listContainer, sec.items, renderFn);

    let debounceTimer;
    searchBox.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = searchBox.value.trim().toLowerCase();
        const filtered = q ? sec.items.filter(it => String(it.key).toLowerCase().includes(q)) : sec.items;
        renderPaginatedList(listContainer, filtered, renderFn);
      }, 150);
    });
  });

  if (result.diff.unchanged){
    panel.insertAdjacentHTML('beforeend', `<div class="unchanged-note">${fmt(result.diff.unchanged)} registos sem alterações.</div>`);
    anyShown = true;
  }
  if (!anyShown){
    panel.insertAdjacentHTML('beforeend', '<div class="empty-note">Sem dados para comparar neste ficheiro.</div>');
  }
}

export function renderResults(results){
  state.results = results;
  renderFeedBanner(results);
  renderSummary(results);
  renderTabs(results);
  if (results.length) selectTab(results[0].filename);
}
