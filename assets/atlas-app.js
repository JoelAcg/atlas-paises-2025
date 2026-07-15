/** SPA country viewer — atlas.html?pais=Key */
(function () {
  const C = window.AtlasCore;
  const params = new URLSearchParams(location.search);
  let key = params.get("pais") || params.get("country") || "Afghanistan";

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
    setTimeout(() => el.classList.remove("show"), 2200);
  }

  function basePath() {
    // atlas.html is at Mapas_HTML_2025 root
    return "";
  }

  async function loadPack(k) {
    const url = basePath() + "data/countries/" + encodeURIComponent(k) + ".json";
    return C.fetchJson(url);
  }

  function renderShell(pack) {
    document.title = pack.es + " — Atlas 2025";
    document.getElementById("flagImg").src = pack.flagUrl;
    document.getElementById("flagImg").alt = "Bandera " + pack.es;
    document.getElementById("titleName").textContent = pack.es;
    document.getElementById("subLine").textContent =
      (pack.regions?.length || 0) +
      " regiones · " +
      pack.tiles +
      " tiles · capital " +
      pack.capital;
    document.getElementById("badgeTiles").innerHTML =
      "<strong>" + pack.tiles + "</strong> tiles";
    document.getElementById("badgeCap").innerHTML =
      C.t("capital") + ": <strong>" + C.escapeHtml(pack.capital) + "</strong>";
    document.getElementById("badgeReg").innerHTML =
      C.t("regions") +
      ": <strong>" +
      (pack.regions?.length || 0) +
      "</strong>";
    document.getElementById("mapTitle").textContent = "Mapa atlas de " + pack.es;
    document.getElementById("frameT").textContent = pack.es;
    document.getElementById("frameS").textContent =
      (pack.regions?.length || 0) +
      " regiones/estados · capital en rojo";
    document.getElementById("map").setAttribute("aria-label", "Mapa de " + pack.es);

    const stats = document.getElementById("statsBox");
    stats.innerHTML =
      '<div class="stat"><div class="k">' +
      C.t("pop") +
      '</div><div class="v">' +
      C.escapeHtml(pack.poblacion_fmt) +
      '</div><div class="y">' +
      C.fmtNum(pack.poblacion) +
      " · " +
      C.escapeHtml(pack.anio || "") +
      "</div></div>" +
      '<div class="stat"><div class="k">PIB nominal (M USD)</div><div class="v">' +
      C.escapeHtml(pack.pib_m_fmt) +
      '</div><div class="y">Serie ' +
      C.escapeHtml(pack.anio || "") +
      "</div></div>" +
      '<div class="stat"><div class="k">PIB per cápita (USD)</div><div class="v">' +
      C.escapeHtml(pack.pib_pc_fmt) +
      '</div><div class="y">Nominal</div></div>' +
      '<div class="stat"><div class="k">Deuda % PIB · IDH</div><div class="v">' +
      C.escapeHtml(String(pack.deuda_pct)) +
      '</div><div class="y">IDH: ' +
      C.escapeHtml(String(pack.idh)) +
      "</div></div>";

    document.getElementById("metaRow").innerHTML =
      '<span class="chip">Área: <b>' +
      (pack.area_km2 != null ? C.fmtNum(pack.area_km2) + " km²" : "N/D") +
      "</b></span>" +
      '<span class="chip">Región: <b>' +
      C.escapeHtml(pack.region) +
      "</b></span>" +
      '<span class="chip">Capital real: <b>' +
      C.escapeHtml(pack.capital_real || pack.capital) +
      "</b></span>" +
      '<span class="chip">ISO: <b>' +
      C.escapeHtml(pack.iso2) +
      "</b></span>" +
      '<span class="chip">Clave: <b>' +
      C.escapeHtml(pack.key) +
      "</b></span>";

    // military + socio
    const mil = pack.military || {};
    const so = pack.socio || {};
    document.getElementById("extraStats").innerHTML =
      '<div class="section-title">Indicadores ampliados (proxy educativo)</div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="k">Gasto defensa est.</div><div class="v">' +
      (mil.defense_pct_pib != null ? mil.defense_pct_pib + "%" : "N/D") +
      '</div><div class="y">' +
      C.fmtNum(mil.defense_m_usd) +
      " M$ · no oficial</div></div>" +
      '<div class="stat"><div class="k">Efectivos est.</div><div class="v">' +
      C.fmtPop(mil.troops_est) +
      '</div><div class="y">proxy población/IDH</div></div>' +
      '<div class="stat"><div class="k">Poder (índice)</div><div class="v">' +
      (mil.power_index ?? "N/D") +
      '</div><div class="y">combinado educativo</div></div>' +
      '<div class="stat"><div class="k">Esp. vida / Alfabet.</div><div class="v">' +
      (so.life_expectancy ?? "—") +
      " / " +
      (so.literacy_pct != null ? so.literacy_pct + "%" : "—") +
      '</div><div class="y">proxy IDH</div></div>' +
      "</div>" +
      '<p class="note" style="font-size:.75rem;color:var(--muted);margin-top:8px">' +
      C.escapeHtml(mil.note || so.note || "") +
      "</p>";

    const leg = document.getElementById("regionLegend");
    if (pack.regions && pack.regions.length) {
      leg.innerHTML =
        '<div class="section-title">' +
        C.t("regions") +
        " (" +
        pack.regions.length +
        ")</div>" +
        '<div class="region-legend">' +
        pack.regions
          .map(
            (r) =>
              '<span class="item"><span class="sw" style="background:' +
              C.escapeHtml(r.color) +
              '"></span>' +
              C.escapeHtml(r.name) +
              "</span>"
          )
          .join("") +
        "</div>";
    } else leg.innerHTML = "";

    document.getElementById("sources").innerHTML =
      '<div class="section-title">' +
      C.t("sources") +
      "</div><ul class=\"sources\">" +
      (pack.fuentes || [])
        .map((f) => "<li>" + C.escapeHtml(f) + "</li>")
        .join("") +
      "<li>Tiles: DataPaises · " +
      C.escapeHtml(pack.key) +
      "</li>" +
      "<li>Regiones: Natural Earth admin1 · Contorno: borders/" +
      C.escapeHtml(pack.iso) +
      ".json</li>" +
      '<li><a href="https://datosmacro.expansion.com/" target="_blank" rel="noopener">Datosmacro</a> · ' +
      '<a href="https://data.worldbank.org/" target="_blank" rel="noopener">Banco Mundial</a> · ' +
      '<a href="https://www.cia.gov/the-world-factbook/" target="_blank" rel="noopener">CIA Factbook</a></li>' +
      "</ul>";

    // cities table
    const tbody = document.getElementById("tilesBody");
    const cities = pack.cities || [];
    tbody.innerHTML = cities
      .map((c) => {
        const ok = c.lat != null && c.lon != null && !c.outOfCountry;
        return (
          '<tr data-tile-n="' +
          c.n +
          '" data-name="' +
          C.escapeHtml(c.name) +
          '" tabindex="0" role="button" aria-label="' +
          C.escapeHtml(c.name) +
          '">' +
          '<td><span class="num' +
          (c.capital ? " capital" : "") +
          '">' +
          c.n +
          "</span></td>" +
          "<td><strong>" +
          C.escapeHtml(c.name) +
          "</strong> " +
          (c.capital
            ? '<span class="tag capital">capital</span> '
            : "") +
          (ok
            ? '<span class="tag ok">en mapa</span>'
            : c.outOfCountry
            ? '<span class="tag out">fuera</span>'
            : '<span class="tag">sin geo</span>') +
          "</td>" +
          "<td>" +
          (ok
            ? c.lat.toFixed(4) + ", " + c.lon.toFixed(4)
            : "—") +
          "</td>" +
          "<td>" +
          C.escapeHtml(c.geoLabel || (ok ? c.name : "—")) +
          "</td></tr>"
        );
      })
      .join("");
    document.getElementById("cityBadge").textContent =
      cities.filter((c) => c.lat != null).length + " en el mapa";
  }

  async function boot() {
    C.wireChrome();
    C.injectToolbar();
    document.getElementById("loading").style.display = "";
    try {
      const pack = await loadPack(key);
      key = pack.key;
      renderShell(pack);

      // resolve geo URLs relative to atlas root
      const regionsUrl = pack.regionsUrl || null;
      const borderUrl = pack.borderUrl || null;

      await window.PaisesMap.init({
        center: pack.center,
        zoom: pack.zoom,
        iso: pack.iso,
        title: pack.es,
        fillColor: "#8fd19e",
        ocean: "#7eb8dc",
        regionsUrl: regionsUrl,
        borderUrl: borderUrl,
        points: (pack.cities || []).map((c) => ({
          n: c.n,
          name: c.name,
          lat: c.lat,
          lon: c.lon,
          capital: !!c.capital,
          outOfCountry: !!c.outOfCountry,
          geoLabel: c.geoLabel,
        })),
        poblacion_fmt: pack.poblacion_fmt,
        pib_m_fmt: pack.pib_m_fmt,
        defaultTerrain: "satellite",
      });

      document.getElementById("loading").style.display = "none";
      document.getElementById("mainContent").hidden = false;

      // country select
      const sel = document.getElementById("countryJump");
      if (sel && !sel.dataset.ready) {
        const idx = await C.fetchJson("data/index.json");
        sel.innerHTML = idx.countries
          .map(
            (c) =>
              '<option value="' +
              C.escapeHtml(c.key) +
              '"' +
              (c.key === key ? " selected" : "") +
              ">" +
              C.escapeHtml(c.es) +
              "</option>"
          )
          .join("");
        sel.dataset.ready = "1";
        sel.addEventListener("change", () => {
          location.href = "atlas.html?pais=" + encodeURIComponent(sel.value);
        });
      }

      document.getElementById("btnShare")?.addEventListener("click", async () => {
        const url = C.shareUrl({ pais: key });
        const ok = await C.copyText(url);
        toast(ok ? "Enlace copiado" : url);
      });
      document.getElementById("btnTweet")?.addEventListener("click", () => {
        if (window.AtlasExtras) {
          AtlasExtras.shareTwitter(
            "Mapa de " + pack.es + " — Atlas 2025",
            C.shareUrl({ pais: key })
          );
        }
      });
      document.getElementById("btnFav")?.addEventListener("click", () => {
        if (!window.AtlasExtras) return;
        const on = AtlasExtras.toggleFav(key);
        document.getElementById("btnFav").textContent = on ? "★ Favorito" : "☆ Favorito";
        toast(on ? "Añadido a favoritos" : "Quitado de favoritos");
      });
      if (window.AtlasExtras && document.getElementById("btnFav")) {
        document.getElementById("btnFav").textContent = AtlasExtras.isFav(key)
          ? "★ Favorito"
          : "☆ Favorito";
      }
      document.getElementById("btnExport")?.addEventListener("click", async () => {
        const shell = document.querySelector(".map-shell");
        await C.exportMapPng(shell || document.getElementById("map"), pack.key + "-mapa.png");
      });
      document.getElementById("btnWiki")?.addEventListener("click", () => {
        window.open(
          "https://es.wikipedia.org/wiki/" + encodeURIComponent(pack.es),
          "_blank",
          "noopener"
        );
      });
      // Wikipedia extract (async, optional)
      if (window.AtlasExtras && document.getElementById("wikiBox")) {
        AtlasExtras.wikiSummary(pack.es).then((w) => {
          if (!w || !w.extract) {
            document.getElementById("wikiBox").innerHTML =
              '<p class="muted" style="font-size:.85rem">Sin resumen Wikipedia (offline o bloqueado).</p>';
            return;
          }
          document.getElementById("wikiBox").innerHTML =
            '<div class="section-title">Wikipedia</div>' +
            (w.thumbnail
              ? '<img src="' +
                C.escapeHtml(w.thumbnail) +
                '" alt="" style="float:right;max-width:96px;margin:0 0 8px 8px;border-radius:8px;border:1px solid var(--line)"/>'
              : "") +
            '<p class="desc">' +
            C.escapeHtml(w.extract) +
            '</p><p><a href="' +
            C.escapeHtml(w.url) +
            '" target="_blank" rel="noopener">Leer en Wikipedia →</a></p>';
        });
      }
    } catch (e) {
      console.error(e);
      const file = location.protocol === "file:";
      document.getElementById("loading").innerHTML =
        '<div class="alert" style="text-align:left;max-width:560px;margin:0 auto">' +
        "<b>No se pudo cargar el país</b> <code>" +
        C.escapeHtml(key) +
        "</code><br><br>" +
        (file
          ? "Estás en <code>file://</code> (doble clic). El navegador bloquea los JSON.<br><br>" +
            "<b>Solución:</b> ejecuta <code>serve-atlas.bat</code> y abre " +
            "<a href='http://127.0.0.1:5500/atlas.html?pais=" +
            encodeURIComponent(key) +
            "'>http://127.0.0.1:5500/atlas.html?pais=" +
            C.escapeHtml(key) +
            "</a>"
          : "Detalle: " +
            C.escapeHtml(e.message || String(e)) +
            "<br>¿Existe <code>data/countries/" +
            C.escapeHtml(key) +
            ".json</code>? Si no: <code>node _build_atlas_v6.js</code>") +
        '</div><p style="text-align:center"><a href="index.html">← Índice</a></p>';
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
