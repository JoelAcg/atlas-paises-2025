/**
 * Motor de guerra en tiempo real (autoridad del host).
 * Estado serializable JSON para sync por red.
 */
(function (global) {
  const CFG = () => global.GuerraConfig;

  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Math.random().toString(36).slice(2, 9) +
      Date.now().toString(36).slice(-4)
    );
  }

  function distDeg(a, b) {
    const dlat = a.lat - b.lat;
    const dlon = a.lon - b.lon;
    return Math.sqrt(dlat * dlat + dlon * dlon);
  }

  function moveDurationSec(from, to, speedMul) {
    const d = distDeg(from, to);
    const c = CFG();
    let sec = d * c.MOVE_SEC_PER_DEG / Math.max(0.5, speedMul || 1);
    return Math.min(c.MOVE_MAX_SEC, Math.max(c.MOVE_MIN_SEC, sec));
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function createLobby(hostPeerId, hostName) {
    return {
      version: 1,
      phase: "lobby", // lobby | playing | ended
      hostPeerId,
      roomCode: null,
      createdAt: Date.now(),
      now: Date.now(),
      players: {
        [hostPeerId]: {
          peerId: hostPeerId,
          name: hostName || "Host",
          countryKey: null,
          ready: false,
          color: CFG().COLORS[0],
          isHost: true,
        },
      },
      availableCountries: [], // packs meta filled by app
      countries: {}, // runtime state per country
      tiles: {}, // tileName -> { name, lat, lon, countryKey, owner, capital, buildings, lastProd }
      armies: {}, // armyId -> army
      battles: {}, // battleId -> battle
      log: [],
      winner: null,
    };
  }

  function log(state, msg) {
    state.log.unshift({ t: state.now, msg });
    if (state.log.length > 80) state.log.length = 80;
  }

  function addPlayer(state, peerId, name) {
    // re-join same peer: only update name, no duplicate slot
    if (state.players[peerId]) {
      if (name) state.players[peerId].name = name;
      return state;
    }
    const n = Object.keys(state.players).length;
    if (n >= CFG().MAX_PLAYERS) {
      log(state, "Sala llena (" + CFG().MAX_PLAYERS + ")");
      return state;
    }
    state.players[peerId] = {
      peerId,
      name: name || "Jugador " + (n + 1),
      countryKey: null,
      ready: false,
      color: CFG().COLORS[n % CFG().COLORS.length],
      isHost: false,
      joinedAt: Date.now(),
    };
    log(state, state.players[peerId].name + " se unió a la sala");
    return state;
  }

  function removePlayer(state, peerId) {
    const p = state.players[peerId];
    if (!p) return state;
    log(state, (p.name || peerId) + " salió");
    delete state.players[peerId];
    return state;
  }

  function pickCountry(state, peerId, countryKey) {
    const p = state.players[peerId];
    if (!p || state.phase !== "lobby") return state;
    // unique country
    for (const id of Object.keys(state.players)) {
      if (id !== peerId && state.players[id].countryKey === countryKey) {
        return state;
      }
    }
    p.countryKey = countryKey;
    p.ready = false;
    log(state, p.name + " eligió " + countryKey);
    return state;
  }

  function setReady(state, peerId, ready) {
    const p = state.players[peerId];
    if (!p || !p.countryKey) return state;
    p.ready = !!ready;
    return state;
  }

  /**
   * countryPacks: { key: { es, capital, cities:[{name,lat,lon,capital}], border? } }
   */
  function startGame(state, countryPacks) {
    const players = Object.values(state.players);
    if (players.length < 1) return state;
    for (const p of players) {
      if (!p.countryKey || !p.ready) return state;
    }

    state.phase = "playing";
    state.now = Date.now();
    state.countries = {};
    state.tiles = {};
    state.armies = {};
    state.battles = {};
    state.winner = null;

    const start = CFG().START;
    for (const p of players) {
      const pack = countryPacks[p.countryKey];
      if (!pack) continue;
      const cities = (pack.cities || []).filter((c) => c.lat != null && c.lon != null);
      const capitalName =
        pack.capital ||
        (cities.find((c) => c.capital) || cities[0] || {}).name;

      state.countries[p.countryKey] = {
        key: p.countryKey,
        es: pack.es || p.countryKey,
        peerId: p.peerId,
        money: start.money,
        manpower: start.manpower,
        techs: {},
        research: null, // { techId, endsAt }
        incomeMul: 1,
        atkMul: 1,
        defMul: 1,
        speedMul: 1,
        costMul: 1,
        airAtkMul: 1,
      };

      cities.forEach((c) => {
        const tid = p.countryKey + "::" + c.name;
        state.tiles[tid] = {
          id: tid,
          name: c.name,
          lat: c.lat,
          lon: c.lon,
          homeCountry: p.countryKey,
          owner: p.countryKey,
          capital: c.name === capitalName || !!c.capital,
          buildings: {},
          lastProd: {},
        };
      });

      // army at capital
      const capTile = Object.values(state.tiles).find(
        (t) => t.homeCountry === p.countryKey && t.capital
      );
      if (capTile) {
        const aid = uid("army");
        state.armies[aid] = {
          id: aid,
          country: p.countryKey,
          tileId: capTile.id,
          lat: capTile.lat,
          lon: capTile.lon,
          units: clone(start.unitsAtCapital),
          moving: null,
          moveQueue: [],
        };
      }
    }

    buildAdjacency(state);
    log(
      state,
      "¡Partida iniciada! Movimiento tile a tile (ciudades = casillas HOI)."
    );
    return state;
  }

  function playerCountry(state, peerId) {
    const p = state.players[peerId];
    return p && p.countryKey ? p.countryKey : null;
  }

  function armyPower(state, army, role) {
    const c = state.countries[army.country];
    if (!c) return 0;
    let atk = 0;
    let def = 0;
    const U = CFG().UNITS;
    for (const [k, n] of Object.entries(army.units || {})) {
      if (!n || !U[k]) continue;
      atk += U[k].atk * n * (c.atkMul || 1);
      def += U[k].def * n * (c.defMul || 1);
      if (k === "avion") atk += U[k].atk * n * ((c.airAtkMul || 1) - 1);
    }
    return role === "def" ? def : atk;
  }

  function tileDefBonus(state, tileId) {
    const t = state.tiles[tileId];
    if (!t) return 0;
    let b = 0;
    if (t.buildings && t.buildings.muralla) b += CFG().BUILDINGS.muralla.defBonus;
    if (t.capital) b += 0.1;
    return b;
  }

  function totalUnits(units) {
    let n = 0;
    for (const v of Object.values(units || {})) n += v || 0;
    return n;
  }

  function applyDamage(units, fraction) {
    const out = clone(units || {});
    for (const k of Object.keys(out)) {
      out[k] = Math.max(0, Math.floor(out[k] * (1 - fraction)));
    }
    return out;
  }

  function mergeUnits(a, b) {
    const out = clone(a || {});
    for (const [k, v] of Object.entries(b || {})) {
      out[k] = (out[k] || 0) + (v || 0);
    }
    return out;
  }

  function speedMulArmy(state, army) {
    const c = state.countries[army.country];
    let s = (c && c.speedMul) || 1;
    const U = CFG().UNITS;
    let w = 0;
    let sum = 0;
    for (const [k, n] of Object.entries(army.units || {})) {
      if (!n || !U[k]) continue;
      sum += U[k].speed * n;
      w += n;
    }
    if (w > 0) s *= sum / w;
    return s;
  }

  /**
   * Grafo de adyacencia estilo HOI:
   * cada tile (ciudad del módulo) se conecta a los vecinos más cercanos.
   * Los tiles se llaman como las ciudades (Paris, Berlin…) — son casillas de juego.
   */
  function buildAdjacency(state) {
    const tiles = Object.values(state.tiles || {});
    const adj = {};
    tiles.forEach((t) => {
      adj[t.id] = [];
    });
    const MAX_N = 6;
    for (const a of tiles) {
      const ranked = tiles
        .filter((b) => b.id !== a.id)
        .map((b) => ({
          id: b.id,
          d: distDeg(
            { lat: a.lat, lon: a.lon },
            { lat: b.lat, lon: b.lon }
          ),
        }))
        .sort((x, y) => x.d - y.d);
      if (!ranked.length) continue;
      const nearest = ranked[0].d;
      const cutoff = Math.max(nearest * 2.8, nearest + 0.35);
      let n = 0;
      for (const x of ranked) {
        if (n >= MAX_N) break;
        if (x.d > cutoff && n >= 3) break;
        if (x.d > 8 && n >= 2) break; // no unir extremos del mapa
        adj[a.id].push(x.id);
        n++;
      }
    }
    // undirected
    for (const a of Object.keys(adj)) {
      adj[a].forEach((b) => {
        if (adj[b] && adj[b].indexOf(a) < 0) adj[b].push(a);
      });
    }
    state.adjacency = adj;
    return adj;
  }

  function neighbors(state, tileId) {
    if (!state.adjacency) buildAdjacency(state);
    return (state.adjacency && state.adjacency[tileId]) || [];
  }

  function isAdjacent(state, fromId, toId) {
    return neighbors(state, fromId).indexOf(toId) >= 0;
  }

  /** BFS camino tile a tile */
  function findPath(state, fromId, toId) {
    if (fromId === toId) return [fromId];
    if (!state.adjacency) buildAdjacency(state);
    const q = [fromId];
    const prev = { [fromId]: null };
    let qi = 0;
    while (qi < q.length) {
      const cur = q[qi++];
      const ns = neighbors(state, cur);
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i];
        if (prev[n] !== undefined) continue;
        prev[n] = cur;
        if (n === toId) {
          const path = [];
          let x = toId;
          while (x != null) {
            path.push(x);
            x = prev[x];
          }
          path.reverse();
          return path;
        }
        q.push(n);
      }
    }
    return null;
  }

  function beginHop(state, army, toTileId) {
    const from = state.tiles[army.tileId];
    const to = state.tiles[toTileId];
    if (!from || !to) return false;
    if (!isAdjacent(state, army.tileId, toTileId)) return false;
    const sec = moveDurationSec(
      { lat: from.lat, lon: from.lon },
      { lat: to.lat, lon: to.lon },
      speedMulArmy(state, army)
    );
    // hop adyacente más corto que viaje libre
    const hopSec = Math.min(
      CFG().MOVE_MAX_SEC,
      Math.max(2.5, sec * 0.55)
    );
    const now = state.now;
    army.moving = {
      toTileId,
      fromLat: from.lat,
      fromLon: from.lon,
      toLat: to.lat,
      toLon: to.lon,
      fromName: from.name,
      toName: to.name,
      startedAt: now,
      endsAt: now + hopSec * 1000,
    };
    return true;
  }

  // ─── Actions (host only) ─────────────────────────────────

  function actionRecruit(state, peerId, { armyId, unit, amount }) {
    const country = playerCountry(state, peerId);
    if (!country || state.phase !== "playing") return state;
    const army = state.armies[armyId];
    if (!army || army.country !== country || army.moving) return state;
    const tile = state.tiles[army.tileId];
    if (!tile || tile.owner !== country) return state;
    amount = Math.max(1, Math.min(50, amount | 0));
    const u = CFG().UNITS[unit];
    if (!u) return state;
    const c = state.countries[country];
    const cost = Math.ceil(u.cost * amount * (c.costMul || 1));
    const mp = u.manpower * amount;
    if (c.money < cost || c.manpower < mp) {
      log(state, "Sin recursos para reclutar");
      return state;
    }
    c.money -= cost;
    c.manpower -= mp;
    army.units[unit] = (army.units[unit] || 0) + amount;
    log(state, c.es + " reclutó " + amount + " " + u.name);
    return state;
  }

  function actionMove(state, peerId, { armyId, toTileId }) {
    const country = playerCountry(state, peerId);
    if (!country || state.phase !== "playing") return state;
    const army = state.armies[armyId];
    if (!army || army.country !== country) return state;
    if (army.moving || army.inBattle) {
      log(state, "No se puede mover: en ruta o en combate");
      return state;
    }
    if (totalUnits(army.units) <= 0) return state;
    const from = state.tiles[army.tileId];
    const to = state.tiles[toTileId];
    if (!from || !to) return state;
    if (from.id === to.id) return state;

    if (!state.adjacency) buildAdjacency(state);

    // Camino tile-a-tile (HOI). Si no es adyacente, encola hops.
    let path = findPath(state, army.tileId, toTileId);
    if (!path || path.length < 2) {
      log(
        state,
        "Sin ruta por tiles entre " + from.name + " y " + to.name
      );
      return state;
    }
    // path[0] = actual; resto = destinos
    const hops = path.slice(1);
    army.moveQueue = hops.slice(1); // remaining after first hop
    const first = hops[0];
    if (!beginHop(state, army, first)) {
      army.moveQueue = [];
      log(state, "No se pudo iniciar movimiento");
      return state;
    }
    const nHops = hops.length;
    log(
      state,
      (state.countries[country] || {}).es +
        ": " +
        from.name +
        " → " +
        to.name +
        " (" +
        nHops +
        " tile" +
        (nHops > 1 ? "s" : "") +
        ")"
    );
    return state;
  }

  function actionBuild(state, peerId, { tileId, building }) {
    const country = playerCountry(state, peerId);
    if (!country || state.phase !== "playing") return state;
    const tile = state.tiles[tileId];
    const b = CFG().BUILDINGS[building];
    if (!tile || !b || tile.owner !== country) return state;
    if (tile.buildings[building]) return state;
    const c = state.countries[country];
    const cost = Math.ceil(b.cost * (c.costMul || 1));
    if (c.money < cost) return state;
    c.money -= cost;
    tile.buildings[building] = { builtAt: state.now };
    tile.lastProd[building] = state.now;
    log(state, c.es + " construyó " + b.name + " en " + tile.name);
    return state;
  }

  function actionResearch(state, peerId, { techId }) {
    const country = playerCountry(state, peerId);
    if (!country || state.phase !== "playing") return state;
    const c = state.countries[country];
    const tech = CFG().TECHS[techId];
    if (!tech || c.techs[techId] || c.research) return state;
    if (c.money < tech.cost) return state;
    let bonus = 0;
    for (const t of Object.values(state.tiles)) {
      if (t.owner === country && t.buildings.universidad) bonus += 0.25;
    }
    const time = tech.timeSec / (1 + bonus) / (c.incomeMul || 1);
    c.money -= tech.cost;
    c.research = { techId, endsAt: state.now + time * 1000, name: tech.name };
    log(state, c.es + " investiga " + tech.name);
    return state;
  }

  function actionSplit(state, peerId, { armyId, portion }) {
    // portion 0.5 = half
    const country = playerCountry(state, peerId);
    const army = state.armies[armyId];
    if (!army || army.country !== country || army.moving) return state;
    portion = Math.min(0.7, Math.max(0.2, portion || 0.5));
    const left = {};
    const right = {};
    let any = false;
    for (const [k, n] of Object.entries(army.units || {})) {
      const m = Math.floor(n * portion);
      if (m > 0) {
        right[k] = m;
        left[k] = n - m;
        any = true;
      } else left[k] = n;
    }
    if (!any) return state;
    army.units = left;
    const nid = uid("army");
    state.armies[nid] = {
      id: nid,
      country,
      tileId: army.tileId,
      lat: army.lat,
      lon: army.lon,
      units: right,
      moving: null,
    };
    log(state, "Ejército dividido");
    return state;
  }

  function completeMove(state, army) {
    const m = army.moving;
    if (!m) return;
    const to = state.tiles[m.toTileId];
    if (!to) {
      army.moving = null;
      army.moveQueue = [];
      return;
    }
    army.tileId = to.id;
    army.lat = to.lat;
    army.lon = to.lon;
    army.moving = null;

    // merge with friendly on tile (only if not continuing queue and not battle)
    const queue = army.moveQueue || [];
    const willContinue = queue.length > 0;
    const hostile = to.owner !== army.country;

    if (hostile) {
      army.moveQueue = []; // stop path on contact
      startBattle(state, army, to);
      return;
    }

    if (!willContinue) {
      for (const other of Object.values(state.armies)) {
        if (
          other.id !== army.id &&
          other.country === army.country &&
          other.tileId === army.tileId &&
          !other.moving &&
          !other.inBattle
        ) {
          other.units = mergeUnits(other.units, army.units);
          if (other.moveQueue && other.moveQueue.length) {
            /* keep other queue */
          }
          delete state.armies[army.id];
          return;
        }
      }
    } else {
      // next hop along path
      const next = queue.shift();
      army.moveQueue = queue;
      if (next && !beginHop(state, army, next)) {
        army.moveQueue = [];
        log(state, "Ruta interrumpida en " + to.name);
      }
    }
  }

  function startBattle(state, army, tile) {
    // defenders: armies of owner on tile + garrison virtual if empty
    const defenders = Object.values(state.armies).filter(
      (a) =>
        a.country === tile.owner &&
        a.tileId === tile.id &&
        !a.moving &&
        a.id !== army.id
    );
    const bid = uid("bat");
    state.battles[bid] = {
      id: bid,
      tileId: tile.id,
      tileName: tile.name,
      attackerArmyId: army.id,
      defenderCountry: tile.owner,
      defenderArmyIds: defenders.map((d) => d.id),
      startedAt: state.now,
      lastTick: state.now,
      log: [],
    };
    // lock armies in battle (can't move)
    army.inBattle = bid;
    defenders.forEach((d) => {
      d.inBattle = bid;
    });
    log(
      state,
      "⚔ Batalla en " +
        tile.name +
        ": " +
        (state.countries[army.country] || {}).es +
        " vs " +
        (state.countries[tile.owner] || {}).es
    );
  }

  function tickBattle(state, bat) {
    const atk = state.armies[bat.attackerArmyId];
    if (!atk) {
      delete state.battles[bat.id];
      return;
    }
    let defUnits = {};
    const defArmies = (bat.defenderArmyIds || [])
      .map((id) => state.armies[id])
      .filter(Boolean);
    if (defArmies.length) {
      defArmies.forEach((d) => {
        defUnits = mergeUnits(defUnits, d.units);
      });
    } else {
      // militia garrison
      defUnits = { infanteria: 15 };
    }

    const fakeDef = {
      country: bat.defenderCountry,
      units: defUnits,
    };
    let pAtk = armyPower(state, atk, "atk");
    let pDef =
      armyPower(state, fakeDef, "def") *
      (1 + tileDefBonus(state, bat.tileId));

    if (pAtk <= 0) {
      endBattle(state, bat, false);
      return;
    }
    if (pDef <= 0) {
      endBattle(state, bat, true);
      return;
    }

    // mutual damage fractions
    const dmgToDef = Math.min(0.35, (pAtk / (pDef + pAtk)) * 0.28);
    const dmgToAtk = Math.min(0.35, (pDef / (pDef + pAtk)) * 0.24);

    atk.units = applyDamage(atk.units, dmgToAtk);
    if (defArmies.length) {
      defArmies.forEach((d) => {
        d.units = applyDamage(d.units, dmgToDef);
        if (totalUnits(d.units) <= 0) {
          delete state.armies[d.id];
          bat.defenderArmyIds = bat.defenderArmyIds.filter((x) => x !== d.id);
        }
      });
    }

    if (totalUnits(atk.units) <= 0) {
      endBattle(state, bat, false);
      return;
    }
    const stillDef = (bat.defenderArmyIds || [])
      .map((id) => state.armies[id])
      .filter(Boolean);
    if (stillDef.length === 0 && defArmies.length > 0) {
      endBattle(state, bat, true);
      return;
    }
    // if only militia and several ticks, attacker wins
    if (!stillDef.length && state.now - bat.startedAt > 4000) {
      endBattle(state, bat, true);
    }
  }

  function endBattle(state, bat, attackerWins) {
    const atk = state.armies[bat.attackerArmyId];
    const tile = state.tiles[bat.tileId];
    if (attackerWins && atk && tile) {
      tile.owner = atk.country;
      atk.inBattle = null;
      atk.tileId = tile.id;
      log(
        state,
        "🏆 " +
          (state.countries[atk.country] || {}).es +
          " captura " +
          tile.name
      );
    } else {
      if (atk) {
        if (totalUnits(atk.units) <= 0) delete state.armies[atk.id];
        else atk.inBattle = null;
      }
      (bat.defenderArmyIds || []).forEach((id) => {
        if (state.armies[id]) state.armies[id].inBattle = null;
      });
      log(state, "Defensa sostiene " + (bat.tileName || ""));
    }
    delete state.battles[bat.id];
    checkWinner(state);
  }

  function checkWinner(state) {
    const owners = new Set(
      Object.values(state.tiles).map((t) => t.owner).filter(Boolean)
    );
    if (owners.size === 1) {
      const w = [...owners][0];
      state.phase = "ended";
      state.winner = w;
      log(state, "🏁 Victoria de " + (state.countries[w] || {}).es);
    }
  }

  function applyTech(c, techId) {
    const tech = CFG().TECHS[techId];
    if (!tech) return;
    c.techs[techId] = true;
    const e = tech.effect || {};
    if (e.atkMul) c.atkMul = (c.atkMul || 1) * (1 + e.atkMul);
    if (e.defMul) c.defMul = (c.defMul || 1) * (1 + e.defMul);
    if (e.speedMul) c.speedMul = (c.speedMul || 1) * (1 + e.speedMul);
    if (e.airAtkMul) c.airAtkMul = (c.airAtkMul || 1) * (1 + e.airAtkMul);
    if (e.incomeMul) c.incomeMul = (c.incomeMul || 1) * (1 + e.incomeMul);
    if (e.costMul) c.costMul = (c.costMul || 1) * (1 + e.costMul);
  }

  function tickProduction(state) {
    const now = state.now;
    for (const tile of Object.values(state.tiles)) {
      const c = state.countries[tile.owner];
      if (!c) continue;
      for (const [bid, built] of Object.entries(tile.buildings || {})) {
        const conf = CFG().BUILDINGS[bid];
        if (!conf) continue;
        const last = tile.lastProd[bid] || built.builtAt || now;
        const interval = (conf.intervalSec || 10) * 1000;
        if (now - last < interval) continue;
        tile.lastProd[bid] = now;
        if (conf.moneyPerTick) {
          c.money += Math.floor(conf.moneyPerTick * (c.incomeMul || 1));
        }
        if (conf.produces) {
          // find army on tile or create
          let army = Object.values(state.armies).find(
            (a) =>
              a.country === tile.owner &&
              a.tileId === tile.id &&
              !a.moving
          );
          if (!army) {
            const id = uid("army");
            army = {
              id,
              country: tile.owner,
              tileId: tile.id,
              lat: tile.lat,
              lon: tile.lon,
              units: {},
              moving: null,
              moveQueue: [],
            };
            state.armies[id] = army;
          }
          for (const [u, n] of Object.entries(conf.produces)) {
            army.units[u] = (army.units[u] || 0) + n;
          }
        }
      }
    }
    // base income
    for (const c of Object.values(state.countries)) {
      if (!c._lastIncome) c._lastIncome = now;
      if (now - c._lastIncome >= CFG().INCOME_INTERVAL_SEC * 1000) {
        c._lastIncome = now;
        const tiles = Object.values(state.tiles).filter((t) => t.owner === c.key)
          .length;
        c.money += Math.floor((15 + tiles * 3) * (c.incomeMul || 1));
        c.manpower += Math.floor(20 + tiles * 2);
      }
    }
  }

  function tick(state, now) {
    if (state.phase !== "playing") {
      state.now = now || Date.now();
      return state;
    }
    state.now = now || Date.now();

    // research complete
    for (const c of Object.values(state.countries)) {
      if (c.research && state.now >= c.research.endsAt) {
        applyTech(c, c.research.techId);
        log(state, c.es + " completó " + c.research.name);
        c.research = null;
      }
    }

    // movements
    for (const army of Object.values(state.armies)) {
      if (!army.moving || army.inBattle) continue;
      const m = army.moving;
      const t = Math.min(
        1,
        (state.now - m.startedAt) / Math.max(1, m.endsAt - m.startedAt)
      );
      army.lat = m.fromLat + (m.toLat - m.fromLat) * t;
      army.lon = m.fromLon + (m.toLon - m.fromLon) * t;
      if (state.now >= m.endsAt) completeMove(state, army);
    }

    // battles
    for (const bat of Object.values(state.battles)) {
      if (state.now - bat.lastTick >= CFG().COMBAT_TICK_SEC * 1000) {
        bat.lastTick = state.now;
        tickBattle(state, bat);
      }
    }

    tickProduction(state);
    return state;
  }

  function dispatch(state, peerId, action) {
    if (!action || !action.type) return state;
    switch (action.type) {
      case "pick_country":
        return pickCountry(state, peerId, action.countryKey);
      case "ready":
        return setReady(state, peerId, action.ready);
      case "recruit":
        return actionRecruit(state, peerId, action);
      case "move":
        return actionMove(state, peerId, action);
      case "build":
        return actionBuild(state, peerId, action);
      case "research":
        return actionResearch(state, peerId, action);
      case "split":
        return actionSplit(state, peerId, action);
      default:
        return state;
    }
  }

  /** interpolate display positions already in army.lat/lon */
  function publicState(state) {
    return clone(state);
  }

  global.GuerraEngine = {
    createLobby,
    addPlayer,
    removePlayer,
    startGame,
    tick,
    dispatch,
    publicState,
    playerCountry,
    totalUnits,
    moveDurationSec,
    distDeg,
    uid,
    buildAdjacency,
    neighbors,
    isAdjacent,
    findPath,
  };
})(window);
