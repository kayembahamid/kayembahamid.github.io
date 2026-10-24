/* The personal site: what counts as somebody doing something here. Following a project, a piece of writing or a
   book, or reaching out, are actions; reading the page is not, and page views are never recorded. track.js decides
   whether anything is sent at all, and sends nothing when the browser asks not to be tracked. */
(function () {
  "use strict";
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || !window.HC_TRACK) return;
    var href = a.getAttribute("href") || "";
    var to = href.slice(0, 80);
    if (/amazon\./.test(href)) window.HC_TRACK("book_clicked", { to: to });
    else if (/substack\.com|gitbook\.io/.test(href)) window.HC_TRACK("writing_clicked", { to: to });
    else if (/^mailto:|linkedin\.com|x\.com|youtube\.com|tiktok\.com|facebook\.com|Resume\.pdf/i.test(href)) window.HC_TRACK("contact_clicked", { to: to });
    else if (/labs\.hamcodes\.com|github\.com|hamcodes\.com\/pages\//.test(href)) window.HC_TRACK("project_clicked", { to: to });
  }, true);
})();
