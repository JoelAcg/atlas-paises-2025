/* Mapas v6 — regiones + ciudades + terreno + carga async de GeoJSON */
window.PaisesMap = {
  async init(cfg) {
    const ocean = cfg.ocean || "#7eb8dc";
    const map = L.map("map", {
      scrollWheelZoom: true,
      worldCopyJump: false,
      zoomControl: true,
      minZoom: 2,
      maxZoom: 18,
      maxBoundsViscosity: 1.0,
    });

    const regionLayer = L.layerGroup().addTo(map);
    const cityLayer = L.layerGroup().addTo(map);
    const markers = {};
    let regionFill = 0.82;
    let borderWeight = 1.2;
    let regionGeoLayer = null;
    let borderGeoLayer = null;
    let heatMetric = null;

    const escapeHtml =
      (window.AtlasCore && AtlasCore.escapeHtml) ||
      function (s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      };

    function cityIcon(p) {
      const kind = p.capital ? "capital" : p.region ? "region" : "normal";
      const nameClass = p.capital ? "capital" : p.region ? "region" : "";
      const showName = p.showName !== false;
      const pulse = p.capital ? " pulse" : "";
      const html =
        '<div class="city-label-wrap">' +
        '<div class="city-dot ' +
        kind +
        pulse +
        '"></div>' +
        (showName
          ? '<div class="city-name ' +
            nameClass +
            '">' +
            escapeHtml(p.displayName || p.name) +
            "</div>"
          : "") +
        "</div>";
      return L.divIcon({
        className: "marker-root",
        html,
        iconSize: [0, 0],
        iconAnchor: [6, 6],
      });
    }

    function applyCountryLock(bounds) {
      if (!bounds || !bounds.isValid()) return;
      map.setMaxBounds(bounds.pad(0.12));
      const ideal = map.getBoundsZoom(bounds, false);
      map.setMinZoom(Math.max(2, ideal - 0.5));
      map.fitBounds(bounds, { padding: [32, 32], animate: false, maxZoom: 9 });
    }

    function restyleRegions() {
      if (regionGeoLayer) {
        regionGeoLayer.setStyle(function (feat) {
          return styleFeat(feat);
        });
      }
      if (borderGeoLayer) {
        borderGeoLayer.setStyle({
          color: "#1a2332",
          weight: borderWeight + 0.4,
          fillColor: cfg.fillColor || "#8fd19e",
          fillOpacity: regionFill,
        });
      }
    }

    function styleFeat(feat) {
      const p = feat.properties || {};
      let fill = p.color || cfg.fillColor || "#8fd19e";
      if (heatMetric && p._heatColor) fill = p._heatColor;
      return {
        color: "#1a2332",
        weight: borderWeight,
        opacity: 0.9,
        fillColor: fill,
        fillOpacity: regionFill,
        className: "region-poly",
      };
    }

    // Terrain panel
    let terrainMount = document.getElementById("terrainPanel");
    if (!terrainMount) {
      const shell =
        document.querySelector(".map-shell") ||
        document.getElementById("map")?.parentElement;
      terrainMount = document.createElement("div");
      terrainMount.id = "terrainPanel";
      if (shell) shell.appendChild(terrainMount);
      else document.body.appendChild(terrainMount);
    }

    let terrainApi = null;
    if (window.TerrainLayers) {
      terrainApi = window.TerrainLayers.attach(map, {
        mount: terrainMount,
        defaultId: cfg.defaultTerrain || "satellite",
        onStyleChange: function (st) {
          regionFill = st.regionFill;
          borderWeight = st.borderWeight;
          restyleRegions();
        },
      });
      regionLayer.bringToFront();
      cityLayer.bringToFront();
    } else {
      L.rectangle(
        [
          [-85, -180],
          [85, 180],
        ],
        {
          stroke: false,
          fillColor: ocean,
          fillOpacity: 1,
          interactive: false,
        }
      ).addTo(map);
    }

    // Load geo async if URLs provided
    let regionsGeo = cfg.regionsGeo || null;
    let borderGeo = cfg.borderGeo || null;
    const fetchJson =
      (window.AtlasCore && AtlasCore.fetchJson) ||
      (async (u) => {
        const r = await fetch(u);
        return r.json();
      });

    try {
      if (!regionsGeo && cfg.regionsUrl) {
        regionsGeo = await fetchJson(cfg.regionsUrl);
      }
      if (!borderGeo && cfg.borderUrl) {
        borderGeo = await fetchJson(cfg.borderUrl);
      }
    } catch (e) {
      console.warn("Geo load fail", e);
    }

    let bounds = null;
    if (regionsGeo && regionsGeo.features && regionsGeo.features.length) {
      regionGeoLayer = L.geoJSON(regionsGeo, {
        style: styleFeat,
        onEachFeature: function (feat, layer) {
          const p = feat.properties || {};
          const title = p.name_es || p.name || "Región";
          const extra =
            p.geonunit && p.geonunit !== title ? " · " + p.geonunit : "";
          const tipo = p.type ? " · " + p.type : "";
          const popHint =
            cfg.poblacion_fmt
              ? '<div style="margin-top:6px;font-size:11px;color:#64748b">País: pop ' +
                escapeHtml(cfg.poblacion_fmt) +
                (cfg.pib_m_fmt ? " · PIB " + escapeHtml(cfg.pib_m_fmt) + " M$" : "") +
                "</div>"
              : "";
          layer.bindPopup(
            '<div style="min-width:160px" class="region-popup">' +
              '<strong style="font-size:13px">' +
              escapeHtml(title) +
              "</strong>" +
              '<div style="margin-top:4px;color:#475569;font-size:12px">' +
              escapeHtml((tipo + extra).replace(/^ · /, "")) +
              "</div>" +
              (cfg.iso === "gb" && p.geonunit
                ? '<div style="margin-top:4px;font-size:11px;color:#64748b">Nación: <b>' +
                  escapeHtml(p.geonunit) +
                  "</b></div>"
                : "") +
              popHint +
              "</div>"
          );
          layer.on("mouseover", function () {
            this.setStyle({
              weight: borderWeight + 1.6,
              fillOpacity: Math.min(0.95, regionFill + 0.18),
            });
            if (this.getElement) {
              const el = this.getElement();
              if (el) el.classList.add("region-glow");
            }
          });
          layer.on("mouseout", function () {
            regionGeoLayer.resetStyle(this);
            if (this.getElement) {
              const el = this.getElement();
              if (el) el.classList.remove("region-glow");
            }
          });
        },
      }).addTo(regionLayer);
      bounds = regionGeoLayer.getBounds();
    } else if (borderGeo) {
      borderGeoLayer = L.geoJSON(borderGeo, {
        style: {
          color: "#1a2332",
          weight: borderWeight + 0.4,
          fillColor: cfg.fillColor || "#8fd19e",
          fillOpacity: regionFill,
        },
        interactive: true,
        onEachFeature: function (feat, layer) {
          layer.bindPopup(
            "<strong>" +
              escapeHtml(cfg.title || cfg.iso || "País") +
              "</strong>"
          );
        },
      }).addTo(regionLayer);
      bounds = borderGeoLayer.getBounds();
    }

    if (bounds && bounds.isValid()) applyCountryLock(bounds);

    const valid = (cfg.points || []).filter(
      (p) => p.lat != null && p.lon != null && !p.outOfCountry
    );
    const many = valid.length > 32;
    valid.forEach((p) => {
      p.showName = p.capital || !many || (p.name && p.name.length <= 14);
      p.displayName = p.name;
      const m = L.marker([p.lat, p.lon], {
        icon: cityIcon(p),
        zIndexOffset: p.capital ? 3000 : 1000,
        keyboard: true,
        title: p.name,
      }).addTo(cityLayer);
      const tipo = p.capital
        ? "★ Capital del módulo"
        : p.region
        ? "Región del módulo"
        : "Ciudad / tile";
      m.bindPopup(
        '<div style="min-width:170px">' +
          '<strong style="font-size:14px">' +
          escapeHtml(p.name) +
          "</strong>" +
          '<div style="margin-top:4px;color:#475569">#' +
          p.n +
          " · " +
          tipo +
          "</div>" +
          (p.geoLabel
            ? '<div style="margin-top:4px;font-size:12px;color:#64748b">Geo: ' +
              escapeHtml(p.geoLabel) +
              "</div>"
            : "") +
          "</div>"
      );
      markers[p.n] = m;
    });

    if ((!bounds || !bounds.isValid()) && valid.length) {
      applyCountryLock(L.latLngBounds(valid.map((p) => [p.lat, p.lon])));
    }

    setTimeout(function () {
      regionLayer.bringToFront();
      cityLayer.bringToFront();
    }, 100);

    document.querySelectorAll("[data-tile-n]").forEach((row) => {
      row.addEventListener("click", () => {
        document
          .querySelectorAll("[data-tile-n]")
          .forEach((r) => r.classList.remove("active"));
        row.classList.add("active");
        const n = row.getAttribute("data-tile-n");
        const m = markers[n];
        if (m) {
          map.setView(m.getLatLng(), Math.max(map.getZoom(), 7), {
            animate: true,
          });
          m.openPopup();
        }
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          row.click();
        }
      });
    });

    const q = document.getElementById("tileSearch");
    if (q) {
      q.addEventListener("input", () => {
        const v = q.value.trim().toLowerCase();
        document.querySelectorAll("[data-tile-n]").forEach((row) => {
          const hay = (row.getAttribute("data-name") || "").toLowerCase();
          row.style.display = !v || hay.includes(v) ? "" : "none";
        });
      });
    }

    const btn = document.getElementById("toggleLabels");
    if (btn) {
      let show = true;
      btn.addEventListener("click", () => {
        show = !show;
        document.querySelectorAll(".city-name").forEach((el) => {
          el.style.display = show ? "" : "none";
        });
        btn.textContent = show
          ? window.AtlasCore
            ? AtlasCore.t("hideNames")
            : "Ocultar nombres"
          : window.AtlasCore
          ? AtlasCore.t("showNames")
          : "Mostrar nombres";
      });
    }

    const btnR = document.getElementById("toggleRegions");
    if (btnR) {
      let showR = true;
      btnR.addEventListener("click", () => {
        showR = !showR;
        if (showR) map.addLayer(regionLayer);
        else map.removeLayer(regionLayer);
        btnR.textContent = showR
          ? window.AtlasCore
            ? AtlasCore.t("hideRegions")
            : "Ocultar regiones"
          : window.AtlasCore
          ? AtlasCore.t("showRegions")
          : "Mostrar regiones";
      });
    }

    window.__map = map;
    window.__markers = markers;
    window.__terrain = terrainApi;
    window.__regionLayer = regionLayer;
    window.__cityLayer = cityLayer;

    return {
      map,
      markers,
      regionLayer,
      cityLayer,
      restyleRegions,
      setHeat: function () {
        /* reserved for admin1 metrics */
      },
    };
  },
};
