/**
 * Servidor local mínimo para el atlas (evita file://).
 * Uso: node serve-atlas.js
 * URL: http://127.0.0.1:5500/
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".woff2": "font/woff2",
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(root, rel));
  const rootNorm = path.normalize(root + path.sep);
  if (full !== path.normalize(root) && !full.startsWith(rootNorm)) {
    return null;
  }
  return full;
}

const server = http.createServer((req, res) => {
  const file = safeJoin(ROOT, req.url || "/");
  if (!file) {
    res.writeHead(403);
    res.end("403");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        "404 No encontrado: " +
          (req.url || "") +
          "\n\n¿Ejecutaste node _build_atlas_v6.js?\n¿Estás en la carpeta Mapas_HTML_2025?"
      );
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  Atlas listo");
  console.log("  http://127.0.0.1:" + PORT + "/index.html");
  console.log("  http://127.0.0.1:" + PORT + "/comparar.html");
  console.log("  http://127.0.0.1:" + PORT + "/combinar.html");
  console.log("  Carpeta:", ROOT);
  console.log("  Ctrl+C para parar");
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error("Puerto " + PORT + " ocupado. Cierra la otra ventana o usa:");
    console.error("  set PORT=5501 && node serve-atlas.js");
  } else {
    console.error(e);
  }
  process.exit(1);
});
