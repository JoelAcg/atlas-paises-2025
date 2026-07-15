const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const root = __dirname;
const git = "C:/Program Files/Git/cmd/git.exe";
const VER = "6.3.0";
const files = [
  "index.html",
  "guerra.html",
  "combinar.html",
  "comparar.html",
  "atlas.html",
  "quiz.html",
];

function show(ref, f) {
  return execSync(`"${git}" show ${ref}:${f}`, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

for (const f of files) {
  let html;
  try {
    html = show("HEAD", f);
  } catch (e) {
    html = fs.readFileSync(path.join(root, f), "utf8");
  }
  if (html.includes('href="=') || html.includes("stylesheet\" =")) {
    for (const ref of ["eb58455", "10bad15", "20be91d"]) {
      try {
        html = show(ref, f);
        if (!html.includes('href="=')) break;
      } catch (e) {}
    }
  }

  html = html.replace(/<script[^>]*assets\/version\.js[^>]*><\/script>\s*/g, "");

  if (!html.includes("assets/version.js")) {
    if (/assets\/core\.js/.test(html)) {
      html = html.replace(
        /<script src="assets\/core\.js[^"]*"><\/script>/,
        `<script src="assets/version.js?v=${VER}"></script>\n<script src="assets/core.js?v=${VER}"></script>`
      );
    } else {
      html = html.replace(
        "</body>",
        `<script src="assets/version.js?v=${VER}"></script>\n</body>`
      );
    }
  }

  if (!html.includes("data-atlas-version")) {
    html = html.replace(
      /(<div class="nav[^"]*"[^>]*>)/,
      `$1\n      <span class="badge atlas-version-badge" data-atlas-version>Versión: ${VER}</span>`
    );
  } else {
    html = html.replace(
      />Versión:\s*[^<]*/g,
      `>Versión: ${VER}`
    );
  }

  html = html.replace(
    /(assets\/[a-zA-Z0-9_\/.\-]+\.(?:js|css))\?v=[^"']+/g,
    `$1?v=${VER}`
  );
  html = html.replace(
    /(href|src)="(assets\/[^"?]+\.(?:css|js))"/g,
    `$1="$2?v=${VER}"`
  );

  fs.writeFileSync(path.join(root, f), html, "utf8");
  console.log(
    f,
    "ok",
    "vjs=" + html.includes("version.js"),
    "badge=" + html.includes("data-atlas-version"),
    "broken=" + html.includes('href="=')
  );
}
