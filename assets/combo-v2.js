/**
 * Combinar v6 — lazy GeoJSON, charts, war sim, drag chips, share/export
 * Requiere: Leaflet, AtlasCore, combo_index (JSON o COMBO_INDEX), Chart.js opcional
 */
(function () {
  const C = window.AtlasCore;
  let INDEX = null;
  let COLORS = [
    "#7ea6e0", "#8fd19e", "#f4c27a", "#e57373",
    "#ba68c8", "#4dd0e1", "#ffd54f", "#a1887f",
  ];
  const packCache = {};
  let selected = [];
  let cityOn = {};
  let showAllCities = true;
  let showCityNames = true;
  let showBorders = true;
  let outlineOnly = false;
  let useCluster = false;
  let heatMetric = "off";
  let borderFillOpacity = 0.72;
  let borderWeight = 1.8;
  let map, borderLayer, cityLayer, clusterLayer, terrainApi;
  const borderLayersByKey = {};
  let chartInst = null;
  let warState = null;
  let dragFrom = null;

  function toast(msg) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2000);
  }

  function meta(k) {
    return INDEX.countries[k];
  }

  async function loadPack(key) {
    if (packCache[key] && packCache[key].border) return packCache[key];
    const m = meta(key);
    if (!m) throw new Error("unknown " + key);
    const pack = packCache[key] || (await C.fetchJson(m.packUrl));
    // lazy border (reintenta si falló antes)
    if (!pack.border) {
      const url = m.borderUrl || pack.borderUrl;
      if (url) {
        try {
          pack.border = await C.fetchJson(url, { cache: true });
          if (!pack.border || !pack.border.features) {
            console.warn("Border sin features", key, url);
            pack.border = null;
          }
        } catch (e) {
          console.warn("Border load fail", key, url, e);
          pack.border = null;
          toast("Sin contorno: " + (m.es || key) + " (" + url + ")");
        }
      }
    }
    packCache[key] = pack;
    return pack;
  }

  function initMap() {
    map = L.map("map", {
      scrollWheelZoom: true,
      worldCopyJump: false,
      zoomControl: true,
      minZoom: 1,
      maxZoom: 18,
    });
    // Panes por encima de tiles de terreno
    if (!map.getPane("comboBorders")) {
      map.createPane("comboBorders");
      map.getPane("comboBorders").style.zIndex = 450;
    }
    if (!map.getPane("comboCities")) {
      map.createPane("comboCities");
      map.getPane("comboCities").style.zIndex = 460;
    }
    borderLayer = L.layerGroup({ pane: "comboBorders" }).addTo(map);
    cityLayer = L.layerGroup({ pane: "comboCities" }).addTo(map);
    if (window.L && L.markerClusterGroup) {
      clusterLayer = L.markerClusterGroup({
        maxClusterRadius: 45,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        pane: "comboCities",
      });
    }
    map.setView([30, 10], 2);
    const mount = document.getElementById("terrainPanel");
    if (window.TerrainLayers && mount) {
      terrainApi = window.TerrainLayers.attach(map, {
        mount,
        // Atlas político: se ven mejor los contornos de color
        defaultId: "atlas",
        onStyleChange: function (st) {
          // Mínimo de relleno para que el país se vea siempre
          borderFillOpacity = Math.max(0.35, st.regionFill || 0.45);
          borderWeight = Math.max(1.6, st.borderWeight || 1.8);
          Object.keys(borderLayersByKey).forEach(function (k) {
            const layer = borderLayersByKey[k];
            if (!layer || !layer.setStyle) return;
            layer.setStyle({
              color: "#0f172a",
              weight: borderWeight,
              fillColor: layer._comboColor || "#7ea6e0",
              fillOpacity: outlineOnly ? 0.12 : borderFillOpacity,
            });
          });
          try {
            borderLayer.bringToFront();
            cityLayer.bringToFront();
            if (clusterLayer && map.hasLayer(clusterLayer))
              clusterLayer.bringToFront();
          } catch (e) {}
        },
      });
    }
  }

  function countryList() {
    return Object.values(INDEX.countries).sort((a, b) =>
      a.es.localeCompare(b.es, "es")
    );
  }

  function renderPicker() {
    const box = document.getElementById("countryList");
    const q = (document.getElementById("search").value || "").trim().toLowerCase();
    const list = countryList().filter(
      (c) =>
        !q ||
        c.es.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        (c.iso || "").toLowerCase().includes(q)
    );
    box.innerHTML = list
      .map((c) => {
        const on = selected.includes(c.key);
        const idx = selected.indexOf(c.key);
        const col = on ? COLORS[idx % COLORS.length] : "transparent";
        return (
          '<label class="pick' +
          (on ? " on" : "") +
          '" data-key="' +
          c.key +
          '" role="checkbox" aria-checked="' +
          on +
          '" tabindex="0">' +
          '<span class="sw" style="background:' +
          col +
          '"></span>' +
          '<input type="checkbox" ' +
          (on ? "checked" : "") +
          ' aria-hidden="true" tabindex="-1"/>' +
          "<div><b>" +
          C.escapeHtml(c.es) +
          "</b><small>" +
          C.escapeHtml(c.iso) +
          " · Pop " +
          C.escapeHtml(c.poblacion_fmt) +
          " · " +
          (c.cityCount || 0) +
          " ciudades · " +
          (c.hasBorder ? "mapa✓" : "sin contorno") +
          "</small></div></label>"
        );
      })
      .join("");

    box.querySelectorAll(".pick").forEach((el) => {
      const go = () => toggle(el.getAttribute("data-key"));
      el.addEventListener("click", (e) => {
        e.preventDefault();
        go();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    });
  }

  async function toggle(key) {
    const i = selected.indexOf(key);
    if (i >= 0) {
      selected.splice(i, 1);
      delete cityOn[key];
    } else {
      if (selected.length >= 8) {
        toast(C.t("max8"));
        return;
      }
      selected.push(key);
      cityOn[key] = true;
      try {
        await loadPack(key);
      } catch (e) {
        console.warn(e);
      }
    }
    syncUrl();
    renderPicker();
    updateChips();
    await updateAll();
  }

  function updateChips() {
    const el = document.getElementById("chips");
    if (!selected.length) {
      el.innerHTML = '<span class="muted">Selecciona países (hasta 8)…</span>';
      return;
    }
    el.innerHTML = selected
      .map((k, i) => {
        const c = meta(k);
        const citiesVisible = cityOn[k] !== false;
        return (
          '<span class="chip draggable" draggable="true" data-key="' +
          k +
          '" style="border-color:' +
          COLORS[i % COLORS.length] +
          '">' +
          '<i style="background:' +
          COLORS[i % COLORS.length] +
          '"></i>' +
          C.escapeHtml(c ? c.es : k) +
          ' <button type="button" class="city-tog' +
          (citiesVisible ? " active" : "") +
          '" data-city="' +
          k +
          '" title="Ciudades" aria-label="Toggle ciudades">🏙</button>' +
          ' <button type="button" data-zoom="' +
          k +
          '" title="Zoom" aria-label="Zoom país">🔍</button>' +
          ' <button type="button" data-x="' +
          k +
          '" title="Quitar" aria-label="Quitar">×</button></span>'
        );
      })
      .join("");

    el.querySelectorAll("button[data-x]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle(b.getAttribute("data-x"));
      });
    });
    el.querySelectorAll("button[data-city]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const k = b.getAttribute("data-city");
        cityOn[k] = !(cityOn[k] !== false);
        updateChips();
        await updateMap();
      });
    });
    el.querySelectorAll("button[data-zoom]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const k = b.getAttribute("data-zoom");
        const pack = packCache[k] || (await loadPack(k));
        if (pack.border && borderLayersByKey[k]) {
          try {
            map.fitBounds(borderLayersByKey[k].getBounds().pad(0.08), {
              maxZoom: 7,
              animate: true,
            });
          } catch (err) {}
        } else if (pack.center) {
          map.setView(pack.center, 5, { animate: true });
        }
      });
    });

    // drag reorder
    el.querySelectorAll(".chip.draggable").forEach((chip) => {
      chip.addEventListener("dragstart", (e) => {
        dragFrom = chip.getAttribute("data-key");
        chip.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      chip.addEventListener("dragend", () => {
        chip.classList.remove("dragging");
        dragFrom = null;
      });
      chip.addEventListener("dragover", (e) => e.preventDefault());
      chip.addEventListener("drop", async (e) => {
        e.preventDefault();
        const to = chip.getAttribute("data-key");
        if (!dragFrom || dragFrom === to) return;
        const a = selected.indexOf(dragFrom);
        const b = selected.indexOf(to);
        if (a < 0 || b < 0) return;
        selected.splice(b, 0, selected.splice(a, 1)[0]);
        updateChips();
        await updateAll();
        syncUrl();
      });
    });
  }

  function cityIcon(p, color) {
    const isCap = p.capital;
    const r = isCap ? 8 : 5;
    const bg = isCap ? "#d90429" : color;
    const nameHtml = showCityNames
      ? '<div class="c-name' +
        (isCap ? " cap" : "") +
        '">' +
        C.escapeHtml(p.name) +
        "</div>"
      : "";
    const style =
      "background:" +
      bg +
      ";width:" +
      r * 2 +
      "px;height:" +
      r * 2 +
      "px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)";
    return L.divIcon({
      className: "city-marker-root",
      html:
        '<div class="c-wrap"><div style="' +
        style +
        '"></div>' +
        nameHtml +
        "</div>",
      iconSize: [0, 0],
      iconAnchor: [r, r],
    });
  }

  async function getSelectedPacks() {
    const out = [];
    for (const k of selected) {
      try {
        out.push(await loadPack(k));
      } catch (e) {
        console.warn(e);
      }
    }
    return out;
  }

  async function updateMap() {
    borderLayer.clearLayers();
    cityLayer.clearLayers();
    if (clusterLayer) {
      clusterLayer.clearLayers();
      if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
    }
    Object.keys(borderLayersByKey).forEach((k) => delete borderLayersByKey[k]);
    const countries = await getSelectedPacks();
    if (!countries.length) {
      map.setView([30, 10], 2);
      return;
    }
    const heatFn =
      heatMetric !== "off" && window.AtlasExtras
        ? AtlasExtras.heatScale(countries, heatMetric)
        : null;
    const cityTarget =
      useCluster && clusterLayer ? clusterLayer : cityLayer;
    if (useCluster && clusterLayer) map.addLayer(clusterLayer);

    const bounds = [];
    countries.forEach((c, i) => {
      const color = heatFn ? heatFn(c) : COLORS[i % COLORS.length];
      if (showBorders && c.border && c.border.features) {
        try {
          const fillOp = outlineOnly
            ? 0.15
            : Math.max(0.4, borderFillOpacity);
          const layer = L.geoJSON(c.border, {
            pane: "comboBorders",
            style: {
              color: "#0f172a",
              weight: Math.max(2, borderWeight),
              fillColor: color,
              fillOpacity: fillOp,
              className: "region-poly",
            },
            onEachFeature: function (feat, lyr) {
              lyr.bindPopup(
                "<strong>" +
                  C.escapeHtml(c.es) +
                  "</strong><br>ISO " +
                  C.escapeHtml(c.iso2 || c.iso) +
                  "<br>Pop " +
                  C.escapeHtml(c.poblacion_fmt) +
                  "<br>PIB " +
                  C.escapeHtml(c.pib_m_fmt) +
                  " M USD<br>Poder " +
                  (c.military ? c.military.power_index : "—")
              );
              lyr.on("mouseover", function () {
                this.setStyle({
                  weight: borderWeight + 2,
                  fillOpacity: Math.min(0.95, fillOp + 0.2),
                });
              });
              lyr.on("mouseout", function () {
                this.setStyle({
                  weight: Math.max(2, borderWeight),
                  fillOpacity: fillOp,
                  fillColor: color,
                });
              });
            },
          }).addTo(borderLayer);
          layer._comboColor = color;
          borderLayersByKey[c.key] = layer;
          const b = layer.getBounds();
          if (b.isValid()) bounds.push(b);
        } catch (e) {
          console.warn("geo draw", c.key, e);
          toast("Error dibujando " + c.es);
        }
      } else if (showBorders && !c.border) {
        // Fallback: círculo en capital si no hay contorno
        const cap = (c.cities || []).find((x) => x.capital && x.lat != null);
        const center = cap
          ? [cap.lat, cap.lon]
          : c.center
          ? c.center
          : null;
        if (center) {
          L.circleMarker(center, {
            pane: "comboBorders",
            radius: 14,
            color: "#0f172a",
            weight: 2,
            fillColor: color,
            fillOpacity: 0.7,
          })
            .bindPopup(C.escapeHtml(c.es) + " (sin polígono de contorno)")
            .addTo(borderLayer);
        }
      }
      if (showAllCities && cityOn[c.key] !== false && c.cities) {
        c.cities.forEach((city) => {
          if (city.lat == null || city.lon == null || city.outOfCountry) return;
          L.circle([city.lat, city.lon], {
            radius: city.capital ? 28000 : 16000,
            color: heatFn ? COLORS[i % COLORS.length] : color,
            weight: 1,
            fillColor: heatFn ? COLORS[i % COLORS.length] : color,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(cityLayer);
          const m = L.marker([city.lat, city.lon], {
            icon: cityIcon(city, heatFn ? COLORS[i % COLORS.length] : color),
            zIndexOffset: city.capital ? 2000 : 500,
          }).bindPopup(
            "<strong>" +
              C.escapeHtml(city.name) +
              "</strong><br>" +
              C.escapeHtml(c.es) +
              (city.capital ? "<br>★ Capital" : "")
          );
          cityTarget.addLayer(m);
          bounds.push(
            L.latLngBounds([
              [city.lat, city.lon],
              [city.lat, city.lon],
            ])
          );
        });
      }
    });
    if (bounds.length) {
      let u = bounds[0];
      for (let i = 1; i < bounds.length; i++) {
        try {
          u = u.extend(bounds[i]);
        } catch (e) {}
      }
      if (u && u.isValid())
        map.fitBounds(u.pad(0.1), { maxZoom: 7, animate: true });
    }
    setTimeout(() => {
      try {
        borderLayer.bringToFront();
        cityLayer.bringToFront();
      } catch (e) {}
    }, 80);
  }

  function alliance(countries) {
    let pop = 0,
      pib = 0,
      tiles = 0,
      area = 0,
      nCities = 0,
      idhW = 0,
      idhP = 0,
      deudaW = 0,
      deudaP = 0,
      power = 0;
    countries.forEach((c) => {
      if (c.poblacion != null) pop += c.poblacion;
      if (c.pib_m != null) pib += c.pib_m;
      tiles += c.tiles || 0;
      nCities += (c.cities || []).filter((x) => x.lat != null).length;
      if (c.area_km2 != null) area += c.area_km2;
      const idh = C.parseIdh(c.idh);
      if (idh != null && c.poblacion) {
        idhW += idh * c.poblacion;
        idhP += c.poblacion;
      }
      const d = C.parseDeuda(c.deuda_pct);
      if (d != null && c.pib_m) {
        deudaW += d * c.pib_m;
        deudaP += c.pib_m;
      }
      if (c.military) power += c.military.power_index || 0;
    });
    return {
      poblacion: pop || null,
      pib_m: pib || null,
      pib_pc: pop > 0 && pib > 0 ? (pib * 1e6) / pop : null,
      tiles,
      nCities,
      area_km2: area || null,
      idh: idhP ? idhW / idhP : null,
      deuda_pct: deudaP ? deudaW / deudaP : null,
      power,
      n: countries.length,
    };
  }

  function warScores(countries) {
    const max = {
      pib: Math.max(...countries.map((c) => c.pib_m || 0), 1),
      pop: Math.max(...countries.map((c) => c.poblacion || 0), 1),
      pc: Math.max(...countries.map((c) => c.pib_pc || 0), 1),
      idh: Math.max(...countries.map((c) => C.parseIdh(c.idh) || 0), 0.01),
      tiles: Math.max(...countries.map((c) => c.tiles || 0), 1),
      mil: Math.max(
        ...countries.map((c) => (c.military && c.military.power_index) || 0),
        0.01
      ),
    };
    return countries.map((c) => {
      const idh = C.parseIdh(c.idh) || 0;
      const mil = (c.military && c.military.power_index) || 0;
      const score =
        0.3 * ((c.pib_m || 0) / max.pib) +
        0.2 * ((c.poblacion || 0) / max.pop) +
        0.1 * ((c.pib_pc || 0) / max.pc) +
        0.1 * (idh / max.idh) +
        0.1 * ((c.tiles || 0) / max.tiles) +
        0.2 * (mil / max.mil);
      return { key: c.key, es: c.es, score, c };
    });
  }

  function renderChart(countries) {
    const canvas = document.getElementById("cmpChart");
    if (!canvas || !window.Chart) return;
    if (chartInst) chartInst.destroy();
    const labels = countries.map((c) => c.es);
    chartInst = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "PIB (M$ log)",
            data: countries.map((c) =>
              c.pib_m ? Math.log10(c.pib_m + 1) : 0
            ),
            backgroundColor: countries.map(
              (_, i) => COLORS[i % COLORS.length] + "cc"
            ),
          },
          {
            label: "Población (log)",
            data: countries.map((c) =>
              c.poblacion ? Math.log10(c.poblacion + 1) : 0
            ),
            backgroundColor: countries.map(
              (_, i) => COLORS[i % COLORS.length] + "66"
            ),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue("--ink") || "#333" } },
          title: {
            display: true,
            text: "Comparativa (escala log)",
            color: getComputedStyle(document.documentElement).getPropertyValue("--ink") || "#333",
          },
        },
        scales: {
          x: { ticks: { color: "#64748b" }, grid: { color: "rgba(100,116,139,.15)" } },
          y: { ticks: { color: "#64748b" }, grid: { color: "rgba(100,116,139,.15)" } },
        },
        animation: { duration: 600 },
      },
    });
  }

  function initWar(countries) {
    warState = {
      turn: 1,
      log: [],
      sides: countries.map((c) => ({
        key: c.key,
        es: c.es,
        hp: 100,
        morale: 70 + Math.round((C.parseIdh(c.idh) || 0.5) * 25),
        eco: 100,
        troops: c.military ? c.military.troops_est : Math.round((c.poblacion || 1e6) * 0.003),
        power: c.military ? c.military.power_index : 5,
      })),
    };
  }

  function warStep(action) {
    if (!warState || warState.sides.length < 2) return;
    const atk = warState.sides[0];
    const def = warState.sides[1];
    const mult =
      action === "attack" ? 1.15 : action === "defend" ? 0.7 : 0.9;
    const raw =
      (atk.power / (def.power + 0.01)) *
      (atk.morale / 100) *
      mult *
      (0.8 + Math.random() * 0.4);
    const dmg = Math.min(28, Math.max(4, Math.round(raw * 8)));
    def.hp = Math.max(0, def.hp - dmg);
    def.morale = Math.max(10, def.morale - Math.round(dmg / 3));
    atk.eco = Math.max(20, atk.eco - (action === "attack" ? 6 : 3));
    atk.troops = Math.max(0, atk.troops - Math.round(dmg * 120));
    def.troops = Math.max(0, def.troops - Math.round(dmg * 150));
    warState.log.unshift(
      "T" +
        warState.turn +
        ": " +
        atk.es +
        " " +
        action +
        " → " +
        def.es +
        " -" +
        dmg +
        " HP"
    );
    // AI reply if def alive
    if (def.hp > 0) {
      const aiDmg = Math.min(
        22,
        Math.max(3, Math.round((def.power / (atk.power + 0.01)) * 7 * (0.8 + Math.random() * 0.4)))
      );
      atk.hp = Math.max(0, atk.hp - aiDmg);
      warState.log.unshift(
        "T" + warState.turn + " AI: " + def.es + " contraataca -" + aiDmg + " HP"
      );
    }
    warState.turn++;
    // rotate if more than 2? keep 0 as player focus
    try {
      localStorage.setItem(
        "atlasv6:warlog",
        JSON.stringify({ at: Date.now(), state: warState })
      );
    } catch (e) {}
  }

  function warHtml() {
    if (!warState) return "";
    return (
      '<div class="war-panel" id="warPanel">' +
      "<h3 style=\"margin:0 0 8px;font-size:.95rem\">⚔ Simulador por turnos (educativo)</h3>" +
      warState.sides
        .map(
          (s) =>
            "<div><b>" +
            C.escapeHtml(s.es) +
            "</b> · moral " +
            s.morale +
            " · tropas " +
            C.fmtPop(s.troops) +
            '<div class="hp" title="HP territorio"><i style="width:' +
            s.hp +
            '%;background:' +
            (s.hp > 50 ? "#22c55e" : s.hp > 25 ? "#eab308" : "#ef4444") +
            '"></i></div></div>'
        )
        .join("") +
      '<div class="tour-row">' +
      '<button type="button" class="btn-mini" data-war="attack">Atacar</button>' +
      '<button type="button" class="btn-mini" data-war="defend">Defender</button>' +
      '<button type="button" class="btn-mini" data-war="regroup">Reagrupar</button>' +
      '<button type="button" class="btn-mini" data-war="reset">Reiniciar</button>' +
      "</div>" +
      '<div style="font-size:.78rem;color:var(--muted);max-height:100px;overflow:auto">' +
      warState.log
        .slice(0, 8)
        .map((l) => "<div>" + C.escapeHtml(l) + "</div>")
        .join("") +
      "</div>" +
      (warState.sides.some((s) => s.hp <= 0)
        ? '<p class="war-banner win">Fin: gana <b>' +
          C.escapeHtml(
            warState.sides.slice().sort((a, b) => b.hp - a.hp)[0].es
          ) +
          "</b></p>"
        : "") +
      "</div>"
    );
  }

  async function updateResults() {
    const countries = await getSelectedPacks();
    const mode =
      document.querySelector('input[name="mode"]:checked')?.value || "alliance";
    const panel = document.getElementById("results");
    const title = document.getElementById("resultsTitle");

    if (countries.length < 1) {
      title.textContent = "Resultados";
      panel.innerHTML =
        '<p class="empty">Elige países. Los contornos se cargan bajo demanda (fetch).</p>';
      return;
    }

    let html =
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>País</th><th>Población</th><th>PIB M$</th><th>PIB/c</th><th>IDH</th><th>Poder</th><th>Tiles</th></tr></thead><tbody>';
    countries.forEach((c, i) => {
      html +=
        "<tr><td><span class='dot' style='background:" +
        COLORS[i % COLORS.length] +
        "'></span> <b>" +
        C.escapeHtml(c.es) +
        "</b></td><td>" +
        C.escapeHtml(c.poblacion_fmt) +
        "</td><td>" +
        C.escapeHtml(c.pib_m_fmt) +
        "</td><td>" +
        C.escapeHtml(c.pib_pc_fmt) +
        "</td><td>" +
        C.escapeHtml(String(c.idh)) +
        "</td><td>" +
        (c.military ? c.military.power_index : "—") +
        "</td><td>" +
        c.tiles +
        "</td></tr>";
    });
    html += "</tbody></table></div>";
    html +=
      '<div class="chart-box"><canvas id="cmpChart" aria-label="Gráfico comparativo"></canvas></div>';

    if (mode === "alliance") {
      title.textContent = "Alianza (" + countries.length + ")";
      const a = alliance(countries);
      html +=
        '<div class="combo-card"><h3>Total combinado</h3><div class="stats">' +
        '<div class="stat"><div class="k">Población</div><div class="v">' +
        C.fmtPop(a.poblacion) +
        "</div></div>" +
        '<div class="stat"><div class="k">PIB M$</div><div class="v">' +
        C.fmtNum(a.pib_m) +
        "</div></div>" +
        '<div class="stat"><div class="k">PIB/c</div><div class="v">' +
        C.fmtNum(a.pib_pc) +
        "</div></div>" +
        '<div class="stat"><div class="k">Tiles</div><div class="v">' +
        a.tiles +
        "</div></div>" +
        '<div class="stat"><div class="k">Área</div><div class="v">' +
        (a.area_km2 != null ? C.fmtNum(a.area_km2) + " km²" : "N/D") +
        "</div></div>" +
        '<div class="stat"><div class="k">Poder Σ</div><div class="v">' +
        (Math.round(a.power * 10) / 10) +
        "</div></div>" +
        "</div></div>";
    } else if (mode === "war") {
      title.textContent = "Guerra / ranking";
      const scores = warScores(countries).sort((a, b) => b.score - a.score);
      const champ = scores[0];
      const runner = scores[1];
      const margin =
        runner && champ
          ? ((champ.score - runner.score) / Math.max(champ.score, 0.001)) * 100
          : 100;
      html +=
        '<div class="war-banner ' +
        (margin < 3 ? "tie" : "win") +
        '">' +
        (margin < 3
          ? "Empate técnico: <b>" +
            C.escapeHtml(champ.es) +
            "</b> / <b>" +
            C.escapeHtml(runner.es) +
            "</b>"
          : "🏆 Gana <b>" +
            C.escapeHtml(champ.es) +
            "</b> (" +
            (champ.score * 100).toFixed(1) +
            " pts)") +
        "</div>";
      scores.forEach((s, i) => {
        const pct = Math.round(s.score * 100);
        const col = COLORS[selected.indexOf(s.key) % COLORS.length];
        html +=
          '<div class="score-row"><div class="score-head"><span><span class="dot" style="background:' +
          col +
          '"></span> ' +
          (i + 1) +
          ". <b>" +
          C.escapeHtml(s.es) +
          "</b></span><span>" +
          pct +
          ' pts</span></div><div class="bar"><i style="width:' +
          pct +
          "%;background:" +
          col +
          '"></i></div></div>';
      });
      html +=
        '<p class="note">Score = 30% PIB + 20% pop + 20% poder militar proxy + 10% PIB/c + 10% IDH + 10% tiles.</p>';
    } else {
      // sim
      title.textContent = "Simulador de conflicto";
      if (!warState || warState.sides.map((s) => s.key).join() !== countries.map((c) => c.key).join()) {
        initWar(countries);
      }
      html += warHtml();
    }

    panel.innerHTML = html;
    renderChart(countries);

    panel.querySelectorAll("[data-war]").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.getAttribute("data-war");
        if (act === "reset") initWar(countries);
        else warStep(act);
        await updateResults();
      });
    });
  }

  async function updateAll() {
    await updateMap();
    await updateResults();
    document.getElementById("selCount").textContent =
      selected.length + " " + C.t("selected");
  }

  function syncUrl() {
    const mode =
      document.querySelector('input[name="mode"]:checked')?.value || "alliance";
    history.replaceState(
      null,
      "",
      C.shareUrl({ paises: selected.join(","), mode })
    );
  }

  async function preset(keys) {
    selected = keys.filter((k) => meta(k));
    cityOn = {};
    for (const k of selected) {
      cityOn[k] = true;
      try {
        await loadPack(k);
      } catch (e) {}
    }
    renderPicker();
    updateChips();
    await updateAll();
    syncUrl();
  }

  async function boot() {
    C.wireChrome();
    C.injectToolbar();
    // load index
    if (window.COMBO_INDEX) {
      INDEX = window.COMBO_INDEX;
    } else {
      INDEX = await C.fetchJson("assets/combo_index.json");
    }
    if (INDEX.colors) COLORS = INDEX.colors;
    if (!INDEX.countries && INDEX) {
      // already {countries:{}}
    }

    initMap();

    // URL restore
    const params = new URLSearchParams(location.search);
    const fromUrl = (params.get("paises") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const mode = params.get("mode");
    if (mode) {
      const r = document.querySelector('input[name="mode"][value="' + mode + '"]');
      if (r) r.checked = true;
    }
    if (fromUrl.length) {
      selected = fromUrl.filter((k) => meta(k)).slice(0, 8);
      for (const k of selected) {
        cityOn[k] = true;
        try {
          await loadPack(k);
        } catch (e) {}
      }
    }

    renderPicker();
    updateChips();
    await updateAll();

    document.getElementById("search").addEventListener("input", renderPicker);
    document.querySelectorAll('input[name="mode"]').forEach((r) => {
      r.addEventListener("change", () => {
        syncUrl();
        updateResults();
      });
    });
    document.getElementById("btnClear").addEventListener("click", async () => {
      selected = [];
      cityOn = {};
      warState = null;
      renderPicker();
      updateChips();
      await updateAll();
      syncUrl();
    });
    document.getElementById("btnFRIT")?.addEventListener("click", () =>
      preset(["France", "Italy"])
    );
    document.getElementById("btnUK")?.addEventListener("click", () =>
      preset(["UnitedKingdom", "France", "Germany"])
    );
    document.getElementById("btnBRAR")?.addEventListener("click", () =>
      preset(["Brazil", "Argentina", "Chile"])
    );
    document.getElementById("btnToggleCities")?.addEventListener("click", async (e) => {
      showAllCities = !showAllCities;
      e.target.textContent = showAllCities
        ? "Ocultar todas las ciudades"
        : "Mostrar todas las ciudades";
      await updateMap();
    });
    document.getElementById("btnToggleNames")?.addEventListener("click", async (e) => {
      showCityNames = !showCityNames;
      e.target.textContent = showCityNames
        ? "Ocultar nombres"
        : "Mostrar nombres";
      await updateMap();
    });
    document.getElementById("btnToggleBorders")?.addEventListener("click", async (e) => {
      showBorders = !showBorders;
      e.target.textContent = showBorders
        ? "Ocultar contornos"
        : "Mostrar contornos";
      await updateMap();
    });
    document.getElementById("btnOutline")?.addEventListener("click", async (e) => {
      outlineOnly = !outlineOnly;
      e.target.classList.toggle("on", outlineOnly);
      e.target.textContent = outlineOnly
        ? "Relleno ON"
        : C.t("outlineOnly");
      await updateMap();
    });
    document.getElementById("btnShare")?.addEventListener("click", async () => {
      syncUrl();
      const ok = await C.copyText(location.href);
      toast(ok ? "Enlace copiado" : location.href);
    });
    document.getElementById("btnTweet")?.addEventListener("click", () => {
      syncUrl();
      const names = selected
        .map((k) => (meta(k) ? meta(k).es : k))
        .join(", ");
      if (window.AtlasExtras) {
        AtlasExtras.shareTwitter(
          "Comparando países en Atlas 2025: " + names,
          location.href
        );
      }
    });
    document.getElementById("btnExport")?.addEventListener("click", async () => {
      await C.exportMapPng(
        document.querySelector(".map-panel") || document.getElementById("map"),
        "combinar-mapa.png"
      );
    });
    document.getElementById("btnTour")?.addEventListener("click", () => {
      const list = countryList()
        .slice()
        .sort((a, b) => (b.area_km2 || 0) - (a.area_km2 || 0))
        .slice(0, 5)
        .map((c) => c.key);
      preset(list);
      toast("Tour: 5 más grandes (área)");
    });
    document.getElementById("btnCluster")?.addEventListener("click", async (e) => {
      if (!clusterLayer) {
        toast("MarkerCluster no cargó (CDN)");
        return;
      }
      useCluster = !useCluster;
      e.target.textContent = useCluster
        ? "Ciudades sin cluster"
        : "Cluster ciudades";
      await updateMap();
    });
    document.getElementById("heatMetric")?.addEventListener("change", async (e) => {
      heatMetric = e.target.value || "off";
      await updateMap();
      toast(
        heatMetric === "off"
          ? "Heatmap off"
          : "Heatmap: " + heatMetric
      );
    });
    if (window.AtlasExtras) AtlasExtras.mobilePanels(".combo-layout");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot().catch((e) => {
        console.error(e);
        const el = document.getElementById("countryList");
        if (el)
          el.innerHTML =
            '<p class="alert">Error cargando combo_index. Ejecuta node _build_atlas_v6.js</p>';
      });
    });
  } else {
    boot();
  }
})();
