(function () {
  "use strict";

  const dataEl = document.getElementById("report-data");
  const data = JSON.parse(dataEl.textContent || "{}");

  const state = {
    snapshotIndex: 0,
    regionIndex: 0,
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /** Match engine: drop shorthand `background` when longhands are present. */
  function collapseBackgroundStyleDiffForDisplay(entries) {
    if (!entries || !entries.length) return entries;
    var props = {};
    entries.forEach(function (e) {
      props[e.prop] = true;
    });
    if (!props.background) return entries;
    if (!props.backgroundImage && !props.backgroundColor) return entries;
    return entries.filter(function (e) {
      return e.prop !== "background";
    });
  }

  function htmlStyleDiff(styleDiff) {
    var rows = collapseBackgroundStyleDiffForDisplay(styleDiff);
    var html = '<div class="style-diff">';
    rows.forEach(function (d) {
      if (d.before) {
        html +=
          '<div class="row removed"><span class="marker"></span><span>' +
          escapeHtml(d.prop) +
          ": " +
          escapeHtml(d.before) +
          ";</span></div>";
      }
      if (d.after) {
        html +=
          '<div class="row added"><span class="marker"></span><span>' +
          escapeHtml(d.prop) +
          ": " +
          escapeHtml(d.after) +
          ";</span></div>";
      }
    });
    html += "</div>";
    return html;
  }

  /** Inner HTML for one ElementChange (no wrapping h4). */
  function htmlForChangeDetail(change) {
    if (!change) {
      return '<div class="empty">—</div>';
    }
    if (change.kind === "styled") {
      return htmlStyleDiff(change.styleDiff);
    }
    if (change.kind === "shifted") {
      return (
        '<div class="empty">Element shifted by Δx=' +
        change.deltaXY[0].toFixed(0) +
        ", Δy=" +
        change.deltaXY[1].toFixed(0) +
        "px (no computed style change tracked).</div>"
      );
    }
    if (change.kind === "resized") {
      return (
        '<div class="empty">Element resized: ' +
        formatRect(change.before) +
        " → " +
        formatRect(change.after) +
        ".</div>"
      );
    }
    if (change.kind === "deleted") {
      return '<div class="empty">Element removed in current build.</div>';
    }
    if (change.kind === "new") {
      return '<div class="empty">Element added in current build.</div>';
    }
    return '<div class="empty">—</div>';
  }

  function currentSnapshot() {
    return data.snapshots[state.snapshotIndex];
  }

  function renderTabs() {
    const tabs = $("#snapshot-tabs");
    tabs.innerHTML = "";
    data.snapshots.forEach(function (snap, idx) {
      const btn = document.createElement("button");
      btn.textContent =
        snap.snapshot +
        "  •  " +
        snap.diffPercent.toFixed(2) +
        "% diff";
      if (idx === state.snapshotIndex) btn.classList.add("active");
      btn.addEventListener("click", function () {
        state.snapshotIndex = idx;
        state.regionIndex = 0;
        renderAll();
      });
      tabs.appendChild(btn);
    });
  }

  function renderImages() {
    const snap = currentSnapshot();
    $("#baseline-img").src = snap.baselineImage;
    $("#current-img").src = snap.currentImage;

    const img = $("#current-img");
    const overlay = $("#current-overlay");
    overlay.innerHTML = "";

    function paintRegions() {
      const rect = img.getBoundingClientRect();
      const scaleX = rect.width / snap.imageWidth;
      const scaleY = rect.height / snap.imageHeight;
      overlay.style.width = rect.width + "px";
      overlay.style.height = rect.height + "px";
      overlay.innerHTML = "";
      snap.regions.forEach(function (r, idx) {
        const dr = r.displayRegion || r.region;
        const box = document.createElement("div");
        box.className = "region-box";
        if (idx === state.regionIndex) box.classList.add("active");
        box.style.left = dr.x * scaleX + "px";
        box.style.top = dr.y * scaleY + "px";
        box.style.width = dr.w * scaleX + "px";
        box.style.height = dr.h * scaleY + "px";
        box.innerHTML =
          '<span class="badge">#' + (idx + 1) + "</span>";
        box.addEventListener("click", function (ev) {
          ev.stopPropagation();
          state.regionIndex = idx;
          renderRegions();
          renderRca();
        });
        overlay.appendChild(box);
      });
    }

    if (img.complete && img.naturalWidth > 0) {
      paintRegions();
    } else {
      img.addEventListener("load", paintRegions, { once: true });
    }
    window.addEventListener("resize", paintRegions);
  }

  function renderRegions() {
    $$(".region-box").forEach(function (b, idx) {
      b.classList.toggle("active", idx === state.regionIndex);
    });
  }

  function renderRca() {
    const snap = currentSnapshot();
    const region = snap.regions[state.regionIndex];
    const titleEl = $("#rca-title");
    const navEl = $("#rca-nav");
    const colHtml = $("#rca-html");
    const colStyles = $("#rca-styles");
    const colBox = $("#rca-box");

    if (!region) {
      titleEl.textContent = "Root Cause Analysis";
      navEl.textContent = "no diffs";
      colHtml.innerHTML =
        '<h4>HTML</h4><div class="empty">No regions to inspect.</div>';
      colStyles.innerHTML = '<h4>Styles</h4><div class="empty">—</div>';
      colBox.innerHTML = '<h4>Box Model</h4><div class="empty">—</div>';
      return;
    }

    const total = snap.regions.length;
    titleEl.innerHTML =
      "Root Cause Analysis" +
      ' <span class="empty">•  region #' +
      (state.regionIndex + 1) +
      "</span>";
    navEl.innerHTML =
      state.regionIndex +
      1 +
      " / " +
      total +
      ' <button id="prev-region" title="Previous (←)">‹</button>' +
      ' <button id="next-region" title="Next (→)">›</button>';
    $("#prev-region").addEventListener("click", function () {
      state.regionIndex = (state.regionIndex - 1 + total) % total;
      renderRegions();
      renderRca();
    });
    $("#next-region").addEventListener("click", function () {
      state.regionIndex = (state.regionIndex + 1) % total;
      renderRegions();
      renderRca();
    });

    const suspect = region.primarySuspect;
    if (!suspect) {
      colHtml.innerHTML =
        '<h4>HTML</h4><div class="empty">No matching DOM element.</div>';
      colStyles.innerHTML =
        '<h4>Styles</h4><div class="empty">Pixel-only diff (no tracked DOM property changed).</div>';
    } else {
      colHtml.innerHTML =
        "<h4>HTML</h4>" +
        '<div class="selector">' +
        escapeHtml(suspect.cssSelector) +
        '<span class="tag-pill">' +
        escapeHtml(suspect.tag) +
        "</span></div>" +
        '<div class="xpath">' +
        escapeHtml(suspect.xpath) +
        "</div>" +
        '<button class="copy-btn" id="copy-xpath">Copy XPath</button>' +
        (suspect.visualOnly
          ? '<div class="empty" style="margin-top:8px">Pixel diff only — no tracked computedStyle change.</div>'
          : "");
      $("#copy-xpath").addEventListener("click", function () {
        navigator.clipboard.writeText(suspect.xpath);
      });

      const change = suspect.change;
      let stylesHtml = "<h4>Styles</h4>";
      if (change) {
        stylesHtml += htmlForChangeDetail(change);
      } else {
        stylesHtml +=
          '<div class="empty">No tracked computedStyle change for this element.</div>';
      }
      colStyles.innerHTML = stylesHtml;

      const r = suspect.rect;
      colBox.innerHTML =
        "<h4>Box Model</h4>" +
        '<div class="box-model">' +
        '<div class="row"><span class="label">x</span><span>' +
        Math.round(r.x) +
        "</span></div>" +
        '<div class="row"><span class="label">y</span><span>' +
        Math.round(r.y) +
        "</span></div>" +
        '<div class="row"><span class="label">width</span><span>' +
        Math.round(r.w) +
        "</span></div>" +
        '<div class="row"><span class="label">height</span><span>' +
        Math.round(r.h) +
        "</span></div>" +
        "</div>";
    }
  }

  function formatRect(r) {
    return (
      Math.round(r.w) +
      "×" +
      Math.round(r.h) +
      " @ (" +
      Math.round(r.x) +
      "," +
      Math.round(r.y) +
      ")"
    );
  }

  function isBackgroundStyledChange(ch) {
    if (!ch || ch.kind !== "styled") return false;
    return ch.styleDiff.some(function (d) {
      return (
        d.prop === "background" ||
        d.prop === "backgroundColor" ||
        d.prop === "backgroundImage"
      );
    });
  }

  function compareUnattributed(a, b) {
    var abg = isBackgroundStyledChange(a) ? 0 : 1;
    var bbg = isBackgroundStyledChange(b) ? 0 : 1;
    if (abg !== bbg) return abg - bbg;
    var sa = (a.cssSelector || "") + "\0" + (a.xpath || "");
    var sb = (b.cssSelector || "") + "\0" + (b.xpath || "");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /** Stable signature for grouping duplicate unattributed rows (same UX story). */
  function unattributedGroupKey(ch) {
    var sel = ch.cssSelector || "";
    var tag = ch.tag || "";
    if (ch.kind === "styled") {
      var sig = (ch.styleDiff || [])
        .slice()
        .map(function (e) {
          return { prop: e.prop, before: e.before, after: e.after };
        })
        .sort(function (a, b) {
          return a.prop.localeCompare(b.prop);
        });
      return ch.kind + "\0" + sel + "\0" + tag + "\0" + JSON.stringify(sig);
    }
    if (ch.kind === "shifted") {
      return (
        ch.kind +
        "\0" +
        sel +
        "\0" +
        tag +
        "\0" +
        ch.deltaXY[0] +
        "," +
        ch.deltaXY[1]
      );
    }
    if (ch.kind === "resized") {
      return (
        ch.kind +
        "\0" +
        sel +
        "\0" +
        tag +
        "\0" +
        JSON.stringify([ch.before, ch.after])
      );
    }
    if (ch.kind === "deleted") {
      return ch.kind + "\0" + sel + "\0" + tag + "\0" + JSON.stringify(ch.before);
    }
    if (ch.kind === "new") {
      return ch.kind + "\0" + sel + "\0" + tag + "\0" + JSON.stringify(ch.after);
    }
    return ch.kind + "\0" + (ch.xpath || "");
  }

  function groupUnattributed(list) {
    var sorted = list.slice().sort(compareUnattributed);
    var map = new Map();
    sorted.forEach(function (ch) {
      var k = unattributedGroupKey(ch);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ch);
    });
    return Array.from(map.values());
  }

  function renderUnattributed() {
    const snap = currentSnapshot();
    const list = snap.unattributedChanges || [];
    const groups = groupUnattributed(list);
    const countEl = $("#unattributed-count");
    if (countEl) {
      if (groups.length < list.length) {
        countEl.textContent =
          groups.length + " groups · " + list.length + " changes";
      } else {
        countEl.textContent = "(" + list.length + ")";
      }
    }

    const container = $("#unattributed-list");
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML =
        '<p class="empty unattributed-empty">None — every tracked change maps to a region above.</p>';
      return;
    }

    container.innerHTML = groups
      .map(function (grp) {
        var ch = grp[0];
        var n = grp.length;
        var sel = ch.cssSelector || "—";
        var tag = ch.tag || "";
        var detail = htmlForChangeDetail(ch);
        var dupBadge =
          n > 1
            ? '<span class="unattributed-dup-count" title="' +
              n +
              ' elements share this change">×' +
              n +
              "</span>"
            : "";
        var xpathBlock;
        if (n === 1) {
          var xpath = ch.xpath || "";
          xpathBlock =
            '<details class="unattributed-meta">' +
            "<summary>XPath</summary>" +
            '<div class="xpath">' +
            escapeHtml(xpath) +
            "</div>" +
            '<button type="button" class="copy-btn copy-btn-unattributed" data-xpath="' +
            escapeAttr(xpath) +
            '">Copy XPath</button>' +
            "</details>";
        } else {
          xpathBlock =
            '<details class="unattributed-meta">' +
            "<summary>XPath (" +
            n +
            ")</summary>" +
            '<ul class="unattributed-xpath-list">';
          grp.forEach(function (one) {
            var xp = one.xpath || "";
            xpathBlock +=
              "<li>" +
              '<div class="xpath">' +
              escapeHtml(xp) +
              "</div>" +
              '<button type="button" class="copy-btn copy-btn-unattributed" data-xpath="' +
              escapeAttr(xp) +
              '">Copy</button>' +
              "</li>";
          });
          xpathBlock += "</ul></details>";
        }
        return (
          '<div class="unattributed-item">' +
          '<div class="unattributed-item-head">' +
          '<span class="kind-badge">' +
          escapeHtml(ch.kind) +
          "</span>" +
          dupBadge +
          '<span class="selector mono">' +
          escapeHtml(sel) +
          "</span>" +
          (tag
            ? '<span class="tag-pill">' + escapeHtml(tag) + "</span>"
            : "") +
          "</div>" +
          xpathBlock +
          '<div class="unattributed-change"><h4 class="inline-h4">Details</h4>' +
          detail +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderAll() {
    renderTabs();
    renderImages();
    renderRca();
    renderUnattributed();
  }

  var unattributedListEl = $("#unattributed-list");
  if (unattributedListEl) {
    unattributedListEl.addEventListener("click", function (ev) {
      var t = ev.target;
      if (
        t &&
        t.classList &&
        t.classList.contains("copy-btn-unattributed")
      ) {
        var xp = t.getAttribute("data-xpath");
        if (xp) navigator.clipboard.writeText(xp);
      }
    });
  }

  document.addEventListener("keydown", function (ev) {
    const snap = currentSnapshot();
    if (!snap || snap.regions.length === 0) return;
    if (ev.key === "ArrowRight") {
      state.regionIndex = (state.regionIndex + 1) % snap.regions.length;
      renderRegions();
      renderRca();
    } else if (ev.key === "ArrowLeft") {
      state.regionIndex =
        (state.regionIndex - 1 + snap.regions.length) %
        snap.regions.length;
      renderRegions();
      renderRca();
    }
  });

  renderAll();
})();
