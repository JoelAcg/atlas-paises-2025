/**
 * Atlas v6 — núcleo compartido
 * tema, i18n, caché, fetch, utilidades, export, share
 */
(function (global) {
  const CACHE_VER = "atlas-v6-20260715";
  const CACHE_PREFIX = "atlasv6:";

  const I18N = {
    es: {
      indexTitle: "Mapas con regiones coloreadas",
      search: "Buscar país…",
      combine: "Combinar países",
      quiz: "Cuestionario",
      dark: "Tema oscuro",
      light: "Tema claro",
      all: "Todos",
      continent: "Continente",
      sortBy: "Ordenar",
      pop: "Población",
      gdp: "PIB",
      tiles: "Tiles",
      area: "Área",
      power: "Poder (proxy)",
      page: "Página",
      of: "de",
      back: "Índice",
      hideNames: "Ocultar nombres",
      showNames: "Mostrar nombres",
      hideRegions: "Ocultar regiones",
      showRegions: "Mostrar regiones",
      exportPng: "Exportar PNG",
      share: "Compartir enlace",
      learn: "Aprender",
      loading: "Cargando…",
      capital: "Capital",
      regions: "Regiones",
      cities: "Ciudades",
      sources: "Fuentes",
      alliance: "Alianza",
      war: "Guerra",
      warSim: "Simulador",
      outlineOnly: "Solo contornos",
      charts: "Gráficos",
      clear: "Limpiar",
      selected: "seleccionados",
      max8: "Máximo 8 países",
      heat: "Mapa de calor",
      none: "N/D",
      tour: "Rutas temáticas",
      lang: "Idioma",
    },
    en: {
      indexTitle: "Colored regional maps",
      search: "Search country…",
      combine: "Combine countries",
      quiz: "Quiz",
      dark: "Dark theme",
      light: "Light theme",
      all: "All",
      continent: "Continent",
      sortBy: "Sort",
      pop: "Population",
      gdp: "GDP",
      tiles: "Tiles",
      area: "Area",
      power: "Power (proxy)",
      page: "Page",
      of: "of",
      back: "Index",
      hideNames: "Hide labels",
      showNames: "Show labels",
      hideRegions: "Hide regions",
      showRegions: "Show regions",
      exportPng: "Export PNG",
      share: "Share link",
      learn: "Learn",
      loading: "Loading…",
      capital: "Capital",
      regions: "Regions",
      cities: "Cities",
      sources: "Sources",
      alliance: "Alliance",
      war: "War",
      warSim: "Simulator",
      outlineOnly: "Outlines only",
      charts: "Charts",
      clear: "Clear",
      selected: "selected",
      max8: "Max 8 countries",
      heat: "Heat map",
      none: "N/A",
      tour: "Themed tours",
      lang: "Language",
    },
  };

  function getLang() {
    return localStorage.getItem(CACHE_PREFIX + "lang") || "es";
  }
  function setLang(l) {
    localStorage.setItem(CACHE_PREFIX + "lang", l === "en" ? "en" : "es");
    document.documentElement.lang = getLang();
  }
  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) || I18N.es[key] || key;
  }

  function getTheme() {
    return localStorage.getItem(CACHE_PREFIX + "theme") || "light";
  }
  function applyTheme(theme) {
    const th = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", th);
    localStorage.setItem(CACHE_PREFIX + "theme", th);
  }
  function toggleTheme() {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj.v !== CACHE_VER) return null;
      return obj.d;
    } catch (e) {
      return null;
    }
  }
  function cacheSet(key, data) {
    try {
      localStorage.setItem(
        CACHE_PREFIX + key,
        JSON.stringify({ v: CACHE_VER, d: data, t: Date.now() })
      );
    } catch (e) {
      // quota: drop oldest atlas keys
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(CACHE_PREFIX))
          .slice(0, 20)
          .forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(
          CACHE_PREFIX + key,
          JSON.stringify({ v: CACHE_VER, d: data, t: Date.now() })
        );
      } catch (e2) {}
    }
  }

  function isFileProtocol() {
    return location.protocol === "file:";
  }

  function showFileProtocolBanner() {
    if (!isFileProtocol()) return;
    if (document.getElementById("fileProtoBanner")) return;
    const bar = document.createElement("div");
    bar.id = "fileProtoBanner";
    bar.setAttribute("role", "alert");
    bar.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.92);color:#fff;" +
      "display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif";
    bar.innerHTML =
      '<div style="max-width:520px;background:#1e293b;border:1px solid #334155;border-radius:16px;padding:22px 24px;line-height:1.45">' +
      "<h2 style=\"margin:0 0 10px;font-size:1.25rem\">No abras el HTML con doble clic</h2>" +
      "<p style=\"margin:0 0 10px;color:#cbd5e1\">El navegador bloquea la carga de JSON en <code>file://</code>. " +
      "Por eso ves errores o la página no carga datos.</p>" +
      "<p style=\"margin:0 0 8px\"><b>Solución:</b></p>" +
      "<ol style=\"margin:0 0 12px;padding-left:1.2em;color:#e2e8f0\">" +
      "<li>Ve a la carpeta <code>Mapas_HTML_2025</code></li>" +
      "<li>Ejecuta <code>serve-atlas.bat</code></li>" +
      "<li>Abre <code>http://127.0.0.1:5500/index.html</code></li>" +
      "</ol>" +
      "<p style=\"margin:0;font-size:.85rem;color:#94a3b8\">Si falta data, en Documentos\\Paises ejecuta: " +
      "<code>node _build_atlas_v6.js</code></p>" +
      '<p style="margin:14px 0 0"><button type="button" id="fileProtoDismiss" style="padding:8px 14px;border-radius:999px;border:0;background:#3b82f6;color:#fff;font-weight:700;cursor:pointer">Entendido</button></p>' +
      "</div>";
    document.body.appendChild(bar);
    document.getElementById("fileProtoDismiss").onclick = () => bar.remove();
  }

  async function fetchJson(url, opts) {
    if (isFileProtocol()) {
      showFileProtocolBanner();
      throw new Error(
        "Protocolo file:// bloqueado. Ejecuta serve-atlas.bat y abre http://127.0.0.1:5500/"
      );
    }
    const useCache = !opts || opts.cache !== false;
    const ck = "json:" + url;
    if (useCache) {
      const hit = cacheGet(ck);
      if (hit) return hit;
    }
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status + " al pedir " + url);
    const data = await res.json();
    if (useCache) cacheSet(ck, data);
    return data;
  }

  function fmtPop(n) {
    if (n == null || !isFinite(n)) return t("none");
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  }
  function fmtNum(n) {
    if (n == null || !isFinite(n)) return t("none");
    return Math.round(n).toLocaleString(getLang() === "en" ? "en-US" : "es-ES");
  }
  function parseIdh(v) {
    if (v == null || v === "N/D" || v === "N/A") return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function parseDeuda(v) {
    if (v == null || v === "N/D" || v === "N/A") return null;
    const n = parseFloat(String(v).replace("%", "").replace(",", "."));
    return isFinite(n) ? n : null;
  }
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function wireChrome(opts) {
    opts = opts || {};
    applyTheme(getTheme());
    document.documentElement.lang = getLang();
    if (isFileProtocol()) {
      // banner as soon as DOM ready
      if (document.body) showFileProtocolBanner();
      else document.addEventListener("DOMContentLoaded", showFileProtocolBanner);
    }

    const themeBtn = document.getElementById("btnTheme");
    if (themeBtn) {
      const sync = () => {
        themeBtn.textContent = getTheme() === "dark" ? "☀ " + t("light") : "🌙 " + t("dark");
        themeBtn.setAttribute("aria-label", themeBtn.textContent);
      };
      sync();
      themeBtn.addEventListener("click", () => {
        toggleTheme();
        sync();
      });
    }

    const langBtn = document.getElementById("btnLang");
    if (langBtn) {
      langBtn.textContent = getLang() === "es" ? "EN" : "ES";
      langBtn.addEventListener("click", () => {
        setLang(getLang() === "es" ? "en" : "es");
        location.reload();
      });
    }

    // keyboard: / focuses search
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement && document.activeElement.tagName !== "INPUT") {
        const q = document.getElementById("q") || document.getElementById("search");
        if (q) {
          e.preventDefault();
          q.focus();
        }
      }
    });

    if (opts.i18nApply) opts.i18nApply(t);
  }

  function shareUrl(params) {
    const u = new URL(location.href);
    Object.keys(params || {}).forEach((k) => {
      if (params[k] == null || params[k] === "") u.searchParams.delete(k);
      else u.searchParams.set(k, params[k]);
    });
    return u.toString();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        return true;
      } catch (e2) {
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  /** Export map container as PNG (html2canvas if present, else leaflet tips) */
  async function exportMapPng(el, filename) {
    filename = filename || "mapa-atlas.png";
    if (global.html2canvas) {
      const canvas = await global.html2canvas(el, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: getTheme() === "dark" ? "#0f172a" : "#ffffff",
        scale: 2,
      });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = filename;
      a.click();
      return true;
    }
    alert(
      getLang() === "en"
        ? "PNG export needs html2canvas (loaded on this page)."
        : "Exportar PNG requiere html2canvas (incluido en esta página)."
    );
    return false;
  }

  function injectToolbar() {
    // optional floating a11y skip
    if (document.getElementById("skipMain")) return;
    const a = document.createElement("a");
    a.id = "skipMain";
    a.className = "skip-link";
    a.href = "#main";
    a.textContent = getLang() === "en" ? "Skip to content" : "Saltar al contenido";
    document.body.prepend(a);
  }

  global.AtlasCore = {
    CACHE_VER,
    I18N,
    t,
    getLang,
    setLang,
    getTheme,
    applyTheme,
    toggleTheme,
    fetchJson,
    isFileProtocol,
    showFileProtocolBanner,
    cacheGet,
    cacheSet,
    fmtPop,
    fmtNum,
    parseIdh,
    parseDeuda,
    escapeHtml,
    wireChrome,
    shareUrl,
    copyText,
    exportMapPng,
    injectToolbar,
  };
})(window);
