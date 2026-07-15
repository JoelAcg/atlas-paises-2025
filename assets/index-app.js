/** Index v6 — filtros, paginación, vista grid/lista, tours */
(function () {
  const C = window.AtlasCore;
  let DATA = null;
  let view = localStorage.getItem("atlasv6:view") || "grid";
  let page = 1;
  let onlyFavs = false;
  const PAGE_SIZE = 24;

  function toast(msg) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1800);
  }

  function filtered() {
    const q = (document.getElementById("q").value || "").trim().toLowerCase();
    const cont = document.getElementById("fContinent").value;
    const sort = document.getElementById("fSort").value;
    let list = DATA.countries.slice();
    if (cont && cont !== "all") {
      list = list.filter((c) => c.region === cont || c.continent === cont);
    }
    if (q) {
      list = list.filter(
        (c) =>
          c.es.toLowerCase().includes(q) ||
          c.key.toLowerCase().includes(q) ||
          (c.iso || "").toLowerCase().includes(q) ||
          (c.capital || "").toLowerCase().includes(q)
      );
    }
    if (onlyFavs && window.AtlasExtras) {
      const favs = AtlasExtras.getFavs();
      list = list.filter((c) => favs.indexOf(c.key) >= 0);
    }
    const sorters = {
      name: (a, b) => a.es.localeCompare(b.es, "es"),
      pop: (a, b) => (b.poblacion || 0) - (a.poblacion || 0),
      pib: (a, b) => (b.pib_m || 0) - (a.pib_m || 0),
      tiles: (a, b) => (b.tiles || 0) - (a.tiles || 0),
      area: (a, b) => (b.area_km2 || 0) - (a.area_km2 || 0),
      power: (a, b) => (b.power || 0) - (a.power || 0),
    };
    list.sort(sorters[sort] || sorters.name);
    return list;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const grid = document.getElementById("grid");
    grid.className = view === "list" ? "index-list" : "index-grid";
    grid.innerHTML = slice
      .map((c) => {
        const href = "atlas.html?pais=" + encodeURIComponent(c.key);
        return (
          '<a class="index-card" href="' +
          href +
          '" data-name="' +
          C.escapeHtml(c.es + " " + c.key) +
          '" aria-label="' +
          C.escapeHtml(c.es) +
          '">' +
          '<div class="t"><img src="' +
          C.escapeHtml(c.flag) +
          '" alt="" width="40" height="28" loading="lazy" onerror="this.style.visibility=\'hidden\'"/> ' +
          C.escapeHtml(c.es) +
          "</div>" +
          '<div class="m">' +
          (c.regions || 0) +
          " regiones · " +
          c.tiles +
          " tiles · Pop " +
          C.escapeHtml(c.poblacion_fmt || "N/D") +
          (c.power != null ? " · ⚔ " + c.power : "") +
          "</div></a>"
        );
      })
      .join("");

    document.getElementById("pagInfo").textContent =
      C.t("page") +
      " " +
      page +
      " " +
      C.t("of") +
      " " +
      pages +
      " · " +
      list.length +
      " países";
    document.getElementById("btnPrev").disabled = page <= 1;
    document.getElementById("btnNext").disabled = page >= pages;
    document.getElementById("countBadge").textContent = list.length + " / " + DATA.count;
  }

  async function boot() {
    C.wireChrome({
      i18nApply: (t) => {
        document.getElementById("h1").textContent = t("indexTitle");
        document.getElementById("q").placeholder = t("search");
        document.getElementById("linkCombo").textContent = "⚔ " + t("combine");
        document.getElementById("linkQuiz").textContent = "🧠 " + t("quiz");
      },
    });
    C.injectToolbar();
    DATA = await C.fetchJson("data/index.json");

    // continents
    const conts = [
      ...new Set(DATA.countries.map((c) => c.region).filter(Boolean)),
    ].sort();
    const sel = document.getElementById("fContinent");
    sel.innerHTML =
      '<option value="all">' +
      C.t("all") +
      "</option>" +
      conts
        .map((c) => '<option value="' + C.escapeHtml(c) + '">' + C.escapeHtml(c) + "</option>")
        .join("");

    document.getElementById("q").addEventListener("input", () => {
      page = 1;
      render();
    });
    document.getElementById("fContinent").addEventListener("change", () => {
      page = 1;
      render();
    });
    document.getElementById("fSort").addEventListener("change", () => {
      page = 1;
      render();
    });
    document.getElementById("btnPrev").addEventListener("click", () => {
      page--;
      render();
    });
    document.getElementById("btnNext").addEventListener("click", () => {
      page++;
      render();
    });
    document.getElementById("btnGrid").addEventListener("click", () => {
      view = "grid";
      localStorage.setItem("atlasv6:view", view);
      document.getElementById("btnGrid").classList.add("on");
      document.getElementById("btnList").classList.remove("on");
      render();
    });
    document.getElementById("btnList").addEventListener("click", () => {
      view = "list";
      localStorage.setItem("atlasv6:view", view);
      document.getElementById("btnList").classList.add("on");
      document.getElementById("btnGrid").classList.remove("on");
      render();
    });
    if (view === "list") {
      document.getElementById("btnList").classList.add("on");
      document.getElementById("btnGrid").classList.remove("on");
    }

    document.getElementById("tourBig")?.addEventListener("click", () => {
      document.getElementById("fSort").value = "area";
      page = 1;
      render();
      toast("Orden: área");
    });
    document.getElementById("tourPop")?.addEventListener("click", () => {
      document.getElementById("fSort").value = "pop";
      page = 1;
      render();
      toast("Orden: población");
    });
    document.getElementById("tourPower")?.addEventListener("click", () => {
      document.getElementById("fSort").value = "power";
      page = 1;
      render();
      toast("Orden: poder proxy");
    });
    document.getElementById("btnOnlyFavs")?.addEventListener("click", (e) => {
      onlyFavs = !onlyFavs;
      e.target.style.fontWeight = onlyFavs ? "900" : "";
      e.target.style.borderColor = onlyFavs ? "#f59e0b" : "";
      page = 1;
      render();
      toast(onlyFavs ? "Solo favoritos" : "Todos los países");
    });

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      boot().catch((e) => {
        console.error(e);
        const file = location.protocol === "file:";
        document.getElementById("grid").innerHTML =
          '<div class="alert" style="text-align:left">' +
          (file
            ? "<b>Doble clic no funciona.</b> Ejecuta <code>serve-atlas.bat</code> y abre " +
              "<a href='http://127.0.0.1:5500/index.html'>http://127.0.0.1:5500/index.html</a>"
            : "Error: " +
              (window.AtlasCore
                ? AtlasCore.escapeHtml(e.message || String(e))
                : e) +
              "<br>Si falta data: <code>node _build_atlas_v6.js</code>") +
          "</div>";
      })
    );
  } else boot();
})();
