/* Elastic portrait: visitor-controlled pulls, cursor following, and brief idle gestures. */
(function () {
  'use strict';

  var figure = document.getElementById('heroPortrait');
  var control = document.getElementById('portraitControl');
  var image = document.getElementById('portraitImage');
  var canvas = document.getElementById('portraitCanvas');
  var hint = document.getElementById('portraitHint');
  if (!figure || !control || !image || !canvas || !hint) return;
  var hero = document.getElementById('top') || figure;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gl, program, buffer, texture;
  var textures = [], uniforms = {};
  var ready = false, visible = true, focused = true, hovered = false;
  var hasBlink = false, hasReaction = false, optionalStarted = false, generation = 0;
  var pointer = null, pointerStart = { x: 0, y: 0 }, dragged = false, suppressClick = false;
  var frame = 0, releaseTimer = 0, idleTimer = 0, previousTime = 0;
  var routine = null, idleStep = 0;
  var grab = { x: 0.5, y: 0.45 };
  var pull = spring(), look = spring(), demo = spring();
  var tilt = scalar(), blink = scalar(), surprise = scalar();
  var cursor = { x: 0, y: 0 };
  var idleHint = window.matchMedia('(hover: none)').matches ? 'Tap or drag to say hello.' : 'Move your mouse. Tap or drag.';

  function spring() { return { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 }; }
  function scalar() { return { value: 0, target: 0, velocity: 0 }; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function active() { return ready && !motion.matches && visible && focused && !document.hidden; }
  function say(text) { if (hint.textContent !== text) hint.textContent = text; }
  function state(value) { if (figure.getAttribute('data-portrait-state') !== value) figure.setAttribute('data-portrait-state', value); }

  function clearSpring(value) { value.x = value.y = value.tx = value.ty = value.vx = value.vy = 0; }
  function clearScalar(value) { value.value = value.target = value.velocity = 0; }
  function cancelAttention() {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    routine = null;
    clearSpring(demo);
    blink.target = 0;
    tilt.target = 0;
    figure.classList.remove('is-demonstrating');
  }
  function reset() {
    cancelAttention();
    window.clearTimeout(releaseTimer);
    window.cancelAnimationFrame(frame);
    releaseTimer = frame = previousTime = 0;
    var captured = pointer;
    pointer = null;
    dragged = false;
    if (captured !== null) suppressClick = true;
    if (captured !== null && control.hasPointerCapture(captured)) control.releasePointerCapture(captured);
    figure.classList.remove('is-dragging');
    clearSpring(pull); clearSpring(look); clearSpring(demo);
    clearScalar(tilt); clearScalar(blink); clearScalar(surprise);
    cursor.x = cursor.y = 0;
    hovered = false;
    state('idle');
    if (ready && !motion.matches) say(idleHint);
  }
  function fallback() {
    ready = false;
    generation++;
    reset();
    if (gl && !gl.isContextLost()) {
      textures.forEach(function (item) { gl.deleteTexture(item); });
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    textures = [];
    texture = buffer = program = null;
    figure.classList.remove('is-interactive', 'is-ready');
    control.disabled = true;
    say('A face behind the terminal.');
  }

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Portrait shader unavailable');
    }
    return shader;
  }
  function makeTexture(source, unit) {
    var item = gl.createTexture();
    textures.push(item);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, item);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return item;
  }
  function optionalPortrait(attribute, unit, loadedGeneration) {
    var src = figure.getAttribute(attribute);
    if (!src) return;
    var expression = new Image();
    expression.onload = function () {
      if (!ready || generation !== loadedGeneration || gl.isContextLost()) return;
      try {
        makeTexture(expression, unit);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Optional portrait texture unavailable');
        if (unit === 1) hasBlink = true;
        else hasReaction = true;
      } catch (_) {
        // Keep every sampler complete even if an optional upload fails.
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      } finally {
        gl.activeTexture(gl.TEXTURE0);
      }
      if (active()) draw();
    };
    expression.src = src;
  }
  function loadExpressions() {
    if (optionalStarted || !active()) return;
    optionalStarted = true;
    optionalPortrait('data-blink-src', 1, generation);
    optionalPortrait('data-reaction-src', 2, generation);
  }
  function draw() {
    var rect = canvas.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width * ratio));
    var height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uniforms.uGrab, grab.x, grab.y);
    gl.uniform2f(uniforms.uPull, pull.x, pull.y);
    gl.uniform2f(uniforms.uLook, look.x, look.y);
    gl.uniform2f(uniforms.uDemo, demo.x, demo.y);
    gl.uniform1f(uniforms.uTilt, tilt.value);
    gl.uniform1f(uniforms.uBlink, hasBlink ? blink.value : 0);
    gl.uniform1f(uniforms.uSurprise, hasReaction ? surprise.value : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    figure.style.setProperty('--ghost-x', ((0.35 + demo.x) * 100).toFixed(2) + '%');
    figure.style.setProperty('--ghost-y', ((0.47 + demo.y) * 100).toFixed(2) + '%');
    figure.style.setProperty('--ghost-angle', (-18 + demo.x * 100).toFixed(2) + 'deg');
  }

  function pulse(time, start, duration) {
    var p = (time - start) / duration;
    return p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0;
  }
  function eyelid(time, start, duration) {
    var p = (time - start) / duration;
    if (p <= 0 || p >= 1) return 0;
    // A short closed plateau survives spring easing; the shader caps the blend at one.
    return (p < 0.2 ? p / 0.2 : p < 0.7 ? 1 : (1 - p) / 0.3) * 1.4;
  }
  function scheduleIdle(delay) {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (!active() || pointer !== null) return;
    if (delay === undefined) delay = idleStep === 0 ? 350 : idleStep === 1 ? 2000 : [6200, 8500, 7100, 9400][idleStep % 4];
    idleTimer = window.setTimeout(function () {
      idleTimer = 0;
      if (!active() || pointer !== null) return;
      var kinds = ['blink', 'glance', 'doze', 'demo', 'glance', 'blink'];
      var kind = idleStep === 0 ? 'intro' : idleStep === 1 ? 'demo' : kinds[(idleStep - 2) % kinds.length];
      idleStep++;
      routine = { kind: kind, start: null, duration: { intro: 1100, blink: 850, glance: 1800, doze: 2400, demo: 1900 }[kind] };
      if (kind === 'demo') { figure.classList.add('is-demonstrating'); say('Try pulling my cheek.'); }
      else if (kind === 'doze') say('Still here. Just checking my eyelids.');
      wake();
    }, delay);
  }
  function activity() {
    cancelAttention();
    blink.target = 0;
    tilt.target = 0;
    surprise.target = hovered ? 0.15 : 0;
    scheduleIdle(6500);
  }
  function animateRoutine(now) {
    if (!routine) return false;
    if (routine.start === null) routine.start = now;
    var elapsed = (now - routine.start) / 1000;
    var p = clamp((now - routine.start) / routine.duration, 0, 1);
    blink.target = 0;
    look.tx = cursor.x; look.ty = cursor.y;
    tilt.target = 0;
    surprise.target = hovered ? 0.15 : 0;
    demo.tx = demo.ty = 0;
    if (routine.kind === 'intro') {
      look.tx += Math.sin(p * Math.PI * 2) * 0.012;
      look.ty += Math.sin(p * Math.PI) * 0.008;
      tilt.target = Math.sin(p * Math.PI * 2) * 0.022;
      blink.target = eyelid(elapsed, 0.4, 0.26);
    } else if (routine.kind === 'blink') {
      blink.target = Math.max(eyelid(elapsed, 0.1, 0.25), eyelid(elapsed, 0.47, 0.25));
    } else if (routine.kind === 'glance') {
      look.tx += Math.sin(p * Math.PI * 2) * 0.024;
      look.ty -= Math.sin(p * Math.PI) * 0.004;
      tilt.target = Math.sin(p * Math.PI * 2) * 0.018;
      blink.target = eyelid(elapsed, 1.4, 0.25);
    } else if (routine.kind === 'doze') {
      var droop = p < 0.65 ? clamp(p / 0.4, 0, 1) : Math.max(0, 1 - (p - 0.65) / 0.12);
      blink.target = droop;
      look.ty += droop * 0.016;
      tilt.target = droop * 0.055;
      if (p > 0.65) surprise.target = pulse(p, 0.65, 0.3) * 0.95;
    } else if (routine.kind === 'demo') {
      var stretch = p < 0.3 ? Math.sin(p / 0.3 * Math.PI / 2) : p < 0.58 ? 1 : Math.max(0, 1 - (p - 0.58) / 0.15);
      demo.tx = -0.085 * stretch;
      demo.ty = 0.012 * stretch;
      surprise.target = stretch * 0.55;
      blink.target = eyelid(elapsed, 1.47, 0.25);
    }
    if (p < 1) return true;
    routine = null;
    demo.tx = demo.ty = blink.target = tilt.target = 0;
    look.tx = cursor.x; look.ty = cursor.y;
    surprise.target = hovered ? 0.15 : 0;
    figure.classList.remove('is-demonstrating');
    say(idleHint);
    scheduleIdle();
    return false;
  }
  function stepSpring(value, dt, stiffness, damping) {
    ['x', 'y'].forEach(function (axis) {
      var velocity = 'v' + axis, target = 't' + axis;
      value[velocity] += ((value[target] - value[axis]) * stiffness - value[velocity] * damping) * dt;
      value[axis] += value[velocity] * dt;
    });
  }
  function stepScalar(value, dt, stiffness, damping) {
    value.velocity += ((value.target - value.value) * stiffness - value.velocity * damping) * dt;
    value.value += value.velocity * dt;
  }
  function movingSpring(value) {
    var moving = Math.abs(value.tx - value.x) + Math.abs(value.ty - value.y) + Math.abs(value.vx) + Math.abs(value.vy) > 0.0003;
    if (!moving) { value.x = value.tx; value.y = value.ty; value.vx = value.vy = 0; }
    return moving;
  }
  function movingScalar(value) {
    var moving = Math.abs(value.target - value.value) + Math.abs(value.velocity) > 0.0004;
    if (!moving) { value.value = value.target; value.velocity = 0; }
    return moving;
  }
  function animate(now) {
    frame = 0;
    if (!active()) { reset(); return; }
    var performing = animateRoutine(now);
    var elapsed = previousTime ? Math.min((now - previousTime) / 1000, 0.04) : 1 / 60;
    previousTime = now;
    var steps = Math.max(1, Math.ceil(elapsed * 120)), dt = elapsed / steps;
    for (var i = 0; i < steps; i++) {
      stepSpring(pull, dt, 240, 19);
      stepSpring(look, dt, 120, 19);
      stepSpring(demo, dt, 200, 19);
      stepScalar(tilt, dt, 140, 20);
      stepScalar(blink, dt, 950, 48);
      stepScalar(surprise, dt, 180, 24);
    }
    // Evaluate every channel so a settled one snaps exactly to its target.
    var moving = [movingSpring(pull), movingSpring(look), movingSpring(demo), movingScalar(tilt), movingScalar(blink), movingScalar(surprise)].some(Boolean);
    if (pointer !== null && dragged) state('dragging');
    else if (routine && routine.kind === 'demo') state('demonstrating');
    else if (routine && routine.kind === 'doze') state('dozing');
    else if (blink.value > 0.1) state('blinking');
    else if (surprise.value > 0.2 || surprise.target > 0.2) state('surprised');
    else if (Math.abs(look.x) + Math.abs(look.y) > 0.002) state('looking');
    else state('idle');
    if (!moving && !performing && pointer === null && !pull.tx && !pull.ty) say(idleHint);
    draw();
    if (moving || performing) frame = window.requestAnimationFrame(animate);
    else previousTime = 0;
  }
  function wake() { if (active() && !frame) frame = window.requestAnimationFrame(animate); }
  function release() {
    pointer = null;
    figure.classList.remove('is-dragging');
    pull.tx = pull.ty = 0;
    surprise.target = hovered ? 0.15 : 0;
    scheduleIdle(6500);
    wake();
  }
  function position(event) {
    var rect = control.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function tug(x, y, point) {
    if (!active() || pointer !== null) return;
    activity();
    window.clearTimeout(releaseTimer);
    grab.x = point ? clamp(point.x, 0.25, 0.75) : 0.5;
    grab.y = point ? clamp(point.y, 0.2, 0.75) : 0.45;
    pull.tx = x; pull.ty = y;
    surprise.target = 0.95;
    say('Hello from behind the terminal.');
    wake();
    releaseTimer = window.setTimeout(release, 230);
  }
  function updateMotion() {
    reset();
    if (motion.matches || !ready) {
      figure.classList.remove('is-interactive', 'is-ready');
      control.disabled = true;
      say('A face behind the terminal.');
      return;
    }
    control.disabled = false;
    draw();
    figure.classList.add('is-interactive', 'is-ready');
    say(idleHint);
    loadExpressions();
    scheduleIdle();
  }

  function initialize() {
    try {
      generation++;
      hasBlink = hasReaction = false;
      optionalStarted = false;
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!gl) { fallback(); return; }
      var vertex = compile(gl.VERTEX_SHADER,
        'attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=vec2(aPosition.x,1.0-aPosition.y);gl_Position=vec4(aPosition*2.0-1.0,0.0,1.0);}');
      var fragment = compile(gl.FRAGMENT_SHADER,
        'precision mediump float;varying vec2 vUv;uniform sampler2D uTexture;uniform sampler2D uBlinkTexture;uniform sampler2D uReactionTexture;' +
        'uniform vec2 uGrab;uniform vec2 uPull;uniform vec2 uLook;uniform vec2 uDemo;uniform float uTilt;uniform float uBlink;uniform float uSurprise;' +
        'float oval(vec2 p,vec2 center,vec2 radius){return 1.0-smoothstep(0.5,1.0,length((p-center)/radius));}' +
        'void main(){vec2 d=vUv-uGrab-uPull;vec2 source=vUv-uPull*exp(-dot(d,d)/0.022);' +
        'vec2 demoDelta=vUv-vec2(0.35,0.47)-uDemo;source-=uDemo*exp(-dot(demoDelta,demoDelta)/0.018);' +
        'vec2 head=(source-vec2(0.5,0.38))/vec2(0.27,0.36);float headWeight=exp(-dot(head,head)*1.8);' +
        'vec2 neck=source-vec2(0.5,0.72);source-=vec2(-neck.y,neck.x)*uTilt*headWeight;source-=uLook*headWeight;' +
        'float pupils=max(oval(source,vec2(0.416,0.362),vec2(0.027,0.016)),oval(source,vec2(0.59,0.36),vec2(0.027,0.016)));source-=uLook*0.2*pupils;' +
        'if(source.x<0.0||source.x>1.0||source.y<0.0||source.y>1.0){gl_FragColor=vec4(0.0);return;}' +
        'vec4 base=texture2D(uTexture,source);float face=oval(source,vec2(0.5,0.415),vec2(0.245,0.23));' +
        'vec4 color=mix(base,texture2D(uReactionTexture,source),clamp(uSurprise,0.0,1.0)*face);' +
        'float eyes=max(oval(source,vec2(0.416,0.362),vec2(0.058,0.032)),oval(source,vec2(0.59,0.36),vec2(0.058,0.032)));' +
        'color=mix(color,texture2D(uBlinkTexture,source),clamp(uBlink,0.0,1.0)*eyes);color.a=base.a;gl_FragColor=color;}');
      program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      gl.deleteShader(vertex); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Portrait program unavailable');
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      var attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      ['uGrab', 'uPull', 'uLook', 'uDemo', 'uTilt', 'uBlink', 'uSurprise'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
      texture = makeTexture(image, 0);
      [0, 1, 2].forEach(function (unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); });
      gl.activeTexture(gl.TEXTURE0);
      ['uTexture', 'uBlinkTexture', 'uReactionTexture'].forEach(function (name, unit) { gl.uniform1i(gl.getUniformLocation(program, name), unit); });
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Portrait texture unavailable');
      ready = true;
      updateMotion();
    } catch (_) { fallback(); }
  }

  control.addEventListener('pointerdown', function (event) {
    if (!active() || pointer !== null || !event.isPrimary || event.button !== 0) return;
    activity();
    window.clearTimeout(idleTimer); idleTimer = 0;
    window.clearTimeout(releaseTimer); releaseTimer = 0;
    clearSpring(pull); clearSpring(look); clearScalar(tilt);
    var point = position(event);
    grab.x = point.x; grab.y = point.y;
    pointerStart.x = event.clientX; pointerStart.y = event.clientY;
    dragged = false; suppressClick = false; pointer = event.pointerId;
    control.setPointerCapture(pointer);
    wake();
  });
  control.addEventListener('pointermove', function (event) {
    if (event.pointerId !== pointer) return;
    var dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
    if (!dragged && dx * dx + dy * dy < 36) return;
    dragged = true;
    figure.classList.add('is-dragging');
    say('Pull, then let go.');
    var point = position(event);
    pull.tx = clamp(point.x - grab.x, -0.14, 0.14);
    pull.ty = clamp(point.y - grab.y, -0.14, 0.14);
    surprise.target = 0.9;
    wake();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
    control.addEventListener(name, function (event) {
      if (event.pointerId !== pointer) return;
      suppressClick = dragged || name !== 'pointerup';
      release();
    });
  });
  control.addEventListener('click', function (event) {
    if (event.detail === 0) { suppressClick = false; tug(0.065, -0.04); }
    else if (suppressClick) suppressClick = false;
    else tug(0.065, -0.04, position(event));
  });
  control.addEventListener('keydown', function (event) {
    var directions = { ArrowLeft: [-0.08, 0], ArrowRight: [0.08, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] };
    if (event.key === 'Escape') { reset(); if (ready) draw(); scheduleIdle(6500); }
    else if (directions[event.key] && active()) { event.preventDefault(); tug(directions[event.key][0], directions[event.key][1]); }
  });
  control.addEventListener('pointerenter', function (event) {
    if (!active() || event.pointerType === 'touch' || pointer !== null) return;
    hovered = true; activity(); surprise.target = 0.2; wake();
  });
  control.addEventListener('pointerleave', function (event) {
    if (event.pointerType === 'touch') return;
    hovered = false;
    if (active() && pointer === null) { surprise.target = 0; wake(); }
  });
  window.addEventListener('pointermove', function (event) {
    if (!active() || pointer !== null || event.pointerType === 'touch' || event.pointerType === 'pen') return;
    var area = hero.getBoundingClientRect(), rect = control.getBoundingClientRect();
    var inside = event.clientX >= area.left && event.clientX <= area.left + area.width && event.clientY >= area.top && event.clientY <= area.top + area.height;
    activity();
    cursor.x = inside ? clamp((event.clientX - rect.left - rect.width / 2) / (rect.width * 1.4), -1, 1) * 0.024 : 0;
    cursor.y = inside ? clamp((event.clientY - rect.top - rect.height * 0.4) / (rect.height * 1.2), -1, 1) * 0.015 : 0;
    look.tx = cursor.x; look.ty = cursor.y;
    wake();
  });
  window.addEventListener('pointerout', function (event) {
    if (event.relatedTarget !== null || !active() || pointer !== null) return;
    activity(); cursor.x = cursor.y = look.tx = look.ty = 0; wake();
  });
  window.addEventListener('blur', function () { focused = false; reset(); });
  window.addEventListener('focus', function () { focused = true; if (active()) { loadExpressions(); draw(); scheduleIdle(); } });
  canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); fallback(); });
  canvas.addEventListener('webglcontextrestored', initialize);
  image.addEventListener('error', fallback);
  if (motion.addEventListener) motion.addEventListener('change', updateMotion);
  else motion.addListener(updateMotion);
  document.addEventListener('visibilitychange', function () { reset(); if (active()) { loadExpressions(); draw(); scheduleIdle(); } });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var next = entries[0].isIntersecting;
      if (visible === next) return;
      visible = next; reset();
      if (active()) { loadExpressions(); draw(); scheduleIdle(); }
    }).observe(figure);
  }
  if ('ResizeObserver' in window) new ResizeObserver(function () { if (active()) draw(); }).observe(control);
  else window.addEventListener('resize', function () { if (active()) draw(); });
  control.disabled = true;
  if (image.complete && image.naturalWidth) initialize();
  else image.addEventListener('load', initialize, { once: true });
})();
