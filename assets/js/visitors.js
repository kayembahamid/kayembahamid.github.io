/* hamcodes-visitors.js · the footer counter, shared by every Hamcodes site.

   This file is identical in every Hamcodes repo that has the counter (Labs, Hacker's Notes,
   Digital Netizenship, The Filter, Bro to Bro, Books, Hi Garten, the personal site and Old Tricks).
   Change it in one place and copy it to the others, the way track.js is kept in step.

   What the number means, exactly: it is the count of distinct people who did something on this
   site. What counts as "something" is decided per site on the server (SITE_COUNTS in
   thefilter-private-app/functions/_lib/sites.js): played a drill, read a note, solved a puzzle,
   opened a book. We do not count page views at all, so somebody who reads a page and leaves is
   never recorded and never appears here. The count is all time, so it only ever climbs.

   Nothing identifying is involved: no cookies, no IP addresses, no names. The id behind the count
   is a random string kept in that one browser, and the country comes from Cloudflare's edge, never
   from a lookup we run.

   It stays up to date on its own: it asks again every 20 seconds while the page is open and
   visible, and a few seconds after the visitor does something, so the number ticks up and a new
   country's flag pops in while somebody is watching.

   Markup it needs, anywhere on the page:
     <div id="visitors" hidden
          data-site="labs"                     (optional, else the server
                                                decides from the origin)
          data-label="People who played here"  (optional)
          data-min="0"                         (optional, 0 shows it from the
                                                first visit, a higher number
                                                keeps it hidden until then)
          data-styled="page"                   (optional: the page's own stylesheet
                                                carries the .hc-vc-* rules, for a site
                                                whose security policy forbids injected
                                                styles)
          data-config="/data/site.json"></div> (optional, a JSON file whose
                                                showVisitors can switch the
                                                counter off without a deploy)

   It styles itself from the host site's own tokens, so Labs comes out mint,
   Hacker's Notes green and Netizen red with no per site stylesheet. */
