// main.js — Ponto de entrada: liga o DOM aos módulos (modos, inputs de ficheiro, comparação, exportações).

import { state } from './state.js';
import { updateStatus } from './utils.js';
import { parseGTFSZip } from './parser.js';
import { scopeNossoToUsage, stripFields, buildCrosswalk, remapDelesData } from './crosswalk.js';
import { computeAllDiffs } from './diff.js';
import { renderResults, renderCrosswalkReport } from './render.js';
import { buildExcelReport, buildJsonReport } from './export.js';

// ---------- Modo de comparação ----------

function updateModeUI(){
  document.getElementById('modeInternaBtn').classList.toggle('active', state.comparisonMode === 'interna');
  document.getElementById('modeExternaBtn').classList.toggle('active', state.comparisonMode === 'externa');
  if (state.comparisonMode === 'interna'){
    document.getElementById('oldTag').textContent = 'GTFS antigo (ex: Junho)';
    document.getElementById('newTag').textContent = 'GTFS novo (ex: Julho)';
    document.getElementById('modeHint').textContent = 'Compara dois GTFS nossos, assumindo as mesmas normas — correspondência exata por route_id, stop_id, trip_id e service_id.';
  } else {
    document.getElementById('oldTag').textContent = 'O nosso GTFS (referência)';
    document.getElementById('newTag').textContent = 'GTFS do operador';
    document.getElementById('modeHint').textContent = 'Compara o nosso GTFS com o que o operador envia, mesmo que não sigam as mesmas normas de IDs — corresponde linhas, paragens, viagens e calendário pelo conteúdo (número, nome, geolocalização, horário) em vez do ID.';
  }
  document.getElementById('crosswalkReport').hidden = true;
}

document.getElementById('modeInternaBtn').addEventListener('click', () => { state.comparisonMode = 'interna'; updateModeUI(); });
document.getElementById('modeExternaBtn').addEventListener('click', () => { state.comparisonMode = 'externa'; updateModeUI(); });

// ---------- Inputs de ficheiro (escolha + drag & drop) ----------

function setupFileInput(inputId, labelId, cardId, isOld){
  const input = document.getElementById(inputId);
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (isOld) state.oldFile = file; else state.newFile = file;
    document.getElementById(labelId).textContent = `${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
    document.getElementById(cardId).classList.add('has-file');
    document.getElementById('compareBtn').disabled = !(state.oldFile && state.newFile);
  });

  const card = document.getElementById(cardId);
  ['dragover','dragenter'].forEach(evt => card.addEventListener(evt, e => { e.preventDefault(); card.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(evt => card.addEventListener(evt, e => { e.preventDefault(); card.classList.remove('drag-over'); }));
  card.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files.length){
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

setupFileInput('oldFileInput', 'oldFileLabel', 'oldCard', true);
setupFileInput('newFileInput', 'newFileLabel', 'newCard', false);

// ---------- Comparação ----------

document.getElementById('compareBtn').addEventListener('click', async () => {
  const btn = document.getElementById('compareBtn');
  btn.disabled = true;
  document.getElementById('crosswalkReport').hidden = true;
  try {
    updateStatus(state.comparisonMode === 'interna' ? 'A carregar GTFS antigo...' : 'A carregar o nosso GTFS...');
    const oldData = await parseGTFSZip(state.oldFile, 'GTFS antigo');
    updateStatus(state.comparisonMode === 'interna' ? 'A carregar GTFS novo...' : 'A carregar GTFS do operador...');
    const newData = await parseGTFSZip(state.newFile, 'GTFS novo');

    let diffOld = oldData, diffNew = newData;
    if (state.comparisonMode === 'externa'){
      updateStatus('A restringir o nosso GTFS às entidades desta rede...');
      await new Promise(r => setTimeout(r, 0));
      const scoped = scopeNossoToUsage(oldData);
      updateStatus('A corresponder linhas, paragens, viagens e calendário...');
      await new Promise(r => setTimeout(r, 0));
      const crosswalk = buildCrosswalk(scoped.data, newData);
      renderCrosswalkReport(crosswalk.report, scoped.scoping);
      diffNew = remapDelesData(newData, crosswalk);
      diffOld = {};
      for (const k of Object.keys(scoped.data)) if (k !== 'shapes.txt') diffOld[k] = scoped.data[k];

      // shape_id e trip_short_name são convenções próprias de cada operador
      // (tal como o trip_id) — comparar diretamente só geraria ruído.
      const NOISY_TRIP_FIELDS = ['shape_id', 'trip_short_name'];
      diffOld['trips.txt'] = stripFields(diffOld['trips.txt'], NOISY_TRIP_FIELDS);
      diffNew['trips.txt'] = stripFields(diffNew['trips.txt'], NOISY_TRIP_FIELDS);
    }

    updateStatus('A calcular diferenças...');
    await new Promise(r => setTimeout(r, 0));
    const results = computeAllDiffs(diffOld, diffNew);
    renderResults(results);
    state.lastOldData = diffOld;
    state.lastNewData = diffNew;
    updateStatus('Comparação concluída.');
  } catch (err){
    console.error(err);
    updateStatus('Erro ao processar os ficheiros: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('resetBtn').addEventListener('click', () => location.reload());

// ---------- Exportações ----------

document.getElementById('exportExcelBtn').addEventListener('click', () => {
  if (!state.lastOldData || !state.lastNewData) return;
  buildExcelReport(state.lastOldData, state.lastNewData, state.results);
});

document.getElementById('exportBtn').addEventListener('click', () => {
  buildJsonReport(state.results);
});
