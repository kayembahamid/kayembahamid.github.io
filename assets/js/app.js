document.getElementById('year').textContent = new Date().getFullYear();

// Mobile nav toggle
var navToggle = document.getElementById('navToggle');
var navLinks = document.getElementById('navLinks');
navToggle.addEventListener('click', function () {
  navLinks.classList.toggle('open');
});
navLinks.querySelectorAll('a').forEach(function (a) {
  a.addEventListener('click', function () { navLinks.classList.remove('open'); });
});

// Typing carousel
(function typeLoop() {
  var roles = [
    'Security Engineer',
    'Red Team Operator',
    'Penetration Tester',
    'Application Security',
    'DevSecOps'
  ];
  var el = document.getElementById('typeTarget');
  var roleIndex = 0, charIndex = 0, deleting = false;

  function tick() {
    var current = roles[roleIndex];
    if (!deleting) {
      charIndex++;
      el.textContent = current.slice(0, charIndex);
      if (charIndex === current.length) {
        deleting = true;
        setTimeout(tick, 1400);
        return;
      }
    } else {
      charIndex--;
      el.textContent = current.slice(0, charIndex);
      if (charIndex === 0) {
        deleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
      }
    }
    setTimeout(tick, deleting ? 40 : 70);
  }
  tick();
})();

// Lightweight particle background
(function particles() {
  var canvas = document.getElementById('bg-canvas');
  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var particlesArr = [];
  var w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  var count = Math.min(70, Math.floor((w * h) / 22000));
  for (var i = 0; i < count; i++) {
    particlesArr.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.4
    });
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,255,136,0.55)';
    for (var i = 0; i < particlesArr.length; i++) {
      var p = particlesArr[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,184,212,0.08)';
    for (var a = 0; a < particlesArr.length; a++) {
      for (var b = a + 1; b < particlesArr.length; b++) {
        var dx = particlesArr[a].x - particlesArr[b].x;
        var dy = particlesArr[a].y - particlesArr[b].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particlesArr[a].x, particlesArr[a].y);
          ctx.lineTo(particlesArr[b].x, particlesArr[b].y);
          ctx.stroke();
        }
      }
    }
    if (!reduceMotion) requestAnimationFrame(step);
  }
  step();
})();

// Live GitHub repos
(function loadRepos() {
  var container = document.getElementById('ghRepos');
  var status = document.getElementById('ghStatus');
  fetch('https://api.github.com/users/kayembahamid/repos?sort=updated&per_page=6')
    .then(function (r) { if (!r.ok) throw new Error('rate-limited'); return r.json(); })
    .then(function (repos) {
      var filtered = repos.filter(function (r) { return !r.fork; }).slice(0, 6);
      if (!filtered.length) { status.textContent = 'No public repositories found.'; return; }
      status.remove();
      filtered.forEach(function (repo) {
        var a = document.createElement('a');
        a.className = 'card project-card';
        a.href = repo.html_url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML =
          '<h3>' + repo.name + '</h3>' +
          '<p>' + (repo.description ? repo.description : 'No description provided.') + '</p>' +
          '<span class="mono muted small">' + (repo.language || 'code') + ' · ★ ' + repo.stargazers_count + '</span>';
        container.appendChild(a);
      });
    })
    .catch(function () {
      status.textContent = 'GitHub API unavailable right now — browse repos directly at github.com/kayembahamid';
    });
})();