(function () {
  "use strict";

  var box = document.getElementById("visitors");
  if (!box) return;

  var API = box.dataset.api || "https://private.hamcodes.com/api/visitors";
  var SITE = box.dataset.site || "";
  var LABEL = box.dataset.label || "People who played here";
  var MIN = box.dataset.min == null ? 25 : Number(box.dataset.min);
  var MAX_FLAGS = Number(box.dataset.flags || 40);
  var EVERY = 20000;

  /* ── the look ──────────────────────────────────────────────────────────
     Injected rather than kept in every stylesheet, so this stays one file to
     copy. Every colour falls back through the token names the sites actually
     use: --brand on Labs and The Filter, --green on Hacker's Notes, --red on
     Netizen, then a plain default if a site defines none of them. */
  var ACCENT = "var(--brand, var(--green, var(--red, #3ddba3)))";
  var SURFACE = "var(--surface, var(--ink-1, rgba(255,255,255,.03)))";
  var MUTED = "var(--muted, #8a93a6)";
  var MONO = "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)";

  var CSS = [
    "#visitors{margin:0;padding:26px 0 4px;text-align:center;line-height:1.5}",
    "#visitors[hidden]{display:none}",
    ".hc-vc-line{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;margin:0}",
    ".hc-vc-label{font-family:" + MONO + ";font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:" + MUTED + "}",
    // The odometer: one box per digit, the way a 1999 hit counter did it.
    ".hc-vc-odo{display:inline-flex;gap:3px;padding:3px;border:1px solid " + ACCENT + ";border-radius:5px;background:" + SURFACE + "}",
    ".hc-vc-odo i{font-family:" + MONO + ";font-style:normal;font-weight:700;font-size:1.02rem;line-height:1;color:" + ACCENT + ";background:rgba(0,0,0,.35);padding:7px 6px;border-radius:2px;min-width:1ch;text-align:center}",
    ".hc-vc-from{font-family:" + MONO + ";font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;color:" + MUTED + ";margin:22px 0 10px;font-weight:400}",
    ".hc-vc-flags{display:flex;flex-wrap:wrap;justify-content:center;gap:7px 14px;margin:0;padding:0;list-style:none}",
    ".hc-vc-flags li{font-family:" + MONO + ";font-size:.76rem;color:" + MUTED + ";white-space:nowrap}",
    ".hc-vc-flags b{color:" + ACCENT + ";font-weight:700}",
    ".hc-vc-flags .hc-fl{font-size:.95rem;vertical-align:-1px;margin-right:3px}",
    ".hc-vc-foot{font-size:.74rem;color:" + MUTED + ";margin:16px 0 0}",
    // When the number goes up the digit that changed ticks, and a country that has just arrived pops in.
    "@keyframes hc-vc-bump{0%{transform:translateY(0);filter:brightness(1)}40%{transform:translateY(-4px);filter:brightness(1.8)}100%{transform:none;filter:none}}",
    "@keyframes hc-vc-pop{0%{transform:scale(.5);opacity:0}60%{transform:scale(1.18);opacity:1}100%{transform:none;opacity:1}}",
    ".hc-vc-odo i.hc-b{animation:hc-vc-bump .8s ease}",
    ".hc-vc-flags li.hc-n{animation:hc-vc-pop .9s ease}",
    "@media (prefers-reduced-motion:reduce){.hc-vc-odo i.hc-b,.hc-vc-flags li.hc-n{animation:none}}",
    "@media (max-width:560px){.hc-vc-odo i{font-size:.94rem;padding:6px 5px}.hc-vc-flags{gap:6px 11px}.hc-vc-flags li{font-size:.72rem}}"
  ].join("");

  function style() {
    if (box.dataset.styled === "page" || document.getElementById("hc-vc-css")) return;
    var el = document.createElement("style");
    el.id = "hc-vc-css";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  /* A two letter country code as its flag. Regional indicator letters sit at
     0x1F1E6, so A becomes the first of them and the pair renders as one flag.
     A browser that has no flag font shows the letters, which is why the code
     is always printed beside it. */
  function flag(cc) {
    if (!/^[A-Za-z]{2}$/.test(cc)) return "";
    var pts = cc.toUpperCase().split("").map(function (c) { return 0x1f1e6 + c.charCodeAt(0) - 65; });
    return String.fromCodePoint.apply(null, pts);
  }

  // At least five boxes, so a small number still looks like an odometer.
  function digits(n) {
    var s = String(Math.max(0, n | 0));
    while (s.length < 5) s = "0" + s;
    return s;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* The page is built once, then only changed, so a digit that has not moved does not flicker and
     the ones that have can tick. Country names go in as text, never as markup. */
  var built = null;
  var seen = null; // country -> count on the last answer

  function build() {
    var line = el("p", "hc-vc-line");
    line.appendChild(el("span", "hc-vc-label", LABEL));
    var odo = el("span", "hc-vc-odo");
    odo.setAttribute("aria-hidden", "true");
    line.appendChild(odo);
    var from = el("h2", "hc-vc-from", "Visitors from");
    var list = el("ul", "hc-vc-flags");
    var foot = el("p", "hc-vc-foot", "Counted anonymously. No cookies, no accounts, no personal data.");
    box.textContent = "";
    box.appendChild(line);
    box.appendChild(from);
    box.appendChild(list);
    box.appendChild(foot);
    built = { odo: odo, from: from, list: list };
  }

  function render(d) {
    var first = !built;
    if (first) build();
    var s = digits(d.total);

    // the odometer: add boxes if the number grew a digit, tick the ones that changed
    while (built.odo.children.length < s.length) built.odo.insertBefore(el("i", null, "0"), built.odo.firstChild);
    var kids = built.odo.children;
    for (var i = 0; i < s.length; i++) {
      var k = kids[kids.length - s.length + i];
      if (k.textContent !== s.charAt(i)) {
        k.textContent = s.charAt(i);
        if (!first) { k.classList.remove("hc-b"); void k.offsetWidth; k.classList.add("hc-b"); }
      }
    }

    // the countries: a new one pops in, one whose number went up ticks
    var rows = (d.countries || []).slice(0, MAX_FLAGS);
    built.list.textContent = "";
    var now = {};
    rows.forEach(function (x) {
      var li = el("li");
      var f = flag(x.c);
      if (f) li.appendChild(el("span", "hc-fl", f));
      li.appendChild(document.createTextNode(String(x.c).slice(0, 2).toUpperCase() + " "));
      li.appendChild(el("b", null, String(x.n | 0)));
      now[x.c] = x.n | 0;
      if (seen && (seen[x.c] === undefined || now[x.c] > seen[x.c])) li.className = "hc-n";
      built.list.appendChild(li);
    });
    built.from.hidden = built.list.hidden = !rows.length;
    seen = now;

    // The odometer is decoration; this is what a screen reader reads out.
    box.setAttribute("aria-label", LABEL + ": " + (d.total | 0));
    style();
    box.hidden = false;
  }

  function count() {
    var url = API + (SITE ? "?site=" + encodeURIComponent(SITE) : "");
    return fetch(url, { mode: "cors" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        // data-min="0" shows the counter from the very first visit, zero and
        // all, so it can be watched counting. Any higher number keeps it
        // hidden until the count is worth showing.
        if (MIN > 0 && (!d.total || d.total < MIN)) return;
        render(d);
      });
  }

  /* Keep it moving. While the page is open and visible it asks again every 20 seconds, and it asks
     again a few seconds after the visitor's own action, so they can watch their own click count. */
  var timer = null;
  var soon = [];
  function poll() {
    if (document.visibilityState === "hidden") return;
    count().catch(function () { /* a counter is never worth an error on the page */ });
  }
  function start() {
    if (timer) return;
    timer = setInterval(poll, EVERY);
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && built) poll(); });

  function afterAction() {
    soon.forEach(clearTimeout);
    soon = [setTimeout(poll, 3500), setTimeout(poll, 13000)];
  }
  function watchEvents() {
    var t = window.HC_TRACK;
    if (typeof t !== "function" || t.__vc) return;
    var wrapped = function () { var r = t.apply(this, arguments); afterAction(); return r; };
    wrapped.__vc = true;
    window.HC_TRACK = wrapped;
  }

  // A site may keep the switch in a JSON file, so the counter can be turned
  // off by editing one line rather than by shipping a new page.
  var CONFIG = box.dataset.config || "";
  var begin = CONFIG
    ? fetch(CONFIG, { cache: "no-cache" })
        .then(function (r) { return r.json(); })
        .then(function (c) {
          // Off unless the file says on, which is how the switch is documented.
          if (!c || !c.showVisitors) return;
          if (typeof c.visitorsMin === "number") MIN = c.visitorsMin;
          return count();
        })
    : count();

  begin.then(function () { watchEvents(); start(); }).catch(function () { /* a counter is never worth an error on the page */ });
  watchEvents();
})();
