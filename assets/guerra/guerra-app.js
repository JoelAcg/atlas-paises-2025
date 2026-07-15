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
  let map, tileLayer, armyLayer, borderLayer;
  let armyMarkers = {};
  let selectedArmyId = null;
  let moveMode = false;
  let tickTimer = null;
  let uiTab = "tropas";
  let countryList = [];
  let busy = false; // evita doble clic crear/unirse

  function $(id) {
    return document.getElementById(id);
  }

  function showModal(show) {
    const m = $("setupModal");
    const g = $("gameUI");
    if (m) {
      if (show) {
        m.hidden = false;
        m.style.display = "flex";
        m.removeAttribute("aria-hidden");
      } else {
        m.hidden = true;
        m.style.display = "none";
        m.setAttribute("aria-hidden", "true");
      }
    }
    if (g) {
      g.hidden = !!show;
      g.style.display = show ? "none" : "";
    }
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
    state = s;
    renderAll();
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
      maxZoom: 12,
    }).setView([45, 10], 4);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "&copy; OSM &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);
    borderLayer = L.layerGroup().addTo(map);
    tileLayer = L.layerGroup().addTo(map);
    armyLayer = L.layerGroup().addTo(map);
  }

  function colorForCountry(key) {
    if (!state) return "#64748b";
    for (const p of Object.values(state.players || {})) {
      if (p.countryKey === key) return p.color || "#64748b";
    }
    return "#64748b";
  }

  function redrawMap() {
    if (!map || !state) return;
    borderLayer.clearLayers();
    tileLayer.clearLayers();
    armyLayer.clearLayers();
    armyMarkers = {};

    // borders of involved countries
    const keys = [
      ...new Set(
        Object.values(state.players || {})
          .map((p) => p.countryKey)
          .filter(Boolean)
      ),
    ];
    keys.forEach(async (k) => {
      const pack = packs[k];
      if (!pack) return;
      if (!pack.border && pack.borderUrl) {
        try {
          pack.border = await C.fetchJson(pack.borderUrl);
        } catch (e) {}
      }
      if (pack.border) {
        L.geoJSON(pack.border, {
          style: {
            color: colorForCountry(k),
            weight: 2,
            fillColor: colorForCountry(k),
            fillOpacity: 0.18,
          },
        }).addTo(borderLayer);
      }
    });

    // tiles as circles
    Object.values(state.tiles || {}).forEach((t) => {
      const col = colorForCountry(t.owner);
      const r = t.capital ? 9 : 6;
      const m = L.circleMarker([t.lat, t.lon], {
        radius: r,
        color: "#fff",
        weight: 1.5,
        fillColor: col,
        fillOpacity: 0.9,
      }).addTo(tileLayer);
      m.bindTooltip(
        t.name +
          (t.capital ? " ★" : "") +
          "<br>Dueño: " +
          ((state.countries[t.owner] || {}).es || t.owner) +
          (Object.keys(t.buildings || {}).length
            ? "<br>🏗 " + Object.keys(t.buildings).join(", ")
            : ""),
        { sticky: true }
      );
      m.on("click", () => onTileClick(t.id));
    });

    // armies
    Object.values(state.armies || {}).forEach((a) => {
      const col = colorForCountry(a.country);
      const n = E.totalUnits(a.units);
      const moving = !!a.moving;
      let eta = "";
      if (moving) {
        const left = Math.max(0, (a.moving.endsAt - state.now) / 1000);
        eta = Math.ceil(left) + "s → " + (a.moving.toName || "");
      }
      const html =
        '<div class="army-bubble' +
        (moving ? " moving" : "") +
        (selectedArmyId === a.id ? " sel" : "") +
        '" style="background:' +
        col +
        '">' +
        n +
        (eta ? '<div class="eta">' + eta + "</div>" : "") +
        "</div>";
      const icon = L.divIcon({
        className: "army-marker",
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const marker = L.marker([a.lat, a.lon], {
        icon,
        zIndexOffset: moving ? 2000 : 1000,
      }).addTo(armyLayer);
      marker.on("click", (ev) => {
        L.DomEvent.stopPropagation(ev);
        onArmyClick(a.id);
      });
      armyMarkers[a.id] = marker;
    });

    // fit
    const latlngs = Object.values(state.tiles || {}).map((t) => [t.lat, t.lon]);
    if (latlngs.length) {
      try {
        map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 6 });
      } catch (e) {}
    }
  }

  function onArmyClick(armyId) {
    const a = state.armies[armyId];
    if (!a) return;
    if (a.country !== myCountry()) {
      toast("Ese ejército no es tuyo");
      return;
    }
    selectedArmyId = armyId;
    moveMode = true;
    $("selBanner").hidden = false;
    $("selBanner").textContent =
      "Ejército seleccionado (" +
      E.totalUnits(a.units) +
      " u.). Clic en un tile destino para mover.";
    renderSide();
  }

  function onTileClick(tileId) {
    if (moveMode && selectedArmyId) {
      sendOrLocal({ type: "move", armyId: selectedArmyId, toTileId: tileId });
      moveMode = false;
      $("selBanner").hidden = true;
      toast("Órdenes de movimiento enviadas");
      return;
    }
    // select tile for build if owned
    const t = state.tiles[tileId];
    if (t && t.owner === myCountry()) {
      window.__selectedTileId = tileId;
      uiTab = "build";
      renderSide();
    }
  }

  // ─── Render panels ─────────────────────────────────────
  function renderLobby() {
    const box = $("lobbyPlayers");
    if (!box || !state) return;
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
    if (sel && countryList.length) {
      const taken = new Set(
        Object.values(state.players)
          .map((p) => p.countryKey)
          .filter(Boolean)
      );
      const mine = state.players[me.peerId];
      sel.innerHTML =
        '<option value="">— Elige país —</option>' +
        countryList
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
              "</option>"
            );
          })
          .join("");
    }

    $("roomCodeShow").textContent = state.roomCode || net?.roomCode || "—";
    $("btnStart").style.display = isHost() ? "" : "none";
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
        html +=
          '<div class="unit-row" style="flex-direction:column;align-items:stretch">' +
          "<div><b>" +
          (tile ? tile.name : "?") +
          "</b> · " +
          E.totalUnits(a.units) +
          " u." +
          (a.moving ? " · 🚚 en ruta" : "") +
          (a.inBattle ? " · ⚔ combate" : "") +
          "</div><div style='font-size:.8rem;color:var(--muted)'>" +
          Object.entries(a.units)
            .map(
              ([k, n]) =>
                (CFG.UNITS[k] ? CFG.UNITS[k].icon + " " : "") + n + " " + k
            )
            .join(" · ") +
          "</div>" +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' +
          '<button type="button" class="war-btn" data-sel="' +
          a.id +
          '">Mover</button>' +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="infanteria">+Inf</button>' +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="tanque">+Tanque</button>' +
          '<button type="button" class="war-btn" data-rec="' +
          a.id +
          '" data-u="avion">+Avión</button>' +
          '<button type="button" class="war-btn" data-split="' +
          a.id +
          '">Dividir</button>' +
          "</div></div>";
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
    $("phaseLabel").textContent =
      state.phase === "lobby"
        ? "Lobby"
        : state.phase === "playing"
        ? "EN VIVO · tiempo real"
        : "Fin";
    if (state.phase === "lobby") renderLobby();
    renderSide();
    if (state.phase === "playing" || state.phase === "ended") redrawMap();
    // battles banner
    const bats = Object.values(state.battles || {});
    $("battleInfo").textContent = bats.length
      ? "⚔ Batallas: " + bats.map((b) => b.tileName).join(", ")
      : "";
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
      const idx = await C.fetchJson("data/index.json");
      const top = idx.countries
        .slice()
        .sort((a, b) => (b.poblacion || 0) - (a.poblacion || 0))
        .slice(0, 40)
        .map((c) => c.key);
      await loadCountryOptions(top);

      if (net) {
        try {
          net.destroy();
        } catch (e) {}
      }
      net = GuerraNet.createNet();
      net.on("error", (e) => toast(String(e)));
      net.on("state", (s) => {
        applyState(s);
        ensurePacksForPlayers();
      });

      const info = await net.join(code, me.name);
      me.peerId = info.peerId;
      me.role = "guest";
      showModal(false);
      // placeholder until first state arrives
      if (!state) {
        $("sideBody").innerHTML =
          "<p class='hint'>Conectado. Esperando estado del host…</p>";
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
    $("btnCancelMove").addEventListener("click", () => {
      moveMode = false;
      selectedArmyId = null;
      $("selBanner").hidden = true;
    });

    const q = new URLSearchParams(location.search);
    if (q.get("join")) $("joinCode").value = q.get("join");
    if (q.get("paises")) $("presetCountries").value = q.get("paises");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
