/**
 * Capas de terreno / biomas visuales (activables)
 * Requiere Leaflet cargado.
 */
window.TerrainLayers = (function () {
  const LAYERS = {
    outline: {
      id: "outline",
      label: "Solo contorno",
      desc: "Sin satélite: solo mar + regiones del país",
      kind: "solid",
      color: "#7eb8dc",
      regionFill: 0.82,
      borderWeight: 1.2,
    },
    atlas: {
      id: "atlas",
      label: "Atlas político",
      desc: "Mapa claro con ciudades y carreteras",
      kind: "tile",
      url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      options: {
        attribution: "&copy; OSM &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      },
      regionFill: 0.45,
      borderWeight: 1.4,
    },
    satellite: {
      id: "satellite",
      label: "Satélite (desierto/bosque)",
      desc: "Imagen real: desiertos beige, bosques verdes, nieve, mar",
      kind: "tile",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      options: {
        attribution: "Tiles &copy; Esri",
        maxZoom: 19,
      },
      regionFill: 0.22,
      borderWeight: 2,
      labels: true,
    },
    topo: {
      id: "topo",
      label: "Relieve / montañas",
      desc: "Curvas de nivel, cumbres, valles (OpenTopoMap)",
      kind: "tile",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      options: {
        attribution: "Map data: &copy; OSM, SRTM | Map style: &copy; OpenTopoMap",
        maxZoom: 17,
        subdomains: "abc",
      },
      regionFill: 0.28,
      borderWeight: 1.8,
    },
    physical: {
      id: "physical",
      label: "Físico (biomas)",
      desc: "Relieve sombreado: montañas, llanuras, desiertos",
      kind: "tile",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
      options: {
        attribution: "Tiles &copy; Esri",
        maxZoom: 8,
      },
      regionFill: 0.3,
      borderWeight: 1.8,
    },
    forest: {
      id: "forest",
      label: "Naturaleza / verde",
      desc: "Estilo enfocado en vegetación y parques",
      kind: "tile",
      url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      options: {
        attribution: "&copy; OSM HOT",
        maxZoom: 19,
        subdomains: "abc",
      },
      regionFill: 0.35,
      borderWeight: 1.5,
    },
  };

  const LABEL_URL =
    "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

  function createBase(def) {
    if (def.kind === "solid") {
      return L.rectangle(
        [
          [-85, -180],
          [85, 180],
        ],
        {
          stroke: false,
          fillColor: def.color || "#7eb8dc",
          fillOpacity: 1,
          interactive: false,
        }
      );
    }
    return L.tileLayer(def.url, def.options || {});
  }

  /**
   * Adjunta control de terreno a un mapa Leaflet.
   * @param {L.Map} map
   * @param {object} opts
   * @param {function} opts.onStyleChange ({regionFill, borderWeight}) => void
   * @param {string} opts.defaultId
   * @param {HTMLElement|string} opts.mount - contenedor del panel
   */
  function attach(map, opts) {
    opts = opts || {};
    const defaultId = opts.defaultId || "outline";
    let currentId = defaultId;
    let baseLayer = null;
    let labelLayer = null;
    const layerGroup = L.layerGroup().addTo(map);

    function apply(id) {
      const def = LAYERS[id] || LAYERS.outline;
      currentId = def.id;
      layerGroup.clearLayers();
      if (labelLayer) {
        map.removeLayer(labelLayer);
        labelLayer = null;
      }
      baseLayer = createBase(def);
      if (baseLayer.addTo) baseLayer.addTo(layerGroup);
      else layerGroup.addLayer(baseLayer);

      if (def.labels) {
        labelLayer = L.tileLayer(LABEL_URL, {
          maxZoom: 19,
          opacity: 0.85,
          attribution: "Labels &copy; Esri",
        }).addTo(map);
      }

      if (typeof opts.onStyleChange === "function") {
        opts.onStyleChange({
          id: def.id,
          regionFill: def.regionFill,
          borderWeight: def.borderWeight,
        });
      }
      // update buttons
      const root = typeof opts.mount === "string" ? document.querySelector(opts.mount) : opts.mount;
      if (root) {
        root.querySelectorAll("[data-terrain]").forEach((btn) => {
          btn.classList.toggle("active", btn.getAttribute("data-terrain") === def.id);
        });
        const hint = root.querySelector(".terrain-hint");
        if (hint) hint.textContent = def.desc;
      }
    }

    function buildPanel(el) {
      if (!el) return;
      el.classList.add("terrain-panel");
      el.innerHTML =
        '<div class="terrain-title">Terreno / biomas</div>' +
        '<div class="terrain-btns"></div>' +
        '<p class="terrain-hint"></p>' +
        '<div class="terrain-legend">' +
        '<span><i class="t-desert"></i> Desierto / árido</span>' +
        '<span><i class="t-forest"></i> Bosque / vegetación</span>' +
        '<span><i class="t-mount"></i> Montañas / relieve</span>' +
        '<span><i class="t-snow"></i> Nieve / hielo</span>' +
        '<span><i class="t-water"></i> Agua</span>' +
        "</div>";
      const btns = el.querySelector(".terrain-btns");
      Object.keys(LAYERS).forEach((id) => {
        const d = LAYERS[id];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "terrain-btn";
        b.setAttribute("data-terrain", id);
        b.textContent = d.label;
        b.title = d.desc;
        b.addEventListener("click", () => apply(id));
        btns.appendChild(b);
      });
    }

    if (opts.mount) buildPanel(typeof opts.mount === "string" ? document.querySelector(opts.mount) : opts.mount);
    apply(defaultId);

    return {
      set: apply,
      get: () => currentId,
      layers: LAYERS,
    };
  }

  return { LAYERS, attach, createBase };
})();
