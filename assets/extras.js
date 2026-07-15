/**
 * Atlas v6.1 — extras: heatmap, favoritos, share social, wiki, mobile UI helpers
 */
(function (global) {
  const PREF = "atlasv6:";

  function heatColor(t) {
    // t 0..1 → azul → amarillo → rojo
    t = Math.max(0, Math.min(1, t));
    const stops = [
      [0, [49, 130, 189]],
      [0.5, [255, 237, 160]],
      [1, [215, 48, 39]],
    ];
    let a = stops[0],
      b = stops[1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const u = (t - a[0]) / (b[0] - a[0] || 1);
    const rgb = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * u));
    return "rgb(" + rgb.join(",") + ")";
  }

  function metricValue(c, metric) {
    if (!c) return null;
    switch (metric) {
      case "poblacion":
        return c.poblacion;
      case "pib":
        return c.pib_m != null ? c.pib_m : c.pib_m_usd;
      case "pib_pc":
        return c.pib_pc;
      case "idh":
        return window.AtlasCore
          ? AtlasCore.parseIdh(c.idh)
          : parseFloat(c.idh) || null;
      case "area":
        return c.area_km2;
      case "tiles":
        return c.tiles;
      case "power":
        return c.military ? c.military.power_index : c.power;
      case "troops":
        return c.military ? c.military.troops_est : null;
      default:
        return null;
    }
  }

  function heatScale(countries, metric) {
    const vals = countries
      .map((c) => metricValue(c, metric))
      .filter((v) => v != null && isFinite(v) && v > 0);
    if (!vals.length) return () => "#94a3b8";
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const log = max / min > 50;
    return function (c) {
      let v = metricValue(c, metric);
      if (v == null || !isFinite(v) || v <= 0) return "#cbd5e1";
      let t;
      if (log) {
        t = (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min) || 1);
      } else {
        t = (v - min) / (max - min || 1);
      }
      return heatColor(t);
    };
  }

  function getFavs() {
    try {
      return JSON.parse(localStorage.getItem(PREF + "favs") || "[]");
    } catch (e) {
      return [];
    }
  }
  function setFavs(arr) {
    localStorage.setItem(PREF + "favs", JSON.stringify(arr.slice(0, 40)));
  }
  function toggleFav(key) {
    const f = getFavs();
    const i = f.indexOf(key);
    if (i >= 0) f.splice(i, 1);
    else f.unshift(key);
    setFavs(f);
    return f.indexOf(key) >= 0;
  }
  function isFav(key) {
    return getFavs().indexOf(key) >= 0;
  }

  function shareTwitter(text, url) {
    const u =
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(text) +
      "&url=" +
      encodeURIComponent(url || location.href);
    window.open(u, "_blank", "noopener,width=600,height=400");
  }

  function shareNative(title, text, url) {
    if (navigator.share) {
      return navigator.share({ title, text, url: url || location.href });
    }
    return null;
  }

  /** Wikipedia extract (ES) — puede fallar por CORS/red; silencioso */
  async function wikiSummary(titleEs) {
    try {
      const url =
        "https://es.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(titleEs);
      const res = await fetch(url);
      if (!res.ok) return null;
      const j = await res.json();
      return {
        extract: j.extract || "",
        title: j.title || titleEs,
        url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) ||
          "https://es.wikipedia.org/wiki/" + encodeURIComponent(titleEs),
        thumbnail: j.thumbnail && j.thumbnail.source,
      };
    } catch (e) {
      return null;
    }
  }

  function mobilePanels(rootSelector) {
    const root = document.querySelector(rootSelector);
    if (!root) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      root.classList.add("mobile-stack");
    }
    window.addEventListener("resize", () => {
      if (window.matchMedia("(max-width: 900px)").matches)
        root.classList.add("mobile-stack");
      else root.classList.remove("mobile-stack");
    });
  }

  function collapseSection(btn, panel) {
    if (!btn || !panel) return;
    btn.addEventListener("click", () => {
      const open = panel.style.display !== "none";
      panel.style.display = open ? "none" : "";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  global.AtlasExtras = {
    heatColor,
    heatScale,
    metricValue,
    getFavs,
    setFavs,
    toggleFav,
    isFav,
    shareTwitter,
    shareNative,
    wikiSummary,
    mobilePanels,
    collapseSection,
  };
})(window);
