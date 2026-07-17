// state.js — Estado partilhado da aplicação (única fonte de verdade, mutada apenas via este objeto).

export const state = {
  comparisonMode: 'interna',   // 'interna' | 'externa'
  oldFile: null,               // File do GTFS antigo / nosso
  newFile: null,               // File do GTFS novo / do operador
  results: [],                 // resultados de computeAllDiffs (por ficheiro GTFS)
  lastOldData: null,           // dados usados na última comparação (para impacto por linha e Excel)
  lastNewData: null,
};
