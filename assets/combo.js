/* Multi-selección v2: contornos + ciudades + toggle por país */
(function () {
  const data = window.COMBO_DATA || {};
  const COLORS = window.COMBO_COLORS || ["#7ea6e0", "#8fd19e", "#f4c27a", "#e57373"];

  function fmtPop(n) {
    if (n == null || !isFinite(n)) return "N/D";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }
  function fmtNum(n) {
    if (n == null || !isFinite(n)) return "N/D";
    return Math.round(n).toLocaleString("en-US");
  }
  function parseIdh(v) {
    if (v == null || v === "N/D" || v === "N/A") return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function parseDeuda(v) {
    if (v == null || v === "N/D" || v === "N/A") return null;
    const n = parseFloat(String(v).replace("%", "").replace(",", "."));
    return isFinite(n) ? n : null;
  }

  let map, borderLayer, cityLayer;
  let selected = [];
  // per-country city visibility: key -> true/false
  let cityOn = {};
  let showAllCities = true;
  let showCityNames = true;
  let showBorders = true;
  let borderFillOpacity = 0.72;
  let borderWeight = 1.8;
  let terrainApi = null;
  const borderLayersByKey = {};

  function initMap() {
    map = L.map("map", {
      scrollWheelZoom: true,
      worldCopyJump: false,
      zoomControl: true,
      minZoom: 1,
      maxZoom: 18,
    });
    borderLayer = L.layerGroup().addTo(map);
    cityLayer = L.layerGroup().addTo(map);
    map.setView([30, 10], 2);

    const mount = document.getElementById("terrainPanel");
    if (window.TerrainLayers && mount) {
      terrainApi = window.TerrainLayers.attach(map, {
        mount: mount,
        defaultId: "satellite",
        onStyleChange: function (st) {
          borderFillOpacity = st.regionFill;
          borderWeight = st.borderWeight;
          // restyle existing country polygons
          Object.keys(borderLayersByKey).forEach(function (k) {
            const layer = borderLayersByKey[k];
            if (!layer || !layer.setStyle) return;
            const color = layer._comboColor || "#7ea6e0";
            layer.setStyle({
              color: "#1a2332",
              weight: borderWeight,
              fillColor: color,
              fillOpacity: borderFillOpacity,
            });
          });
        },
      });
    } else {
      L.rectangle(
        [
          [-85, -180],
          [85, 180],
        ],
        {
          stroke: false,
          fillColor: "#e8eef4",
          fillOpacity: 1,
          interactive: false,
        }
      ).addTo(map);
    }
  }

  function countryList() {
    return Object.values(data).sort((a, b) => a.es.localeCompare(b.es, "es"));
  }

  function renderPicker() {
    const box = document.getElementById("countryList");
    const q = (document.getElementById("search").value || "").trim().toLowerCase();
    const list = countryList().filter(
      (c) =>
        !q ||
        c.es.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
    box.innerHTML = list
      .map((c) => {
        const on = selected.includes(c.key);
        const idx = selected.indexOf(c.key);
        const col = on ? COLORS[idx % COLORS.length] : "transparent";
        const nCities = (c.cities || []).length;
        return (
          '<label class="pick' +
          (on ? " on" : "") +
          '" data-key="' +
          c.key +
          '">' +
          '<span class="sw" style="background:' +
          col +
          '"></span>' +
          '<input type="checkbox" ' +
          (on ? "checked" : "") +
          " />" +
          "<div><b>" +
          c.es +
          "</b><small>" +
          c.iso +
          " · Pop " +
          c.poblacion_fmt +
          " · " +
          nCities +
          " ciudades · " +
          (c.border ? "mapa✓" : "sin contorno") +
          "</small></div>" +
          "</label>"
        );
      })
      .join("");

    box.querySelectorAll(".pick").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        toggle(el.getAttribute("data-key"));
      });
    });
  }

  function toggle(key) {
    const i = selected.indexOf(key);
    if (i >= 0) {
      selected.splice(i, 1);
      delete cityOn[key];
    } else {
      if (selected.length >= 8) {
        alert("Máximo 8 países en la combinación.");
        return;
      }
      selected.push(key);
      cityOn[key] = true;
    }
    renderPicker();
    updateChips();
    updateAll();
  }

  function updateChips() {
    const el = document.getElementById("chips");
    if (!selected.length) {
      el.innerHTML = '<span class="muted">Selecciona 2 o más países…</span>';
      return;
    }
    el.innerHTML = selected
      .map((k, i) => {
        const c = data[k];
        const citiesVisible = cityOn[k] !== false;
        return (
          '<span class="chip" style="border-color:' +
          COLORS[i % COLORS.length] +
          '">' +
          '<i style="background:' +
          COLORS[i % COLORS.length] +
          '"></i>' +
          (c ? c.es : k) +
          ' <button type="button" class="city-tog' +
          (citiesVisible ? " active" : "") +
          '" data-city="' +
          k +
          '" title="Mostrar/ocultar ciudades de este país">' +
          (citiesVisible ? "🏙" : "🚫") +
          "</button>" +
          ' <button type="button" data-x="' +
          k +
          '" title="Quitar">×</button></span>'
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
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const k = b.getAttribute("data-city");
        cityOn[k] = !(cityOn[k] !== false);
        updateChips();
        updateMap();
      });
    });
  }

  function getSelectedCountries() {
    return selected.map((k) => data[k]).filter(Boolean);
  }

  function cityIcon(p, color) {
    const isCap = p.capital;
    const r = isCap ? 8 : 5;
    const bg = isCap ? "#d90429" : color;
    const nameHtml = showCityNames
      ? '<div class="c-name' + (isCap ? " cap" : "") + '">' + escapeHtml(p.name) + "</div>"
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
        '<div class="c-wrap"><div class="c-dot' +
        (isCap ? " cap" : "") +
        '" style="' +
        style +
        '"></div>' +
        nameHtml +
        "</div>",
      iconSize: [0, 0],
      iconAnchor: [r, r],
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function updateMap() {
    borderLayer.clearLayers();
    cityLayer.clearLayers();
    Object.keys(borderLayersByKey).forEach((k) => delete borderLayersByKey[k]);
    const countries = getSelectedCountries();
    if (!countries.length) {
      map.setView([30, 10], 2);
      return;
    }
    const bounds = [];

    countries.forEach((c, i) => {
      const color = COLORS[i % COLORS.length];

      // Contorno
      if (showBorders && c.border && c.border.features) {
        try {
          const layer = L.geoJSON(c.border, {
            style: {
              color: "#1a2332",
              weight: borderWeight,
              fillColor: color,
              fillOpacity: borderFillOpacity,
            },
            onEachFeature: function (feat, lyr) {
              lyr.bindPopup(
                "<strong>" +
                  c.es +
                  "</strong><br>ISO " +
                  c.iso +
                  "<br>Pop " +
                  c.poblacion_fmt +
                  "<br>PIB " +
                  c.pib_m_fmt +
                  " M USD<br>Ciudades: " +
                  (c.cities || []).length
              );
            },
          }).addTo(borderLayer);
          layer._comboColor = color;
          borderLayersByKey[c.key] = layer;
          const b = layer.getBounds();
          if (b.isValid()) bounds.push(b);
        } catch (e) {
          console.warn("border draw fail", c.key, e);
        }
      } else if (!c.border) {
        L.circleMarker(c.center, {
          radius: 8,
          color: "#1a2332",
          fillColor: color,
          fillOpacity: 0.5,
          weight: 2,
        })
          .bindPopup(c.es + " (sin contorno disponible)")
          .addTo(borderLayer);
      }

      // Ciudades
      if (showAllCities && cityOn[c.key] !== false && c.cities && c.cities.length) {
        c.cities.forEach((city) => {
          // delimitación suave: círculo de área
          L.circle([city.lat, city.lon], {
            radius: city.capital ? 28000 : 16000,
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(cityLayer);

          const m = L.marker([city.lat, city.lon], {
            icon: cityIcon(city, color),
            zIndexOffset: city.capital ? 2000 : 500,
          }).addTo(cityLayer);
          m.bindPopup(
            "<strong>" +
              escapeHtml(city.name) +
              "</strong><br>" +
              c.es +
              (city.capital ? "<br>★ Capital del módulo" : "") +
              "<br>#" +
              city.n
          );
          bounds.push(L.latLngBounds([[city.lat, city.lon], [city.lat, city.lon]]));
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
      if (u && u.isValid()) map.fitBounds(u.pad(0.1), { maxZoom: 7, animate: true });
    }
    setTimeout(function () {
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
      nCities = 0;
    let idhW = 0,
      idhP = 0,
      deudaW = 0,
      deudaP = 0;
    countries.forEach((c) => {
      if (c.poblacion != null) pop += c.poblacion;
      if (c.pib_m != null) pib += c.pib_m;
      tiles += c.tiles || 0;
      nCities += (c.cities || []).length;
      if (c.area_km2 != null) area += c.area_km2;
      const idh = parseIdh(c.idh);
      if (idh != null && c.poblacion) {
        idhW += idh * c.poblacion;
        idhP += c.poblacion;
      }
      const d = parseDeuda(c.deuda_pct);
      if (d != null && c.pib_m) {
        deudaW += d * c.pib_m;
        deudaP += c.pib_m;
      }
    });
    const pib_pc = pop > 0 && pib > 0 ? (pib * 1e6) / pop : null;
    return {
      poblacion: pop || null,
      pib_m: pib || null,
      pib_pc,
      tiles,
      nCities,
      area_km2: area || null,
      idh: idhP ? idhW / idhP : null,
      deuda_pct: deudaP ? deudaW / deudaP : null,
      n: countries.length,
    };
  }

  function warScores(countries) {
    const max = {
      pib: Math.max(...countries.map((c) => c.pib_m || 0), 1),
      pop: Math.max(...countries.map((c) => c.poblacion || 0), 1),
      pc: Math.max(...countries.map((c) => c.pib_pc || 0), 1),
      idh: Math.max(...countries.map((c) => parseIdh(c.idh) || 0), 0.01),
      tiles: Math.max(...countries.map((c) => c.tiles || 0), 1),
    };
    return countries.map((c) => {
      const idh = parseIdh(c.idh) || 0;
      const score =
        0.4 * ((c.pib_m || 0) / max.pib) +
        0.25 * ((c.poblacion || 0) / max.pop) +
        0.15 * ((c.pib_pc || 0) / max.pc) +
        0.1 * (idh / max.idh) +
        0.1 * ((c.tiles || 0) / max.tiles);
      return { key: c.key, es: c.es, score, c };
    });
  }

  function winnerOn(countries, getter, higherBetter) {
    let best = null,
      bestV = null;
    countries.forEach((c) => {
      const v = getter(c);
      if (v == null || !isFinite(v)) return;
      if (bestV == null || (higherBetter ? v > bestV : v < bestV)) {
        bestV = v;
        best = c;
      }
    });
    return { country: best, value: bestV };
  }

  function updateResults() {
    const countries = getSelectedCountries();
    const mode = document.querySelector('input[name="mode"]:checked')?.value || "alliance";
    const panel = document.getElementById("results");
    const title = document.getElementById("resultsTitle");

    if (countries.length < 1) {
      title.textContent = "Resultados";
      panel.innerHTML =
        '<p class="empty">Elige países en la lista. Con 2+ se activa combinación y guerra.</p>';
      return;
    }

    let html =
      '<div class="table-wrap"><table class="grid-table"><thead><tr><th>País</th><th>Población</th><th>PIB M$</th><th>PIB/c</th><th>IDH</th><th>Ciudades</th><th>Tiles</th></tr></thead><tbody>';
    countries.forEach((c, i) => {
      html +=
        "<tr><td><span class='dot' style='background:" +
        COLORS[i % COLORS.length] +
        "'></span> <b>" +
        c.es +
        "</b></td><td>" +
        c.poblacion_fmt +
        "</td><td>" +
        c.pib_m_fmt +
        "</td><td>" +
        c.pib_pc_fmt +
        "</td><td>" +
        c.idh +
        "</td><td>" +
        (c.cities || []).length +
        "</td><td>" +
        c.tiles +
        "</td></tr>";
    });
    html += "</tbody></table></div>";

    if (mode === "alliance") {
      title.textContent = "Alianza / Combinación (" + countries.length + " países)";
      const a = alliance(countries);
      html +=
        '<div class="combo-card">' +
        "<h3>Total combinado</h3>" +
        '<div class="stats">' +
        '<div class="stat"><div class="k">Población</div><div class="v">' +
        fmtPop(a.poblacion) +
        "</div><div class='y'>" +
        fmtNum(a.poblacion) +
        " hab.</div></div>" +
        '<div class="stat"><div class="k">PIB nominal</div><div class="v">' +
        fmtNum(a.pib_m) +
        '</div><div class="y">millones USD</div></div>' +
        '<div class="stat"><div class="k">PIB per cápita</div><div class="v">' +
        fmtNum(a.pib_pc) +
        '</div><div class="y">ponderado</div></div>' +
        '<div class="stat"><div class="k">Tiles (juego)</div><div class="v">' +
        a.tiles +
        '</div><div class="y">suma de módulos</div></div>' +
        '<div class="stat"><div class="k">Ciudades en mapa</div><div class="v">' +
        a.nCities +
        '</div><div class="y">geolocalizadas</div></div>' +
        '<div class="stat"><div class="k">Área</div><div class="v">' +
        (a.area_km2 != null ? fmtNum(a.area_km2) + " km²" : "N/D") +
        "</div></div>" +
        '<div class="stat"><div class="k">IDH medio</div><div class="v">' +
        (a.idh != null ? a.idh.toFixed(3) : "N/D") +
        '</div><div class="y">pond. población</div></div>' +
        '<div class="stat"><div class="k">Deuda media</div><div class="v">' +
        (a.deuda_pct != null ? a.deuda_pct.toFixed(1) + "%" : "N/D") +
        '</div><div class="y">pond. PIB</div></div>' +
        "</div>" +
        '<p class="note">Usa los botones 🏙 en cada chip para apagar/encender ciudades de ese país.</p>' +
        "</div>";
    } else {
      title.textContent = "Guerra / ¿Quién gana?";
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
          ? "⚔ Empate técnico entre <b>" +
            champ.es +
            "</b> y <b>" +
            (runner ? runner.es : "") +
            "</b>"
          : "🏆 Gana <b>" +
            champ.es +
            "</b> (score " +
            (champ.score * 100).toFixed(1) +
            " pts)") +
        "</div>";

      html += '<div class="score-list">';
      scores.forEach((s, i) => {
        const pct = Math.round(s.score * 100);
        const col = COLORS[selected.indexOf(s.key) % COLORS.length];
        html +=
          '<div class="score-row">' +
          "<div class='score-head'><span><span class='dot' style='background:" +
          col +
          "'></span> " +
          (i + 1) +
          ". <b>" +
          s.es +
          "</b></span><span>" +
          pct +
          " pts</span></div>" +
          '<div class="bar"><i style="width:' +
          pct +
          "%;background:" +
          col +
          '"></i></div></div>';
      });
      html += "</div>";

      const cats = [
        { name: "Población", w: winnerOn(countries, (c) => c.poblacion, true), fmt: (v) => fmtPop(v) },
        { name: "PIB nominal", w: winnerOn(countries, (c) => c.pib_m, true), fmt: (v) => fmtNum(v) + " M$" },
        { name: "PIB per cápita", w: winnerOn(countries, (c) => c.pib_pc, true), fmt: (v) => fmtNum(v) + " $" },
        { name: "IDH", w: winnerOn(countries, (c) => parseIdh(c.idh), true), fmt: (v) => (v != null ? v.toFixed(3) : "N/D") },
        { name: "Ciudades en mapa", w: winnerOn(countries, (c) => (c.cities || []).length, true), fmt: (v) => String(v) },
        { name: "Tiles (territorio juego)", w: winnerOn(countries, (c) => c.tiles, true), fmt: (v) => String(v) },
        { name: "Menor deuda % PIB", w: winnerOn(countries, (c) => parseDeuda(c.deuda_pct), false), fmt: (v) => (v != null ? v.toFixed(1) + "%" : "N/D") },
      ];
      html += '<div class="duels"><h3>Duelos por indicador</h3>';
      cats.forEach((cat) => {
        const w = cat.w.country;
        html +=
          '<div class="duel"><span class="dn">' +
          cat.name +
          '</span><span class="dw">' +
          (w ? "✔ " + w.es + " <small>(" + cat.fmt(cat.w.value) + ")</small>" : "—") +
          "</span></div>";
      });
      html +=
        '</div><p class="note">Score = 40% PIB + 25% población + 15% PIB/c + 10% IDH + 10% tiles.</p>';
    }

    panel.innerHTML = html;
  }

  function updateAll() {
    updateMap();
    updateResults();
    document.getElementById("selCount").textContent = selected.length + " seleccionados";
  }

  function preset(keys) {
    selected = keys.filter((k) => data[k]);
    cityOn = {};
    selected.forEach((k) => (cityOn[k] = true));
    renderPicker();
    updateChips();
    updateAll();
  }

  function init() {
    initMap();
    renderPicker();
    updateChips();
    updateAll();

    document.getElementById("search").addEventListener("input", renderPicker);
    document.querySelectorAll('input[name="mode"]').forEach((r) => {
      r.addEventListener("change", updateResults);
    });
    document.getElementById("btnClear").addEventListener("click", () => {
      selected = [];
      cityOn = {};
      renderPicker();
      updateChips();
      updateAll();
    });
    document.getElementById("btnFRIT").addEventListener("click", () =>
      preset(["France", "Italy"])
    );
    document.getElementById("btnUK").addEventListener("click", () =>
      preset(["UnitedKingdom", "France", "Germany"])
    );
    document.getElementById("btnBRAR").addEventListener("click", () =>
      preset(["Brazil", "Argentina", "Chile"])
    );

    const btnCities = document.getElementById("btnToggleCities");
    if (btnCities) {
      btnCities.addEventListener("click", () => {
        showAllCities = !showAllCities;
        btnCities.textContent = showAllCities ? "Ocultar todas las ciudades" : "Mostrar todas las ciudades";
        // sync per-country
        selected.forEach((k) => (cityOn[k] = showAllCities));
        updateChips();
        updateMap();
      });
    }
    const btnNames = document.getElementById("btnToggleNames");
    if (btnNames) {
      btnNames.addEventListener("click", () => {
        showCityNames = !showCityNames;
        btnNames.textContent = showCityNames ? "Ocultar nombres" : "Mostrar nombres";
        updateMap();
      });
    }
    const btnBorders = document.getElementById("btnToggleBorders");
    if (btnBorders) {
      btnBorders.addEventListener("click", () => {
        showBorders = !showBorders;
        btnBorders.textContent = showBorders ? "Ocultar contornos" : "Mostrar contornos";
        updateMap();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else init();
})();
