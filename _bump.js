const fs = require("fs");
const path = require("path");
const root = __dirname;
const VER = "6.6.0";
let inj = fs.readFileSync(path.join(root, "_inject_version.js"), "utf8");
inj = inj.replace(/const VER = "[^"]+"/, `const VER = "${VER}"`);
fs.writeFileSync(path.join(root, "_inject_version.js"), inj);
require("./_inject_version.js");
let vjs = fs.readFileSync(path.join(root, "assets/version.js"), "utf8");
vjs = vjs.replace(
  /window\.ATLAS_VERSION = "[^"]+"/,
  `window.ATLAS_VERSION = "${VER}"`
);
vjs = vjs.replace(
  /window\.ATLAS_VERSION_LABEL = "[^"]+"/,
  `window.ATLAS_VERSION_LABEL = "Tiles poligono negro + fix atlas"`
);
fs.writeFileSync(path.join(root, "assets/version.js"), vjs);
console.log("bumped", VER);
