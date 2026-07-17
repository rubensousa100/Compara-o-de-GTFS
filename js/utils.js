// utils.js — Funções utilitárias puras (formatação, normalização, geometria) e helpers de estado visual.

import { DISPLAY_HINT_FIELDS } from './config.js';

export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function fmt(n){ return Number(n).toLocaleString('pt-PT'); }

export function updateStatus(msg){
  document.getElementById('statusEl').textContent = msg;
}

export function getDisplayInfo(row){
  for (const f of DISPLAY_HINT_FIELDS){
    if (row && row[f]) return row[f];
  }
  return '';
}

export function formatGtfsDate(d){
  if (!d || d.length !== 8) return d || '\u2014';
  return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
}

export function normalizeName(s){
  return (s || '')
    .toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractRouteNumber(shortName){
  const m = (shortName || '').match(/^\s*(\d+)\s*\|/);
  return m ? m[1] : normalizeName(shortName);
}

export function haversineMeters(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
  const dphi = (lat2-lat1) * Math.PI/180, dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dphi/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

export function toSeconds(hms){
  if (!hms) return null;
  const parts = hms.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts[0]*3600 + parts[1]*60 + parts[2];
}

export function pct(a, b){ return b ? Math.round((a/b)*100) : 0; }

export function animateCount(el, target, duration){
  duration = duration || 600;
  const startTime = performance.now();
  function step(now){
    const progress = Math.min((now - startTime) / duration, 1);
    el.textContent = fmt(Math.floor(progress * target));
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = fmt(target);
  }
  requestAnimationFrame(step);
}
