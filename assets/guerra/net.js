/**
 * Red P2P PeerJS — sala privada.
 * Host = autoridad; evita dobles conexiones y re-entradas.
 */
(function (global) {
  const PREFIX = "atlaswar-";

  function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 5; i++)
      s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function createNet() {
    let peer = null;
    let role = null;
    let roomCode = null;
    let hostConn = null;
    let destroyed = false;
    let hostOpenResolved = false;
    const guestConns = {};
    const greeted = {}; // peerId already said hello
    const handlers = {};

    function emit(ev, data) {
      const fn = handlers[ev];
      if (typeof fn === "function") fn(data);
    }

    function wireHostConn(conn) {
      if (guestConns[conn.peer] && guestConns[conn.peer] !== conn) {
        try {
          conn.close();
        } catch (e) {}
        return;
      }
      guestConns[conn.peer] = conn;

      conn.on("data", (data) => {
        if (!data || !data.t) return;
        if (data.t === "hello") {
          if (greeted[conn.peer]) {
            // duplicate hello — just resend nothing, peer already in roster
            return;
          }
          greeted[conn.peer] = true;
          emit("peerJoin", {
            peerId: conn.peer,
            name: data.name || "Jugador",
          });
          return;
        }
        if (data.t === "action") {
          emit("action", { peerId: conn.peer, action: data.action });
        }
      });

      conn.on("close", () => {
        delete guestConns[conn.peer];
        delete greeted[conn.peer];
        emit("peerLeave", conn.peer);
      });

      conn.on("error", () => {
        /* swallow; close will fire */
      });
    }

    function wireGuestConn(conn) {
      hostConn = conn;
      conn.on("data", (data) => {
        if (!data || !data.t) return;
        if (data.t === "state") emit("state", data.state);
        if (data.t === "kick") emit("error", "Expulsado de la sala");
        if (data.t === "full") emit("error", "Sala llena");
      });
      conn.on("close", () => {
        if (!destroyed) emit("error", "Conexión con el host perdida");
      });
      conn.on("error", (e) => emit("error", e.type || String(e)));
    }

    function host(playerName) {
      if (peer) {
        return Promise.reject(new Error("Ya hay una conexión activa"));
      }
      destroyed = false;
      hostOpenResolved = false;
      role = "host";
      roomCode = genCode();

      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const ok = (v) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };

        peer = new Peer(PREFIX + roomCode, { debug: 0 });

        const timer = setTimeout(() => {
          fail(new Error("Timeout creando sala (red/PeerJS)"));
        }, 20000);

        peer.on("open", (id) => {
          clearTimeout(timer);
          hostOpenResolved = true;
          roomCode = id.replace(PREFIX, "");
          emit("open", { role, roomCode, peerId: id });
          ok({ roomCode, peerId: id });
        });

        peer.on("connection", (conn) => {
          // replace stale socket for same peer
          if (guestConns[conn.peer]) {
            try {
              guestConns[conn.peer].close();
            } catch (e) {}
          }
          if (conn.open) wireHostConn(conn);
          else conn.on("open", () => wireHostConn(conn));
        });

        peer.on("error", (err) => {
          clearTimeout(timer);
          if (err.type === "unavailable-id" || /taken/i.test(String(err))) {
            try {
              peer.destroy();
            } catch (e) {}
            peer = null;
            // retry once with new code
            host(playerName).then(ok).catch(fail);
            return;
          }
          emit("error", err.type || String(err));
          fail(err);
        });
      });
    }

    function join(code, playerName) {
      if (peer) {
        return Promise.reject(new Error("Ya hay una conexión activa"));
      }
      destroyed = false;
      role = "guest";
      roomCode = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (roomCode.length < 4) {
        return Promise.reject(new Error("Código inválido"));
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        };
        const ok = (v) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };

        peer = new Peer({ debug: 0 });
        const timer = setTimeout(() => {
          fail(new Error("Timeout al unirse (¿código mal o host offline?)"));
        }, 25000);

        peer.on("open", () => {
          const conn = peer.connect(PREFIX + roomCode, {
            reliable: true,
          });
          conn.on("open", () => {
            clearTimeout(timer);
            wireGuestConn(conn);
            // single hello
            conn.send({ t: "hello", name: playerName || "Jugador" });
            emit("open", { role, roomCode, peerId: peer.id });
            ok({ roomCode, peerId: peer.id });
          });
          conn.on("error", (e) => {
            clearTimeout(timer);
            fail(e);
          });
        });

        peer.on("error", (err) => {
          clearTimeout(timer);
          emit("error", err.type || String(err));
          fail(err);
        });
      });
    }

    function sendAction(action) {
      if (role === "guest" && hostConn && hostConn.open) {
        try {
          hostConn.send({ t: "action", action });
        } catch (e) {}
      }
    }

    function broadcastState(state) {
      if (role !== "host") return;
      const payload = { t: "state", state };
      Object.keys(guestConns).forEach((id) => {
        const c = guestConns[id];
        if (c && c.open) {
          try {
            c.send(payload);
          } catch (e) {}
        }
      });
    }

    function destroy() {
      destroyed = true;
      try {
        if (hostConn) hostConn.close();
      } catch (e) {}
      Object.values(guestConns).forEach((c) => {
        try {
          c.close();
        } catch (e) {}
      });
      try {
        if (peer) peer.destroy();
      } catch (e) {}
      peer = null;
      hostConn = null;
      Object.keys(guestConns).forEach((k) => delete guestConns[k]);
      Object.keys(greeted).forEach((k) => delete greeted[k]);
      role = null;
      roomCode = null;
    }

    return {
      host,
      join,
      sendAction,
      broadcastState,
      destroy,
      get role() {
        return role;
      },
      get roomCode() {
        return roomCode;
      },
      get peerId() {
        return peer && peer.id;
      },
      get isActive() {
        return !!peer;
      },
      on(ev, fn) {
        handlers[ev] = fn;
      },
    };
  }

  global.GuerraNet = { createNet, genCode, PREFIX };
})(window);
