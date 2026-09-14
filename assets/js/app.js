/* ============================================================
   kayemba hamiidu — terminal portfolio
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- footer year ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- boot screen ---------- */
  (function bootScreen() {
    var screen = document.getElementById('bootScreen');
    if (!screen) return;

    var fill = document.getElementById('bootFill');
    var rest = document.getElementById('bootRest');
    var pct = document.getElementById('bootPct');
    var modules = Array.prototype.slice.call(
      document.querySelectorAll('#bootModules li')
    );
    var CELLS = 50;
    var LEADER_WIDTH = 42;

    // dotted leaders sized to the longest module name
    modules.forEach(function (li) {
      var name = li.getAttribute('data-module') || '';
      var leader = li.querySelector('.boot-module-leader');
      if (leader) leader.textContent = new Array(Math.max(3, LEADER_WIDTH - name.length)).join('.');
    });

    function paint(progress) {
      var done = Math.round(CELLS * progress);
      if (fill) fill.textContent = new Array(done + 1).join('█');
      if (rest) rest.textContent = new Array(CELLS - done + 1).join('░');
      if (pct) pct.textContent = Math.round(progress * 100) + '%';

      var loadedCount = Math.floor(progress * modules.length);
      modules.forEach(function (li, i) {
        var state = i < loadedCount ? 'loaded' : i === loadedCount ? 'loading' : 'pending';
        if (li.getAttribute('data-state') !== state) {
          li.setAttribute('data-state', state);
          li.querySelector('b').textContent = state === 'loaded' ? 'ok' : state;
          li.querySelector('span[aria-hidden]').textContent =
            state === 'loaded' ? '✓' : state === 'loading' ? '>' : '-';
        }
      });
    }

    function finish() {
      paint(1);
      screen.classList.add('exiting');
      window.setTimeout(function () {
        screen.hidden = true;
        screen.setAttribute('aria-busy', 'false');
        document.body.style.overflow = '';
      }, reduceMotion ? 0 : 280);
    }

    if (reduceMotion) { finish(); return; }

    document.body.style.overflow = 'hidden';
    paint(0);

    var start = null;
    var DURATION = 1500;
    function step(now) {
      if (start === null) start = now;
      var progress = Math.min(1, (now - start) / DURATION);
      paint(progress < 1 ? progress * 0.98 : 1);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        finish();
      }
    }
    window.requestAnimationFrame(step);
  })();

  /* ---------- mobile nav ---------- */
  (function nav() {
    var button = document.getElementById('menuButton');
    var menu = document.getElementById('siteNav');
    if (!button || !menu) return;

    function close() {
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });

    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') close();
    });

    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && !button.contains(e.target)) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  })();

  /* ---------- section reveal + nav highlighting ---------- */
  (function reveal() {
    var sections = Array.prototype.slice.call(
      document.querySelectorAll('.terminal-section')
    );
    var links = Array.prototype.slice.call(
      document.querySelectorAll('.site-nav a')
    );

    if (!('IntersectionObserver' in window)) {
      sections.forEach(function (s) { s.setAttribute('data-revealed', 'true'); });
      return;
    }

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-revealed', 'true');
        if (entry.target.id === 'contact') {
          entry.target.setAttribute('data-scanned', 'true');
          runScan(entry.target);
        }
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.06 });

    sections.forEach(function (s) { revealObserver.observe(s); });

    // Safety net: never leave content hidden if the observer never fires.
    function revealAll() {
      sections.forEach(function (s) {
        if (s.getAttribute('data-revealed') === 'true') return;
        s.setAttribute('data-revealed', 'true');
        if (s.id === 'contact') {
          s.setAttribute('data-scanned', 'true');
          runScan(s);
        }
        revealObserver.unobserve(s);
      });
    }
    window.setTimeout(revealAll, 4000);
    window.addEventListener('load', function () {
      window.setTimeout(function () {
        sections.forEach(function (s) {
          var box = s.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0) {
            s.setAttribute('data-revealed', 'true');
            if (s.id === 'contact') {
              s.setAttribute('data-scanned', 'true');
              runScan(s);
            }
            revealObserver.unobserve(s);
          }
        });
      }, 50);
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) {
          a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (s) { spy.observe(s); });

    function runScan(section) {
      var rows = Array.prototype.slice.call(
        section.querySelectorAll('[data-nmap-row]')
      );
      rows.forEach(function (row, i) {
        var delay = reduceMotion ? 0 : Math.min(60 * i, 760);
        window.setTimeout(function () {
          row.style.opacity = '1';
          row.style.transform = 'none';
        }, delay);
      });
    }
  })();

  /* ---------- project process inspector ---------- */
  (function inspector() {
    var list = document.getElementById('processList');
    var body = document.getElementById('inspectorBody');
    var head = document.getElementById('inspectorPid');
    if (!list || !body) return;

    var rows = Array.prototype.slice.call(list.querySelectorAll('.process-row'));
    if (!rows.length) return;

    function statusLabel(status) {
      return status === 'building' ? 'BUILDING' : status === 'complete' ? 'COMPLETE' : 'ONGOING';
    }

    function select(row, focus) {
      rows.forEach(function (r) {
        var on = r === row;
        r.classList.toggle('selected', on);
        r.setAttribute('aria-pressed', String(on));
        r.tabIndex = on ? 0 : -1;
        var marker = r.querySelector('span');
        if (marker) {
          marker.textContent = (on ? '▸' : ' ') + r.getAttribute('data-pid');
        }
      });

      var d = row.dataset;
      if (head) head.textContent = 'PID ' + d.pid + ' // ' + d.name;

      body.innerHTML = '';

      var name = document.createElement('div');
      name.className = 'inspector-name';
      var h3 = document.createElement('h3');
      h3.textContent = d.name;
      var status = document.createElement('span');
      status.className = 'status-' + d.status;
      var dot = document.createElement('i');
      var em = document.createElement('em');
      em.innerHTML = '&middot; ' + d.uptime;
      status.appendChild(dot);
      status.appendChild(document.createTextNode(statusLabel(d.status) + ' '));
      status.appendChild(em);
      name.appendChild(h3);
      name.appendChild(status);
      body.appendChild(name);

      [
        ['DESCRIPTION', d.desc, false],
        ['CONTRIBUTION', d.contrib, false],
        ['STACK', d.stack, true]
      ].forEach(function (pair) {
        var block = document.createElement('div');
        block.className = 'inspector-info' + (pair[2] ? ' muted' : '');
        var label = document.createElement('span');
        label.textContent = pair[0];
        var p = document.createElement('p');
        p.innerHTML = pair[1];
        block.appendChild(label);
        block.appendChild(p);
        body.appendChild(block);
      });

      var actions = document.createElement('div');
      actions.className = 'inspector-actions';
      var open = document.createElement('a');
      open.href = d.link;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = '[ OPEN ↗ ]';
      var label = document.createElement('a');
      label.href = d.link;
      label.target = '_blank';
      label.rel = 'noopener';
      label.textContent = d.linkLabel;
      actions.appendChild(open);
      actions.appendChild(label);
      body.appendChild(actions);

      if (focus) row.focus();
    }

    rows.forEach(function (row, i) {
      row.tabIndex = -1;
      row.addEventListener('click', function () { select(row, false); });
      row.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowDown') next = rows[(i + 1) % rows.length];
        else if (e.key === 'ArrowUp') next = rows[(i - 1 + rows.length) % rows.length];
        else if (e.key === 'Home') next = rows[0];
        else if (e.key === 'End') next = rows[rows.length - 1];
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.open(row.dataset.link, '_blank', 'noopener');
          return;
        }
        if (next) { e.preventDefault(); select(next, true); }
      });
    });

    select(rows[0], false);
  })();

  /* ---------- live github repositories ---------- */
  (function repos() {
    var listEl = document.getElementById('repoList');
    var statusEl = document.getElementById('repoStatus');
    if (!listEl || !statusEl) return;

    fetch('https://api.github.com/users/kayembahamid/repos?sort=updated&per_page=100')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        var repos = data
          .filter(function (r) { return !r.fork && !r.archived; })
          .slice(0, 8);

        if (!repos.length) {
          statusEl.textContent = 'no public repositories found.';
          return;
        }

        statusEl.textContent = 'total ' + repos.length + ' · most recently updated';
        statusEl.className = 'listing-info';

        repos.forEach(function (repo) {
          var a = document.createElement('a');
          a.href = repo.html_url;
          a.target = '_blank';
          a.rel = 'noopener';

          var caret = document.createElement('b');
          caret.textContent = '>';

          var main = document.createElement('span');
          var title = document.createElement('strong');
          title.textContent = repo.name;
          main.appendChild(title);
          if (repo.description) {
            var desc = document.createElement('small');
            desc.textContent = repo.description;
            main.appendChild(desc);
          }

          var lang = document.createElement('em');
          lang.textContent = repo.language || 'text';

          var stars = document.createElement('i');
          stars.textContent = '★ ' + repo.stargazers_count;

          a.appendChild(caret);
          a.appendChild(main);
          a.appendChild(lang);
          a.appendChild(stars);
          listEl.appendChild(a);
        });
      })
      .catch(function () {
        statusEl.textContent = 'github.com/kayembahamid — unreachable, open it directly ↗';
        var a = document.createElement('a');
        a.className = 'text-link';
        a.href = 'https://github.com/kayembahamid';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = '[ VIEW ON GITHUB → ]';
        listEl.appendChild(a);
      });
  })();
})();
