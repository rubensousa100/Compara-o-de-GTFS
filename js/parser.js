// parser.js — Leitura e parsing de um GTFS (.zip) para memória, ficheiro a ficheiro.
/* global JSZip, Papa */

import { updateStatus } from './utils.js';

export async function parseGTFSZip(file, label){
  const zip = await JSZip.loadAsync(file);
  const data = {};
  const entries = Object.keys(zip.files).filter(n => !zip.files[n].dir && n.toLowerCase().endsWith('.txt'));
  for (const name of entries){
    const base = name.split('/').pop();
    updateStatus(`A ler ${label}: ${base}...`);
    const text = await zip.files[name].async('string');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    data[base] = { rows: parsed.data, fields: parsed.meta.fields || [] };
    // yield to the browser so the status text can repaint
    await new Promise(r => setTimeout(r, 0));
  }
  return data;
}
