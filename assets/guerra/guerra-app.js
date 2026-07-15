/**
 * App Guerra RT — lobby, mapa, tropas, build, research, P2P
 */
(function () {
  const C = window.AtlasCore;
  const E = window.GuerraEngine;
  const CFG = window.GuerraConfig;

  let net = null;
  let state = null;
  let me = { peerId: null, name: "Comandante", role: null };
  let packs = {}; // countryKey -> pack
  let map, tileLayer, armyLayer, borderLayer, highlightLayer, linkLayer;
  let armyMarkers = {};
  let tileMarkers = {};
  let selectedArmyId = null;
  let selectedTileId = null;
  let moveMode = false;
  let tickTimer = null;
  let uiTab = "tropas";
  let countryList = [];
  let busy = false; // evita doble clic crear/unirse
  let mapFitted = false;
  let lastPhase = null;
  let basemapLayer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function showModal(show) {
    const m = $("setupModal");
    const g = $("gameUI");
    if (m) {
      // class is-open is the only thing that shows the modal (CSS)
      m.classList.toggle("is-open", !!show);
      m.hidden = !show;
      m.setAttribute("aria-hidden", show ? "false" : "true");
      // belt + suspenders against cached CSS
      m.style.setProperty("display", show ? "flex" : "none", "important");
      m.style.setProperty("visibility", show ? "visible" : "hidden", "important");
      m.style.setProperty("pointer-events", show ? "auto" : "none", "important");
      m.style.setProperty("opacity", show ? "1" : "0", "important");
      if (!show) {
        m.style.setProperty("z-index", "-1", "important");
      } else {
        m.style.setProperty("z-index", "10000", "important");
      }
    }
    if (g) {
      g.hidden = !!show;
      if (show) {
        g.style.setProperty("display", "none", "important");
      } else {
        g.style.removeProperty("display");
      }
    }
    // debug helper in console
    try {
      console.log("[guerra] showModal", show, m && m.className);
    } catch (e) {}
  }

  function setBusy(on, msg) {
    busy = !!on;
    const create = $("btnCreate");
    const join = $("btnJoin");
    if (create) {
      create.disabled = on;
      create.textContent = on && msg && msg.indexOf("Creando") >= 0 ? "Creando…" : "Crear sala (Host)";
    }
    if (join) {
      join.disabled = on;
      join.textContent = on && msg && msg.indexOf("Uniendo") >= 0 ? "Conectando…" : "Unirse a sala";
    }
    let ov = $("busyOverlay");
    if (on) {
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "busyOverlay";
        ov.className = "busy-overlay";
        document.body.appendChild(ov);
      }
      ov.hidden = false;
      ov.textContent = msg || "Conectando…";
    } else if (ov) {
      ov.hidden = true;
    }
    const st = $("statusLine");
    if (st) st.textContent = on ? msg || "…" : "";
  }

  function toast(msg) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2500);
  }

  function isHost() {
    return me.role === "host";
  }

  function myCountry() {
    if (!state || !me.peerId) return null;
    return E.playerCountry(state, me.peerId);
  }

  function applyState(s) {
    // guests: sync country list ONLY from host availableCountries
    if (s && s.availableCountries && s.availableCountries.length) {
      syncCountryListFromHost(s.availableCountries);
    }
    if (s && s.phase === "playing" && lastPhase !== "playing") {
      mapFitted = false;
    }
    lastPhase = s && s.phase;
    state = s;
    renderAll();
  }

  async function syncCountryListFromHost(keys) {
    const want = keys.slice();
    const missing = want.filter((k) => !packs[k]);
    if (missing.length) {
      for (const key of missing) {
        try {
          packs[key] = await C.fetchJson(
            "data/countries/" + encodeURIComponent(key) + ".json"
          );
        } catch (e) {}
      }
    }
    countryList = want.map((key) => ({
      key,
      es: (packs[key] && packs[key].es) || key,
    }));
    // refresh lobby select if visible
    if (state && state.phase === "lobby") renderLobby();
  }

  function hostBroadcast() {
    if (isHost() && net && state) net.broadcastState(E.publicState(state));
  }

  function sendOrLocal(action) {
    if (isHost()) {
      state = E.dispatch(state, me.peerId, action);
      hostBroadcast();
      renderAll();
    } else if (net) {
      net.sendAction(action);
    }
  }

  // ─── Map ───────────────────────────────────────────────
  function initMap() {
    map = L.map("warMap", {
      zoomControl: true,
      worldCopyJump: false,
      minZoom: 2,
      maxZoom: 14,
      preferCanvas: true,
    }).setView([48, 10], 5);
    // mapa claro (mejor en PC y móvil que dark_all que a veces se ve “solo azul”)
    basemapLayer = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OSM &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);
    borderLayer = L.layerGroup().addTo(map);
    linkLayer = L.layerGroup().addTo(map);
    highlightLayer = L.layerGroup().addTo(map);
    tileLayer = L.layerGroup().addTo(map);
    armyLayer = L.layerGroup().addTo(map);
    setTimeout(() => {
      try {
        map.invalidateSize(true);
      } catch (e) {}
    }, 200);
  }

  function colorForCountry(key) {
    if (!state) return "#64748b";
    for (const p of Object.values(state.players || {})) {
      if (p.countryKey === key) return p.color || "#64748b";
    }
    return "#64748b";
  }

  function redrawMap() {
    if (!map || !state || state.phase === "lobby") return;
    borderLayer.clearLayers();
    linkLayer.clearLayers();
    highlightLayer.clearLayers();
    tileLayer.clearLayers();
    armyLayer.clearLayers();
    armyMarkers = {};
    tileMarkers = {};

    if (!state.adjacency) {
      try {
        E.buildAdjacency(state);
      } catch (e) {}
    }

    const keys = [
      ...new Set(
        Object.values(state.players || {})
          .map((p) => p.countryKey)
          .filter(Boolean)
      ),
    ];
    // borders (async once per pack)
    keys.forEach((k) => {
      const pack = packs[k];
      if (!pack) return;
      const drawBorder = (geo) => {
        if (!geo) return;
        L.geoJSON(geo, {
          style: {
            color: colorForCountry(k),
            weight: 2.5,
            fillColor: colorForCountry(k),
            fillOpacity: 0.28,
          },
          interactive: false,
        }).addTo(borderLayer);
      };
      if (pack.border) drawBorder(pack.border);
      else if (pack.borderUrl && !pack._borderLoading) {
        pack._borderLoading = true;
        C.fetchJson(pack.borderUrl)
          .then((geo) => {
            pack.border = geo;
            pack._borderLoading = false;
            // one redraw of borders only if still playing
            if (state && state.phase === "playing") {
              try {
                drawBorder(geo);
              } catch (e) {}
            }
          })
          .catch(() => {
            pack._borderLoading = false;
          });
      }
    });

    // links de adyacencia (estilo red de provincias) — sutiles
    const drawn = {};
    Object.keys(state.adjacency || {}).forEach((aId) => {
      const a = state.tiles[aId];
      if (!a) return;
      (state.adjacency[aId] || []).forEach((bId) => {
        const key = aId < bId ? aId + "|" + bId : bId + "|" + aId;
        if (drawn[key]) return;
        drawn[key] = true;
        const b = state.tiles[bId];
        if (!b) return;
        L.polyline(
          [
            [a.lat, a.lon],
            [b.lat, b.lon],
          ],
          {
            color: "#64748b",
            weight: 1,
            opacity: 0.35,
            dashArray: "4 6",
            interactive: false,
          }
        ).addTo(linkLayer);
      });
    });

    // highlights: tile seleccionado + vecinos válidos para mover
    const army =
      selectedArmyId && state.armies[selectedArmyId]
        ? state.armies[selectedArmyId]
        : null;
    const fromTileId = army ? army.tileId : selectedTileId;
    const neigh = fromTileId ? E.neighbors(state, fromTileId) : [];

    if (fromTileId && state.tiles[fromTileId]) {
      const ft = state.tiles[fromTileId];
      L.circleMarker([ft.lat, ft.lon], {
        radius: 18,
        color: "#22c55e",
        weight: 4,
        fillColor: "#4ade80",
        fillOpacity: 0.35,
        interactive: false,
      }).addTo(highlightLayer);
    }
    neigh.forEach((nid) => {
      const t = state.tiles[nid];
      if (!t) return;
      const enemy = t.owner !== myCountry();
      L.circleMarker([t.lat, t.lon], {
        radius: 15,
        color: enemy ? "#ef4444" : "#eab308",
        weight: 3,
        fillColor: enemy ? "#f87171" : "#fde047",
        fillOpacity: 0.45,
        interactive: false,
      }).addTo(highlightLayer);
    });

    // tiles (casillas = ciudades del módulo)
    Object.values(state.tiles || {}).forEach((t) => {
      if (t.lat == null || t.lon == null) return;
      const col = colorForCountry(t.owner);
      const isSel = t.id === fromTileId || t.id === selectedTileId;
      const isNeigh = neigh.indexOf(t.id) >= 0;
      const r = isSel ? 14 : t.capital ? 11 : isNeigh ? 10 : 7;
      const m = L.circleMarker([t.lat, t.lon], {
        radius: r,
        color: isSel ? "#16a34a" : isNeigh ? "#ca8a04" : "#0f172a",
        weight: isSel ? 4 : 2,
        fillColor: isSel ? "#22c55e" : col,
        fillOpacity: isSel ? 0.95 : 0.9,
      }).addTo(tileLayer);
      m.bindTooltip(
        "<b>Tile: " +
          t.name +
          (t.capital ? " ★" : "") +
          "</b><br>Dueño: " +
          ((state.countries[t.owner] || {}).es || t.owner) +
          (isNeigh ? "<br>➜ Destino adyacente" : ""),
        { sticky: true, direction: "top" }
      );
      m.on("click", () => onTileClick(t.id));
      tileMarkers[t.id] = m;
    });

    // armies — bubbles grandes (móvil)
    Object.values(state.armies || {}).forEach((a) => {
      if (a.lat == null || a.lon == null) return;
      const col = colorForCountry(a.country);
      const n = E.totalUnits(a.units);
      const moving = !!a.moving;
      let eta = "";
      if (moving) {
        const left = Math.max(0, (a.moving.endsAt - state.now) / 1000);
        eta = Math.ceil(left) + "s → " + (a.moving.toName || "");
      }
      const mine = a.country === myCountry();
      const html =
        '<div class="army-bubble' +
        (moving ? " moving" : "") +
        (selectedArmyId === a.id ? " sel" : "") +
        (mine ? " mine" : "") +
        '" style="background:' +
        col +
        '">' +
        n +
        (eta ? '<div class="eta">' + eta + "</div>" : "") +
        "</div>";
      const icon = L.divIcon({
        className: "army-marker",
        html,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([a.lat, a.lon], {
        icon,
        zIndexOffset: moving ? 3000 : mine ? 2000 : 1000,
        keyboard: true,
        title: (state.countries[a.country] || {}).es + " · " + n,
      }).addTo(armyLayer);
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        onArmyClick(a.id);
      });
      armyMarkers[a.id] = marker;
    });

    // fit SOLO una vez al empezar (no cada tick — eso rompía el mapa en PC)
    if (!mapFitted) {
      const latlngs = Object.values(state.tiles || {})
        .filter((t) => t.lat != null)
        .map((t) => [t.lat, t.lon]);
      if (latlngs.length) {
        try {
          map.fitBounds(latlngs, { padding: [36, 36], maxZoom: 7 });
          mapFitted = true;
          setTimeout(() => map.invalidateSize(true), 100);
        } catch (e) {}
      }
    }
  }

  function onArmyClick(armyId) {
    const a = state.armies[armyId];
    if (!a) return;
    if (a.country !== myCountry()) {
      toast("Ese ejército no es tuyo");
      return;
    }
    if (a.moving || a.inBattle) {
      toast(a.moving ? "Ya va en ruta" : "Está en combate");
      return;
    }
    selectedArmyId = armyId;
    moveMode = true;
    const ban = $("selBanner");
    if (ban) {
      ban.hidden = false;
      ban.innerHTML =
        "📦 Ejército (" +
        E.totalUnits(a.units) +
        " u.) — elige <b>destino abajo</b> o toca un tile del mapa " +
        '<button type="button" class="war-btn" id="btnCancelMove2">Cancelar</button>';
      const c2 = $("btnCancelMove2");
      if (c2)
        c2.onclick = () => {
          moveMode = false;
          selectedArmyId = null;
          ban.hidden = true;
          renderSide();
        };
    }
    uiTab = "tropas";
    renderSide();
    // scroll comando into view on mobile
    const side = $("sideBody");
    if (side) side.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function onTileClick(tileId) {
    selectedTileId = tileId;
    window.__selectedTileId = tileId;
    const t = state.tiles[tileId];
    if (moveMode && selectedArmyId) {
      const army = state.armies[selectedArmyId];
      if (!army) return;
      // permitir clic en vecino O en cualquier tile (ruta)
      doMove(selectedArmyId, tileId);
      return;
    }
    // clic en tile propio sin mover: seleccionar para construir
    if (t && t.owner === myCountry()) {
      // si hay ejército mío ahí, selecciónalo
      const mine = Object.values(state.armies || {}).find(
        (a) =>
          a.country === myCountry() &&
          a.tileId === tileId &&
          !a.moving
      );
      if (mine) {
        onArmyClick(mine.id);
        return;
      }
      uiTab = "build";
      renderSide();
      redrawMap();
    } else {
      redrawMap();
    }
  }

  function doMove(armyId, toTileId) {
    const army = state.armies[armyId];
    if (!army) return;
    if (!state.adjacency) E.buildAdjacency(state);
    const path = E.findPath(state, army.tileId, toTileId);
    if (!path || path.length < 2) {
      toast("No hay ruta de tiles hacia ahí");
      redrawMap();
      return;
    }
    sendOrLocal({ type: "move", armyId, toTileId });
    moveMode = false;
    selectedArmyId = null;
    selectedTileId = toTileId;
    const ban = $("selBanner");
    if (ban) ban.hidden = true;
    const hops = path.length - 1;
    toast(
      hops === 1
        ? "Moviendo 1 tile 🚚"
        : "Ruta de " + hops + " tiles (automática) 🚚"
    );
    renderSide();
    redrawMap();
  }

  function destOptionsHtml(army) {
    if (!army || !state) return "";
    if (!state.adjacency) E.buildAdjacency(state);
    // Solo vecinos adyacentes (1 tile) — estilo HOI
    // + opción "ruta a…" para tiles lejanos (path automático)
    const neigh = E.neighbors(state, army.tileId)
      .map((id) => state.tiles[id])
      .filter(Boolean);
    neigh.sort((a, b) => a.name.localeCompare(b.name, "es"));
    const others = Object.values(state.tiles || {})
      .filter((t) => t.id !== army.tileId && neigh.every((n) => n.id !== t.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    let html =
      '<p class="hint"><b>Tiles</b> = casillas (nombre de ciudad). Solo se mueve a <b>tiles vecinos</b> (amarillo). Enemigo adyacente = rojo. Destino lejano = ruta automática tile a tile.</p>' +
      '<label class="move-label">1) Tile vecino (recomendado)</label>' +
      '<select id="destSelect" class="dest-select">' +
      '<option value="">— Elige tile adyacente —</option>';
    if (!neigh.length) {
      html += '<option value="" disabled>Sin vecinos (error de mapa)</option>';
    }
    neigh.forEach((t) => {
      const own =
        t.owner === myCountry()
          ? " · tuyo"
          : " · ⚔ enemigo (" +
            ((state.countries[t.owner] || {}).es || t.owner) +
            ")";
      html +=
        '<option value="' +
        t.id +
        '">→ ' +
        C.escapeHtml(t.name) +
        own +
        "</option>";
    });
    html += "</select>";
    html +=
      '<label class="move-label">2) O ruta a tile lejano</label>' +
      '<select id="destSelectFar" class="dest-select">' +
      '<option value="">— (opcional) destino final —</option>';
    others.forEach((t) => {
      const own =
        t.owner === myCountry()
          ? " · tuyo"
          : " · enemigo";
      html +=
        '<option value="' +
        t.id +
        '">' +
        C.escapeHtml(t.name) +
        own +
        "</option>";
    });
    html +=
      "</select>" +
      '<button type="button" class="war-btn primary big" id="btnConfirmMove">🚀 Mover por tiles</button>';
    return html;
  }

  // ─── Render panels ─────────────────────────────────────
  function renderLobby() {
    const box = $("lobbyPlayers");
    if (!box || !state) return;

    // Solo lista de países del HOST (availableCountries), nunca los 160
    if (state.availableCountries && state.availableCountries.length) {
      countryList = state.availableCountries.map((key) => ({
        key,
        es: (packs[key] && packs[key].es) || key,
      }));
    }

    box.innerHTML = Object.values(state.players)
      .map((p) => {
        const cname =
          (packs[p.countryKey] && packs[p.countryKey].es) ||
          p.countryKey ||
          "Sin país";
        return (
          '<div class="player-row">' +
          '<span class="dot" style="background:' +
          p.color +
          '"></span>' +
          "<div><b>" +
          C.escapeHtml(p.name) +
          "</b>" +
          (p.isHost ? " (host)" : "") +
          "<br><small>" +
          C.escapeHtml(cname) +
          (p.ready ? " · ✅ listo" : " · …") +
          "</small></div></div>"
        );
      })
      .join("");

    const sel = $("countrySelect");
    if (sel) {
      const taken = new Set(
        Object.values(state.players)
          .map((p) => p.countryKey)
          .filter(Boolean)
      );
      const mine = state.players[me.peerId];
      const list =
        countryList.length > 0
          ? countryList
          : (state.availableCountries || []).map((k) => ({ key: k, es: k }));
      sel.innerHTML =
        '<option value="">— Elige país de la partida —</option>' +
        list
          .map((c) => {
            const dis =
              taken.has(c.key) && (!mine || mine.countryKey !== c.key);
            return (
              '<option value="' +
              c.key +
              '"' +
              (mine && mine.countryKey === c.key ? " selected" : "") +
              (dis ? " disabled" : "") +
              ">" +
              C.escapeHtml(c.es) +
              (dis ? " (ocupado)" : "") +
              "</option>"
            );
          })
          .join("");
    }

    $("roomCodeShow").textContent = state.roomCode || net?.roomCode || "—";
    const startBtn = $("btnStart");
    if (startBtn) startBtn.style.display = isHost() ? "" : "none";

    // controles de lobby solo en lobby
    const lobbyCtrls = $("lobbyControls");
    if (lobbyCtrls) lobbyCtrls.hidden = state.phase !== "lobby";
    const roomBlock = $("roomBlock");
    if (roomBlock) {
      roomBlock.style.display = state.phase === "lobby" ? "" : "none";
    }
  }

  function renderSide() {
    const side = $("sideBody");
    if (!side || !state) return;
    if (state.phase === "lobby") {
      side.innerHTML =
        '<p class="hint">Elige país, pulsa Listo. El host inicia cuando todos estén listos (mín. 1).</p>';
      return;
    }
    if (state.phase === "ended") {
      side.innerHTML =
        "<h3>Fin de la partida</h3><p>Ganador: <b>" +
        C.escapeHtml((state.countries[state.winner] || {}).es || state.winner) +
        "</b></p>";
      return;
    }

    const ck = myCountry();
    const c = ck && state.countries[ck];
    if (!c) {
      side.innerHTML = "<p>Espectador / sin país</p>";
      return;
    }

    let html =
      '<div class="stat-grid">' +
      '<div class="s"><div class="k">Dinero</div><div class="v">$' +
      c.money +
      "</div></div>" +
      '<div class="s"><div class="k">Manpower</div><div class="v">' +
      c.manpower +
      "</div></div>" +
      '<div class="s"><div class="k">Tiles</div><div class="v">' +
      Object.values(state.tiles).filter((t) => t.owner === ck).length +
      "</div></div>" +
      '<div class="s"><div class="k">Ejércitos</div><div class="v">' +
      Object.values(state.armies).filter((a) => a.country === ck).length +
      "</div></div></div>";

    html +=
      '<div class="tabs-war">' +
      btnTab("tropas", "Tropas") +
      btnTab("build", "Construir") +
      btnTab("tech", "Investigar") +
      "</div>";

    if (uiTab === "tropas") {
      const armies = Object.values(state.armies).filter((a) => a.country === ck);
      if (!armies.length) html += "<p class='hint'>Sin ejércitos</p>";
      armies.forEach((a) => {
        const tile = state.tiles[a.tileId];
        const selected = selectedArmyId === a.id;
        html +=
          '<div class="army-card' +
          (selected ? " active" : "") +
          '">' +
          "<div><b>" +
          (tile ? tile.name : "?") +
          "</b> · " +
          E.totalUnits(a.units) +
          " u." +
          (a.moving ? " · 🚚 " + (a.moving.toName || "") : "") +
          (a.inBattle ? " · ⚔ combate" : "") +
          "</div><div class='unit-line'>" +
          Object.entries(a.units)
            .map(
              ([k, n]) =>
                (CFG.UNITS[k] ? CFG.UNITS[k].icon + " " : "") +
                n +
                " " +
                (CFG.UNITS[k] ? CFG.UNITS[k].name : k)
            )
            .join(" · ") +
          "</div>" +
          '<div class="btn-row">' +
          '<button type="button" class="war-btn primary big" data-sel="' +
          a.id +
          '">' +
          (selected ? "✓ Seleccionado" : "📍 Elegir y mover") +
          "</button>" +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="infanteria">+Inf</button>' +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="tanque">+Tan</button>' +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="avion">+Avi</button>' +
          '<button type="button" class="war-btn" data-split="' +
          a.id +
          '">Dividir</button>' +
          "</div>";
        if (selected && !a.moving && !a.inBattle) {
          html += '<div class="move-box">' + destOptionsHtml(a) + "</div>";
        }
        html += "</div>";
      });
    }

    if (uiTab === "build") {
      const tid = window.__selectedTileId;
      const tile = tid && state.tiles[tid];
      html +=
        '<p class="hint">Clic en un tile propio en el mapa, luego construye.</p>';
      if (tile && tile.owner === ck) {
        html += "<p><b>" + C.escapeHtml(tile.name) + "</b></p>";
        Object.entries(CFG.BUILDINGS).forEach(([id, b]) => {
          const has = tile.buildings[id];
          html +=
            '<div class="unit-row"><span>' +
            b.icon +
            " " +
            b.name +
            " · $" +
            b.cost +
            "</span>" +
            (has
              ? "<span>OK</span>"
              : '<button type="button" class="war-btn" data-build="' +
                id +
                '" data-tile="' +
                tile.id +
                '">Construir</button>') +
            "</div>";
        });
      }
    }

    if (uiTab === "tech") {
      if (c.research) {
        const left = Math.max(0, (c.research.endsAt - state.now) / 1000);
        html +=
          "<p>Investigando <b>" +
          C.escapeHtml(c.research.name) +
          "</b>… " +
          Math.ceil(left) +
          "s</p>";
      }
      Object.entries(CFG.TECHS).forEach(([id, t]) => {
        const done = c.techs[id];
        html +=
          '<div class="unit-row"><span>' +
          C.escapeHtml(t.name) +
          " · $" +
          t.cost +
          "</span>" +
          (done
            ? "<span>✅</span>"
            : '<button type="button" class="war-btn" data-tech="' +
              id +
              '" ' +
              (c.research ? "disabled" : "") +
              ">Investigar</button>") +
          "</div>";
      });
    }

    html +=
      '<div class="section-title" style="margin-top:12px">Registro</div><div class="log-box">' +
      (state.log || [])
        .slice(0, 12)
        .map((l) => "<div>" + C.escapeHtml(l.msg) + "</div>")
        .join("") +
      "</div>";

    side.innerHTML = html;

    side.querySelectorAll("[data-sel]").forEach((b) =>
      b.addEventListener("click", () => onArmyClick(b.getAttribute("data-sel")))
    );
    side.querySelectorAll("[data-rec]").forEach((b) =>
      b.addEventListener("click", () =>
        sendOrLocal({
          type: "recruit",
          armyId: b.getAttribute("data-rec"),
          unit: b.getAttribute("data-u"),
          amount: 5,
        })
      )
    );
    side.querySelectorAll("[data-split]").forEach((b) =>
      b.addEventListener("click", () =>
        sendOrLocal({
          type: "split",
          armyId: b.getAttribute("data-split"),
          portion: 0.5,
        })
      )
    );
    side.querySelectorAll("[data-build]").forEach((b) =>
      b.addEventListener("click", () =>
        sendOrLocal({
          type: "build",
          tileId: b.getAttribute("data-tile"),
          building: b.getAttribute("data-build"),
        })
      )
    );
    side.querySelectorAll("[data-tech]").forEach((b) =>
      b.addEventListener("click", () =>
        sendOrLocal({ type: "research", techId: b.getAttribute("data-tech") })
      )
    );
    side.querySelectorAll("[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        uiTab = b.getAttribute("data-tab");
        renderSide();
      })
    );
    const conf = $("btnConfirmMove");
    if (conf) {
      conf.addEventListener("click", () => {
        const near = $("destSelect") && $("destSelect").value;
        const far = $("destSelectFar") && $("destSelectFar").value;
        const v = near || far;
        if (!v || !selectedArmyId) {
          toast("Elige un tile destino (vecino o ruta)");
          return;
        }
        doMove(selectedArmyId, v);
      });
    }
  }

  function btnTab(id, label) {
    return (
      '<button type="button" class="war-btn' +
      (uiTab === id ? " on" : "") +
      '" data-tab="' +
      id +
      '">' +
      label +
      "</button>"
    );
  }

  function renderAll() {
    if (!state) return;
    document.body.dataset.phase = state.phase;
    const pl = $("phaseLabel");
    if (pl) {
      pl.textContent =
        state.phase === "lobby"
          ? "Lobby"
          : state.phase === "playing"
          ? "EN VIVO"
          : "Fin";
    }

    // Lobby UI vs partida: en PC no dejar "Iniciar guerra" durante el juego
    const lobbyOnly = $("lobbyOnly");
    if (lobbyOnly) lobbyOnly.hidden = state.phase !== "lobby";
    const inGameLeft = $("inGameLeft");
    if (inGameLeft) inGameLeft.hidden = state.phase === "lobby";

    renderLobby();
    renderSide();
    if (state.phase === "playing" || state.phase === "ended") {
      redrawMap();
    }
    const bats = Object.values(state.battles || {});
    const bi = $("battleInfo");
    if (bi) {
      bi.textContent = bats.length
        ? "⚔ Batallas: " + bats.map((b) => b.tileName).join(", ")
        : state.phase === "playing"
        ? "Toca un ejército (lista o mapa) → elige destino → Enviar"
        : "";
    }
  }

  // ─── Host tick ─────────────────────────────────────────
  function startHostLoop() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!isHost() || !state) return;
      if (state.phase === "playing") {
        state = E.tick(state, Date.now());
        hostBroadcast();
        renderAll();
      }
    }, CFG.TICK_MS);
  }

  // ─── Load countries for lobby ──────────────────────────
  async function loadCountryOptions(keys) {
    countryList = [];
    packs = {};
    for (const key of keys) {
      try {
        const pack = await C.fetchJson("data/countries/" + encodeURIComponent(key) + ".json");
        packs[key] = pack;
        countryList.push({ key, es: pack.es || key });
      } catch (e) {
        console.warn(e);
      }
    }
    countryList.sort((a, b) => a.es.localeCompare(b.es, "es"));
  }

  async function ensurePacksForPlayers() {
    const keys = Object.values(state.players)
      .map((p) => p.countryKey)
      .filter(Boolean);
    for (const k of keys) {
      if (!packs[k]) {
        try {
          packs[k] = await C.fetchJson(
            "data/countries/" + encodeURIComponent(k) + ".json"
          );
        } catch (e) {}
      }
    }
  }

  // ─── Room flow ─────────────────────────────────────────
  function wireHostHandlers() {
    net.on("error", (e) => toast(String(e)));
    net.on("peerJoin", ({ peerId, name }) => {
      if (!isHost() || !state) return;
      state = E.addPlayer(state, peerId, name);
      hostBroadcast();
      renderAll();
    });
    net.on("peerLeave", (peerId) => {
      if (!isHost() || !state) return;
      state = E.removePlayer(state, peerId);
      hostBroadcast();
      renderAll();
    });
    net.on("action", ({ peerId, action }) => {
      if (!isHost() || !state) return;
      state = E.dispatch(state, peerId, action);
      hostBroadcast();
      renderAll();
    });
  }

  async function createRoom() {
    if (busy) return;
    if (net && net.isActive) {
      toast("Ya estás en una sala. Recarga la página para salir.");
      return;
    }
    setBusy(true, "Creando sala…");
    try {
      me.name = ($("playerName").value || "").trim() || "Host";
      const preset = ($("presetCountries").value || "France,Germany,Italy")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await loadCountryOptions(preset);

      if (net) {
        try {
          net.destroy();
        } catch (e) {}
      }
      net = GuerraNet.createNet();
      wireHostHandlers();

      const info = await net.host(me.name);
      me.peerId = info.peerId;
      me.role = "host";
      state = E.createLobby(me.peerId, me.name);
      state.roomCode = info.roomCode;
      state.availableCountries = countryList.map((c) => c.key);

      showModal(false);
      startHostLoop();
      renderAll();
      toast("Sala " + info.roomCode + " lista — comparte el código");
    } catch (e) {
      console.error(e);
      toast("Error creando sala: " + (e.message || e.type || e));
      if (net) {
        try {
          net.destroy();
        } catch (err) {}
        net = null;
      }
      showModal(true);
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (busy) return;
    if (net && net.isActive) {
      toast("Ya estás conectado. Recarga para unirte a otra sala.");
      return;
    }
    me.name = ($("playerName").value || "").trim() || "Jugador";
    const code = ($("joinCode").value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) {
      toast("Escribe el código de la sala (5 letras)");
      return;
    }

    setBusy(true, "Uniendo a " + code + "…");
    try {
      // NO cargar 160 países: la lista llega del host en state.availableCountries
      countryList = [];
      packs = {};

      if (net) {
        try {
          net.destroy();
        } catch (e) {}
      }
      net = GuerraNet.createNet();
      net.on("error", (e) => toast(String(e)));
      net.on("state", (s) => {
        applyState(s);
        if (s.availableCountries && s.availableCountries.length) {
          syncCountryListFromHost(s.availableCountries);
        }
        ensurePacksForPlayers();
      });

      const info = await net.join(code, me.name);
      me.peerId = info.peerId;
      me.role = "guest";
      showModal(false);
      if (!state) {
        $("sideBody").innerHTML =
          "<p class='hint'>Conectado. Esperando al host… Solo verás los países de esta partida.</p>";
      }
      toast("Conectado a sala " + code);
    } catch (e) {
      console.error(e);
      toast(
        "No se pudo unir: " +
          (e.message || e.type || e) +
          ". Revisa el código y que el host tenga la sala abierta."
      );
      if (net) {
        try {
          net.destroy();
        } catch (err) {}
        net = null;
      }
      showModal(true);
    } finally {
      setBusy(false);
    }
  }

  async function startMatch() {
    if (!isHost() || busy) return;
    await ensurePacksForPlayers();
    const hostP = state.players[me.peerId];
    if (hostP && hostP.countryKey) hostP.ready = true;
    const allReady = Object.values(state.players).every(
      (p) => p.countryKey && p.ready
    );
    if (!allReady) {
      toast("Todos deben elegir país y pulsar Listo");
      return;
    }
    state = E.startGame(state, packs);
    hostBroadcast();
    renderAll();
    toast("¡Guerra en tiempo real!");
  }

  // ─── Boot ──────────────────────────────────────────────
  function boot() {
    C.wireChrome();
    initMap();
    showModal(true);

    // un solo handler; ignore double-taps
    $("btnCreate").addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        createRoom();
      },
      { passive: false }
    );
    $("btnJoin").addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        joinRoom();
      },
      { passive: false }
    );

    $("btnReady").addEventListener("click", () => {
      sendOrLocal({ type: "ready", ready: true });
      toast("Listo ✓");
    });
    $("btnStart").addEventListener("click", () => startMatch());
    $("countrySelect").addEventListener("change", (e) => {
      const v = e.target.value;
      if (v) sendOrLocal({ type: "pick_country", countryKey: v });
    });
    const cancel = $("btnCancelMove");
    if (cancel) {
      cancel.addEventListener("click", () => {
        moveMode = false;
        selectedArmyId = null;
        $("selBanner").hidden = true;
        renderSide();
      });
    }
    const rec = $("btnRecenter");
    if (rec) {
      rec.addEventListener("click", () => {
        mapFitted = false;
        redrawMap();
        toast("Mapa centrado");
      });
    }

    const q = new URLSearchParams(location.search);
    if (q.get("join")) $("joinCode").value = q.get("join");
    if (q.get("paises")) $("presetCountries").value = q.get("paises");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
