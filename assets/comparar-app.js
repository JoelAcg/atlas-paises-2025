(function () {
  const C = AtlasCore;
  let index = null;
  let mapA, mapB, layerA, layerB;

  function optHtml(list, selected) {
    return list
      .map(
        (c) =>
          '<option value="' +
          C.escapeHtml(c.key) +
          '"' +
          (c.key === selected ? " selected" : "") +
          ">" +
          C.escapeHtml(c.es) +
          "</option>"
      )
      .join("");
  }

  function mkMap(id) {
    const m = L.map(id, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: 1,
      maxZoom: 12,
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OSM &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(m);
    m.setView([20, 0], 2);
    return m;
  }

  async function loadSide(key, map, layerRef, color, titleEl, flagEl, statsEl) {
    const meta = index.countries.find((c) => c.key === key) || index.countries[0];
    // index.json is array in countries
    const pack = await C.fetchJson("data/countries/" + encodeURIComponent(key) + ".json");
    titleEl.querySelector("span").textContent = pack.es;
    flagEl.src = pack.flagUrl40 || pack.flagUrl;
    flagEl.alt = pack.es;

    if (layerRef.layer) map.removeLayer(layerRef.layer);
    layerRef.layer = null;

    if (pack.borderUrl) {
      try {
        const geo = await C.fetchJson(pack.borderUrl);
        layerRef.layer = L.geoJSON(geo, {
          style: {
            color: "#1a2332",
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.55,
          },
        }).addTo(map);
        const b = layerRef.layer.getBounds();
        if (b.isValid()) map.fitBounds(b.pad(0.08), { maxZoom: 7, animate: true });
      } catch (e) {
        map.setView(pack.center || [20, 0], 4);
      }
    } else {
      map.setView(pack.center || [20, 0], 4);
    }

    // cities
    if (layerRef.cities) map.removeLayer(layerRef.cities);
    layerRef.cities = L.layerGroup().addTo(map);
    (pack.cities || []).forEach((city) => {
      if (city.lat == null) return;
      L.circleMarker([city.lat, city.lon], {
        radius: city.capital ? 6 : 3,
        color: "#fff",
        weight: 1,
        fillColor: city.capital ? "#d90429" : color,
        fillOpacity: 0.9,
      })
        .bindPopup(C.escapeHtml(city.name))
        .addTo(layerRef.cities);
    });

    const mil = pack.military || {};
    statsEl.innerHTML =
      row("Población", pack.poblacion_fmt) +
      row("PIB M$", pack.pib_m_fmt) +
      row("PIB/c", pack.pib_pc_fmt) +
      row("IDH", pack.idh) +
      row("Área", pack.area_km2 != null ? C.fmtNum(pack.area_km2) + " km²" : "N/D") +
      row("Tiles", String(pack.tiles)) +
      row("Poder proxy", mil.power_index != null ? String(mil.power_index) : "N/D") +
      row("Tropas est.", mil.troops_est != null ? C.fmtPop(mil.troops_est) : "N/D");

    return pack;
  }

  function row(k, v) {
    return (
      '<div class="s"><div class="k">' +
      C.escapeHtml(k) +
      '</div><div class="v">' +
      C.escapeHtml(String(v)) +
      "</div></div>"
    );
  }

  function vs(a, b) {
    const duels = [
      { n: "Población", av: a.poblacion, bv: b.poblacion, high: true },
      { n: "PIB", av: a.pib_m, bv: b.pib_m, high: true },
      { n: "PIB/c", av: a.pib_pc, bv: b.pib_pc, high: true },
      {
        n: "IDH",
        av: C.parseIdh(a.idh),
        bv: C.parseIdh(b.idh),
        high: true,
      },
      {
        n: "Poder",
        av: a.military && a.military.power_index,
        bv: b.military && b.military.power_index,
        high: true,
      },
    ];
    let aw = 0,
      bw = 0;
    const parts = duels.map((d) => {
      if (d.av == null || d.bv == null) return d.n + ": —";
      const aWins = d.high ? d.av > d.bv : d.av < d.bv;
      const bWins = d.high ? d.bv > d.av : d.bv < d.av;
      if (aWins) aw++;
      if (bWins) bw++;
      const w = aWins ? a.es : bWins ? b.es : "empate";
      return d.n + ": <span class='winner'>" + C.escapeHtml(w) + "</span>";
    });
    document.getElementById("vsBanner").innerHTML =
      C.escapeHtml(a.es) +
      " vs " +
      C.escapeHtml(b.es) +
      " · duelos " +
      aw +
      "–" +
      bw +
      "<br><small style='font-weight:500'>" +
      parts.join(" · ") +
      "</small>";
  }

  async function refresh() {
    const ka = document.getElementById("selA").value;
    const kb = document.getElementById("selB").value;
    const [pa, pb] = await Promise.all([
      loadSide(
        ka,
        mapA,
        layerA,
        "#7ea6e0",
        document.getElementById("titleA"),
        document.getElementById("flagA"),
        document.getElementById("statsA")
      ),
      loadSide(
        kb,
        mapB,
        layerB,
        "#e57373",
        document.getElementById("titleB"),
        document.getElementById("flagB"),
        document.getElementById("statsB")
      ),
    ]);
    vs(pa, pb);
    history.replaceState(
      null,
      "",
      C.shareUrl({ a: ka, b: kb })
    );
    setTimeout(() => {
      mapA.invalidateSize();
      mapB.invalidateSize();
    }, 100);
  }

  async function boot() {
    C.wireChrome();
    index = await C.fetchJson("data/index.json");
    const list = index.countries.slice().sort((a, b) => a.es.localeCompare(b.es, "es"));
    const params = new URLSearchParams(location.search);
    const a0 = params.get("a") || "France";
    const b0 = params.get("b") || "Germany";
    document.getElementById("selA").innerHTML = optHtml(list, a0);
    document.getElementById("selB").innerHTML = optHtml(list, b0);
    mapA = mkMap("mapA");
    mapB = mkMap("mapB");
    layerA = {};
    layerB = {};
    document.getElementById("btnGo").addEventListener("click", () => refresh());
    document.getElementById("btnSwap").addEventListener("click", () => {
      const a = document.getElementById("selA");
      const b = document.getElementById("selB");
      const t = a.value;
      a.value = b.value;
      b.value = t;
      refresh();
    });
    document.getElementById("btnShare").addEventListener("click", async () => {
      const ok = await C.copyText(location.href);
      alert(ok ? "Enlace copiado" : location.href);
    });
    document.getElementById("selA").addEventListener("change", refresh);
    document.getElementById("selB").addEventListener("change", refresh);
    await refresh();
  }

  boot().catch((e) => {
    console.error(e);
    const msg = (e && e.message) || String(e);
    const file = location.protocol === "file:";
    document.getElementById("vsBanner").innerHTML =
      "<div style='text-align:left;max-width:520px;margin:0 auto'>" +
      "<b>No se pudieron cargar los datos</b><br><br>" +
      (file
        ? "Causa: abriste el HTML con <b>doble clic</b> (<code>file://</code>). " +
          "Chrome/Edge <b>bloquean</b> cargar archivos JSON así.<br><br>"
        : "Causa técnica: <code>" +
          (window.AtlasCore ? AtlasCore.escapeHtml(msg) : msg) +
          "</code><br><br>") +
      "<b>Qué hacer:</b><ol style='text-align:left'>" +
      "<li>Carpeta <code>Mapas_HTML_2025</code></li>" +
      "<li>Ejecuta <code>serve-atlas.bat</code> (deja la ventana abierta)</li>" +
      "<li>Entra a <a href='http://127.0.0.1:5500/comparar.html'>http://127.0.0.1:5500/comparar.html</a></li>" +
      "</ol>" +
      "Si falta data: en <code>Documentos\\Paises</code> → <code>node _build_atlas_v6.js</code>" +
      "</div>";
  });
})();
