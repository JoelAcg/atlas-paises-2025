/**
 * Red P2P con PeerJS — sala privada (código).
 * Host = autoridad del motor; clientes envían acciones y reciben estado.
 *
 * Señalización: cloud PeerJS (necesita internet para el handshake;
 * el tráfico de juego va P2P, ideal en la misma WiFi).
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
    let role = null; // 'host' | 'guest'
    let roomCode = null;
    let hostConn = null; // guest -> host
    const guestConns = {}; // host: peerId -> DataConnection
    const handlers = {
      onState: null,
      onOpen: null,
      onError: null,
      onPeerJoin: null,
      onPeerLeave: null,
      onLog: null,
    };

    function emit(ev, data) {
      if (typeof handlers[ev] === "function") handlers[ev](data);
    }

    function wireConn(conn, asHost) {
      conn.on("data", (data) => {
        if (!data || !data.t) return;
        if (asHost) {
          if (data.t === "hello") {
            emit("onPeerJoin", {
              peerId: conn.peer,
              name: data.name || "Jugador",
            });
            return;
          }
          if (data.t === "action") {
            emit("onAction", { peerId: conn.peer, action: data.action });
            return;
          }
        } else {
          if (data.t === "state") {
            emit("onState", data.state);
            return;
          }
          if (data.t === "kick") {
            emit("onError", "Expulsado de la sala");
          }
        }
      });
      conn.on("close", () => {
        if (asHost) {
          delete guestConns[conn.peer];
          emit("onPeerLeave", conn.peer);
        } else {
          emit("onError", "Conexión con el host perdida");
        }
      });
      conn.on("error", (e) => emit("onError", String(e)));
    }

    async function host(playerName) {
      role = "host";
      roomCode = genCode();
      return new Promise((resolve, reject) => {
        peer = new Peer(PREFIX + roomCode, {
          debug: 1,
        });
        peer.on("open", (id) => {
          emit("onOpen", { role, roomCode, peerId: id });
          resolve({ roomCode, peerId: id });
        });
        peer.on("connection", (conn) => {
          guestConns[conn.peer] = conn;
          conn.on("open", () => {
            wireConn(conn, true);
            emit("onLog", "Conexión entrante " + conn.peer);
          });
        });
        peer.on("error", (err) => {
          // ID taken → new code
          if (String(err).includes("taken") || err.type === "unavailable-id") {
            try {
              peer.destroy();
            } catch (e) {}
            roomCode = genCode();
            host(playerName).then(resolve).catch(reject);
            return;
          }
          emit("onError", err.type || String(err));
          reject(err);
        });
      });
    }

    async function join(code, playerName) {
      role = "guest";
      roomCode = (code || "").trim().toUpperCase();
      return new Promise((resolve, reject) => {
        peer = new Peer({ debug: 1 });
        peer.on("open", () => {
          hostConn = peer.connect(PREFIX + roomCode, { reliable: true });
          hostConn.on("open", () => {
            wireConn(hostConn, false);
            hostConn.send({ t: "hello", name: playerName || "Jugador" });
            emit("onOpen", {
              role,
              roomCode,
              peerId: peer.id,
            });
            resolve({ roomCode, peerId: peer.id });
          });
          hostConn.on("error", (e) => {
            emit("onError", "No se pudo unir: " + (e.type || e));
            reject(e);
          });
        });
        peer.on("error", (err) => {
          emit("onError", err.type || String(err));
          reject(err);
        });
      });
    }

    function sendAction(action) {
      if (role === "guest" && hostConn && hostConn.open) {
        hostConn.send({ t: "action", action });
      }
    }

    function broadcastState(state) {
      if (role !== "host") return;
      const payload = { t: "state", state };
      Object.values(guestConns).forEach((c) => {
        if (c.open) {
          try {
            c.send(payload);
          } catch (e) {}
        }
      });
    }

    function destroy() {
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
      on(ev, fn) {
        // onState, onOpen, onError, onPeerJoin, onPeerLeave, onAction, onLog
        const key =
          "on" +
          ev.charAt(0).toUpperCase() +
          ev.slice(1);
        // also allow onState style
        if (ev.startsWith("on")) handlers[ev] = fn;
        else handlers["on" + ev.charAt(0).toUpperCase() + ev.slice(1)] = fn;
        // map common names
        if (ev === "state") handlers.onState = fn;
        if (ev === "open") handlers.onOpen = fn;
        if (ev === "error") handlers.onError = fn;
        if (ev === "peerJoin") handlers.onPeerJoin = fn;
        if (ev === "peerLeave") handlers.onPeerLeave = fn;
        if (ev === "action") handlers.onAction = fn;
        if (ev === "log") handlers.onLog = fn;
      },
    };
  }

  global.GuerraNet = { createNet, genCode, PREFIX };
})(window);
