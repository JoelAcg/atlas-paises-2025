# Mapas HTML Atlas **v6.1**

Arquitectura ligera: meta en JSON + GeoJSON bajo demanda + SPA.

**Subir a GitHub / Pages:** ver **[GITHUB.md](GITHUB.md)**

## Abrir (importante)

Los mapas v6 usan `fetch()` de JSON. **No abras con doble clic** (`file://`): el navegador bloquea la carga.

**Opción A — un clic:**
```
Mapas_HTML_2025\serve-atlas.bat
```
Luego: http://127.0.0.1:5500/index.html

**Opción B — terminal:**
```bash
cd Mapas_HTML_2025
npx --yes serve -l 5500 .
```

| Página | Uso |
|--------|-----|
| **`index.html`** | Índice con filtros, paginación, tours, tema oscuro |
| **`atlas.html?pais=Spain`** | Ficha + mapa de un país (SPA) |
| **`combinar.html`** | Multi-selección lazy (alianza / guerra / simulador) |
| **`quiz.html`** | Cuestionario capitales/banderas/datos |
| **`comparar.html`** | Vista partida A vs B + duelos por indicador |

`paises/*.html` redirigen a `atlas.html?pais=…` (enlaces antiguos siguen funcionando).

### v6.1 extras
- Heatmap por métrica en combinar (población, PIB, poder…)
- Cluster de ciudades (Leaflet.markercluster)
- Comparativa lateral de 2 países
- Favoritos + resumen Wikipedia (si hay red)
- Share Twitter / copiar enlace
- `assets/borders_lite/` (contornos simplificados; opcional)

## Regenerar datos

Desde `Documentos/Paises`:

```bash
node _build_atlas_v6.js
```

Genera:

- `data/index.json` — lista de 162 países (ligera)
- `data/countries/{Key}.json` — meta + ciudades (sin polígonos)
- `assets/combo_index.json` — índice del combinador (~sin GeoJSON)
- shells en `paises/*.html`

Los polígonos siguen en:

- `assets/borders/{iso}.json`
- `assets/admin1/{iso}.json`

## Qué mejora v6

1. **Rendimiento** — no embebe miles de coords en cada HTML; `fetch` + `localStorage` cache  
2. **Combinador** — solo carga contornos de países seleccionados (no monstruo 5+ MB al inicio)  
3. **Tema oscuro** + i18n ES/EN  
4. **Charts** (Chart.js) en combinador  
5. **Guerra** con poder militar proxy + **simulador por turnos**  
6. **Export PNG** (html2canvas) y **compartir URL**  
7. **Quiz** educativo  
8. **Accesibilidad** — focus, aria, skip link, teclado  

## Notas

- Indicadores militares/socio en ficha son **proxies educativos** (derivados de PIB/población/IDH), no datos oficiales de defensa.
- Capas satélite/relieve necesitan internet (CDN Leaflet + tiles).
- `assets/combo_data.js` antiguo puede seguir existiendo; **combinar.html v6 ya no lo usa**.

## Legacy

Scripts anteriores: `_build_html_maps.js`, `_upgrade_maps_v3.js`, `_build_combinar.js`, `_build_admin_regions.js`.  
No hace falta regenerar HTML gordos: v6 usa packs JSON + SPA.
