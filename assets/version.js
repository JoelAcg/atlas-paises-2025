/**
 * Versión pública del Atlas.
 * REGLA: cada cambio que subas a GitHub → sube este número
 *   patch  6.3.0 → 6.3.1  (bugfix)
 *   minor  6.3.1 → 6.4.0  (feature)
 *   major  6.4.0 → 7.0.0  (cambio grande)
 */
window.ATLAS_VERSION = "6.3.0";
window.ATLAS_VERSION_DATE = "2026-07-15";
window.ATLAS_VERSION_LABEL = "Guerra RT + modal fix";

(function () {
  function paint() {
    var v = window.ATLAS_VERSION || "?";
    var d = window.ATLAS_VERSION_DATE || "";
    var label = window.ATLAS_VERSION_LABEL || "";
    var text = "Versión: " + v + (d ? " · " + d : "");
    var title = text + (label ? " — " + label : "");

    document.querySelectorAll("[data-atlas-version]").forEach(function (el) {
      el.textContent = text;
      el.setAttribute("title", title);
    });

    // badge automático en .nav si no hay ninguno
    if (!document.querySelector("[data-atlas-version]")) {
      var nav = document.querySelector(".nav") || document.querySelector(".topbar");
      if (nav) {
        var b = document.createElement("span");
        b.className = "badge atlas-version-badge";
        b.setAttribute("data-atlas-version", "1");
        b.textContent = text;
        b.title = title;
        nav.appendChild(b);
      }
    }

    // footer
    document.querySelectorAll(".footer").forEach(function (f) {
      if (f.dataset.verDone) return;
      f.dataset.verDone = "1";
      var s = document.createElement("div");
      s.style.marginTop = "6px";
      s.style.fontWeight = "700";
      s.setAttribute("data-atlas-version", "1");
      s.textContent = text;
      s.title = title;
      f.appendChild(s);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paint);
  } else {
    paint();
  }
})();
