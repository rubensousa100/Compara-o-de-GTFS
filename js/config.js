// config.js — Configuração de domínio GTFS: ficheiros, chaves, rótulos e parâmetros de afinação.

export const FILE_CONFIGS = {
  'agency.txt':         { label: 'Agências',               key: r => r.agency_id || 'default' },
  'routes.txt':         { label: 'Linhas',                  key: r => r.route_id },
  'stops.txt':          { label: 'Paragens',                key: r => r.stop_id },
  'trips.txt':          { label: 'Viagens',                 key: r => r.trip_id },
  'calendar.txt':       { label: 'Calendário',              key: r => r.service_id },
  'calendar_dates.txt': { label: 'Exceções de calendário',  key: r => (r.service_id||'') + '|' + (r.date||'') },
  'frequencies.txt':    { label: 'Frequências',             key: r => (r.trip_id||'') + '|' + (r.start_time||'') },
  'fare_attributes.txt':{ label: 'Atributos de tarifa',     key: r => r.fare_id },
  'fare_rules.txt':     { label: 'Regras de tarifa',        key: r => JSON.stringify(r) },
  'transfers.txt':      { label: 'Transbordos',             key: r => (r.from_stop_id||'') + '|' + (r.to_stop_id||'') + '|' + (r.from_route_id||'') + '|' + (r.to_route_id||'') },
  'feed_info.txt':      { label: 'Informação do feed',      key: () => 'feed' },
  'levels.txt':         { label: 'Níveis',                  key: r => r.level_id },
  'pathways.txt':       { label: 'Percursos (pathways)',    key: r => r.pathway_id },
  'attributions.txt':   { label: 'Atribuições',             key: r => JSON.stringify(r) },
};

export const AGGREGATE_CONFIGS = {
  'stop_times.txt': { label: 'Horários (stop_times)', parentKey: 'trip_id',  seqField: 'stop_sequence',      sigFields: ['stop_id','arrival_time','departure_time','pickup_type','drop_off_type'] },
  'shapes.txt':     { label: 'Traçados (shapes)',     parentKey: 'shape_id', seqField: 'shape_pt_sequence',  sigFields: ['shape_pt_lat','shape_pt_lon'] },
};

export const PRIORITY_ORDER = ['routes.txt','trips.txt','stops.txt','calendar.txt','calendar_dates.txt','stop_times.txt','shapes.txt','frequencies.txt','agency.txt','fare_attributes.txt','fare_rules.txt','transfers.txt','feed_info.txt'];

// Descrições curtas (público técnico): o que cada aba cobre e, quando útil,
// como se distingue de outra aba com que se possa confundir.
export const FILE_HELP = {
  'routes.txt': 'Linhas (route_id). Aparece aqui o que muda ao nível da linha: nome, cor, tipo, agência.',
  'stops.txt': 'Paragens (stop_id): nome, coordenadas, tipo. Uma paragem só é "alterada" se algum destes campos mudar.',
  'trips.txt': 'Viagens (trip_id) e a que route_id/service_id/direção estão atribuídas. Mostra viagens novas, removidas ou reatribuídas — não os dias em que circulam.',
  'calendar.txt': 'Padrão semanal de cada service_id e período de validade. Muda aqui se os dias-tipo ou as datas de início/fim mudarem.',
  'calendar_dates.txt': 'Exceções pontuais ao calendário (feriados, reforços). Uma viagem pode manter tudo igual em trips.txt e mesmo assim deixar de circular num dia por causa de uma exceção nova aqui.',
  'stop_times.txt': 'Horário de cada viagem: sequência de paragens e horas. Comparado por assinatura agregada por viagem — "alterada" significa que a sequência ou as horas mudaram.',
  'shapes.txt': 'Traçados geográficos (shape_id). Comparado por assinatura de pontos.',
  'frequencies.txt': 'Viagens definidas por frequência (headway) em vez de horas fixas.',
  'transfers.txt': 'Regras de transbordo entre paragens/linhas.',
  'feed_info.txt': 'Metadados do feed: editor, período de validade, versão.',
  'agency.txt': 'Operadores (agency_id): nome, URL, fuso, contactos.',
  'fare_attributes.txt': 'Preços e regras base de tarifas.',
  'fare_rules.txt': 'Associação de tarifas a linhas/zonas.',
  'pathways.txt': 'Percursos pedonais dentro de estações.',
  'levels.txt': 'Níveis/pisos de estações.',
  'attributions.txt': 'Créditos e atribuições do feed.',
};

export const DISPLAY_HINT_FIELDS = ['route_short_name','route_long_name','stop_name','trip_headsign','agency_name','fare_id','service_id'];

export const WEEKDAY_FIELDS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

// Parâmetros de afinação da correspondência aproximada (modo externo).
export const STOP_MATCH_MAX_DIST_M = 150;
export const TRIP_MATCH_SCORE_MAX = 600;

// Campos onde diferenças puramente de formatação (zeros à direita, ou
// '' vs '0' quando ambos significam o valor por omissão do GTFS) não devem
// contar como alterações reais.
export const NUMERIC_FIELDS = new Set(['stop_lat','stop_lon','shape_pt_lat','shape_pt_lon','shape_dist_traveled','route_sort_order']);
export const DEFAULT_ZERO_FIELDS = new Set(['location_type','wheelchair_boarding','wheelchair_accessible','bikes_allowed','pickup_type','drop_off_type','timepoint','continuous_pickup','continuous_drop_off']);

// Palavra de entidade para compor rótulos legíveis por ficheiro.
export const ENTITY_WORD = {
  'routes.txt': 'linhas', 'stops.txt': 'paragens', 'trips.txt': 'viagens',
  'calendar.txt': 'calendários', 'calendar_dates.txt': 'exceções',
  'stop_times.txt': 'viagens', 'shapes.txt': 'traçados', 'agency.txt': 'agências',
  'frequencies.txt': 'frequências', 'transfers.txt': 'transbordos', 'feed_info.txt': 'registos',
};
