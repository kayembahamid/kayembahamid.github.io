/* hamcodes-track.js · anonymous action events, shared by Labs, Hacker's Notes
   and Digital Netizenship. The Filter has its own track.js because it carries
   extra rules about who is tracked in the paid game.

   This file is identical in course-hackers-methodology, site-hackers-notes and
   site-digital-netizenship. Change it in one place and copy it to the others.

   What it sends: one short event when somebody does something, posted with
   navigator.sendBeacon so it never delays a page or a click. A random id kept
   in this browser, the path, and the event's own name. No cookies, no IP
   address, no email, no name. Nothing at all is sent when the browser asks not
   to be tracked, through Global Privacy Control or Do Not Track.

   Page views are deliberately not counted. Somebody who reads and leaves is
   not recorded, which is why the footer counter says "people who played".

   Use it as window.HC_TRACK("drill_opened", { id: "phish-1" }). It also wires
   itself to anything carrying data-track="event_name" with no extra code. */
(function () {
  "use strict";

  var ENDPOINT = (document.currentScript && document.currentScript.dataset.endpoint) || "https://private.hamcodes.com/api/e";
  var KEY = "hamcodes_anon";

  function optedOut() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  }

  function anon() {
    var id = "";
    try { id = localStorage.getItem(KEY) || ""; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      var b = new Uint8Array(12);
      crypto.getRandomValues(b);
      id = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem(KEY, id); } catch (e) {}
    }
    return id;
  }

  // Only the campaign name from a link, when there is one. Never the full query.
  function source() {
    var s = "";
    try {
      s = new URLSearchParams(location.search).get("utm_source") || "";
      if (s) sessionStorage.setItem("hamcodes_src", s);
      else s = sessionStorage.getItem("hamcodes_src") || "";
    } catch (e) {}
    return s.slice(0, 40);
  }
  source();

  window.HC_TRACK = function (event, props) {
    if (optedOut() || !event) return;
    var body = JSON.stringify({
      e: String(event),
      a: anon(),
      pg: location.pathname.slice(0, 120),
      s: source(),
      p: props || {}
    });
    if (body.length > 2000) return;
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }));
      else fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
    } catch (e) { /* a counter is never worth an error on the page */ }
  };

  // Anything marked data-track="name" reports itself when clicked, so most
  // pages need no script of their own. data-track-id adds one short label.
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-track]");
    if (!el) return;
    var props = {};
    if (el.dataset.trackId) props.id = el.dataset.trackId.slice(0, 80);
    window.HC_TRACK(el.dataset.track, props);
  }, true);

  // And any form marked the same way reports on submit rather than on click.
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (f && f.dataset && f.dataset.trackSubmit) window.HC_TRACK(f.dataset.trackSubmit, {});
  }, true);
})();
