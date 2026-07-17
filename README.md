# Comparador de GTFS

Ferramenta 100% client-side para comparar dois feeds GTFS (.zip). Nenhum dado sai do navegador. Suporta dois modos:

- **Interna** — compara dois GTFS nossos (mesmas normas de IDs), com correspondência exata por `route_id`, `stop_id`, `trip_id` e `service_id` e deteção heurística de viagens renomeadas.
- **Operador externo** — compara o nosso GTFS (referência) com o feed submetido por um operador com convenções de IDs diferentes, através de um motor de crosswalk (número/nome de linha, nome + geolocalização de paragens ≤150 m, padrão semanal de calendário, chave composta de viagem).

## Estrutura do projeto

```
.
├── index.html          # Estrutura da página (só HTML)
├── css/
│   └── styles.css      # Todos os estilos
├── js/
│   ├── main.js         # Ponto de entrada: liga o DOM aos módulos e orquestra a comparação
│   ├── config.js       # Configuração de domínio: ficheiros GTFS, chaves, rótulos, parâmetros de afinação
│   ├── state.js        # Estado partilhado da aplicação (modo, ficheiros, resultados)
│   ├── utils.js        # Utilitários puros: formatação, normalização, haversine, etc.
│   ├── parser.js       # Leitura do .zip e parsing dos .txt (JSZip + PapaParse)
│   ├── crosswalk.js    # Correspondência cross-operador (modo externo) e scoping da rede
│   ├── diff.js         # Motor de comparação: diffs por entidade, assinaturas agregadas, viagens renomeadas
│   ├── render.js       # Camada de apresentação: resumo, abas, listas paginadas, impacto por linha
│   └── export.js       # Exportação de relatórios: Excel (SheetJS) e JSON
└── package.json        # Metadados; "type": "module"
```

### Fluxo de dependências

`main.js` importa tudo o resto; os módulos de lógica (`parser`, `crosswalk`, `diff`) não conhecem o DOM (exceto o `updateStatus` de progresso); `render.js` e `export.js` leem o estado partilhado em `state.js`. `config.js` e `utils.js` não dependem de mais nada.

## Desenvolvimento local

O JavaScript usa **ES modules** (`<script type="module">`), que o navegador só carrega via HTTP — abrir o `index.html` diretamente com duplo clique (`file://`) **não funciona**. Para testar localmente, serve a pasta com qualquer servidor estático:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

(ou a extensão "Live Server" do VS Code). No **GitHub Pages funciona sem qualquer alteração**, porque já é servido por HTTP.

## Dependências

Carregadas por CDN no `index.html` (sem build step):

- [JSZip](https://stuk.github.io/jszip/) 3.10.1 — leitura dos .zip
- [PapaParse](https://www.papaparse.com/) 5.4.1 — parsing dos CSV/.txt
- [SheetJS](https://sheetjs.com/) 0.18.5 — exportação Excel
