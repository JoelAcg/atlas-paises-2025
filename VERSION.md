# Versiones del Atlas

Cada cambio publicado en GitHub **sube** el número en `assets/version.js`.

| Versión | Fecha | Notas |
|---------|-------|--------|
| **6.3.0** | 2026-07-15 | Badge "Versión" en todas las páginas + sistema de versionado |
| 6.2.x | 2026-07-15 | Fix modal guerra (is-open, cache-bust) |
| 6.1.x | 2026-07-15 | Comparar, heatmap, favoritos, quiz |
| 6.0.x | 2026-07-15 | SPA, lazy GeoJSON, combinar ligero |
| 5.x | — | Mapas con terreno |
| 4.x | — | Regiones admin |

## Cómo subir de versión (para el dev / Grok)

1. Edita `assets/version.js`:
   - `ATLAS_VERSION = "6.3.1"` (ejemplo)
   - `ATLAS_VERSION_DATE`
   - `ATLAS_VERSION_LABEL` (qué cambió)
2. Ejecuta: `node _inject_version.js` (actualiza badges y `?v=` en HTML)
3. Commit + push a GitHub
4. En la web debe verse **Versión: 6.3.1** (Ctrl+F5 si no)

### Semver simple

- **6.3.0 → 6.3.1** bugfix  
- **6.3.1 → 6.4.0** feature nueva  
- **6.4.0 → 7.0.0** cambio grande  
