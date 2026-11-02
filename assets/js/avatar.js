/* A small, on-demand WebGL portrait with a local elastic pull. */
(function () {
  'use strict';

  var figure = document.getElementById('heroPortrait');
  var control = document.getElementById('portraitControl');
  var image = document.getElementById('portraitImage');
  var canvas = document.getElementById('portraitCanvas');
  var hint = document.getElementById('portraitHint');
  if (!figure || !control || !image || !canvas || !hint) return;

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gl, program, buffer, texture, grabLocation, pullLocation;
  var ready = false;
  var visible = true;
  var pointer = null;
  var pointerStart = { x: 0, y: 0 };
  var dragged = false;
  var suppressClick = false;
  var frame = 0;
  var releaseTimer = 0;
  var previousTime = 0;
  var grab = { x: 0.5, y: 0.45 };
  var pull = { x: 0, y: 0 };
  var target = { x: 0, y: 0 };
  var velocity = { x: 0, y: 0 };
  var idleHint = 'Tap or drag to stretch.';

  function active() {
    return ready && !motion.matches && visible && !document.hidden;
  }

  function reset() {
    window.clearTimeout(releaseTimer);
    window.cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    var capturedPointer = pointer;
    pointer = null;
    dragged = false;
    if (capturedPointer !== null) suppressClick = true;
    if (capturedPointer !== null && control.hasPointerCapture(capturedPointer)) {
      control.releasePointerCapture(capturedPointer);
    }
    figure.classList.remove('is-dragging');
    pull.x = pull.y = target.x = target.y = velocity.x = velocity.y = 0;
    if (ready && !motion.matches) hint.textContent = idleHint;
  }

  function fallback() {
    ready = false;
    reset();
    if (gl && !gl.isContextLost()) {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    }
    texture = buffer = program = null;
    figure.classList.remove('is-interactive', 'is-ready');
    control.disabled = true;
    hint.textContent = 'A face behind the terminal.';
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

  function draw() {
    var rect = canvas.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(rect.width * ratio));
    var height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(grabLocation, grab.x, grab.y);
    gl.uniform2f(pullLocation, pull.x, pull.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function animate(now) {
    frame = 0;
    if (!active()) { reset(); return; }
    // Small fixed substeps keep the spring stable on slow and fast displays.
    var elapsed = previousTime ? Math.min((now - previousTime) / 1000, 0.04) : 1 / 60;
    previousTime = now;
    var steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
    var dt = elapsed / steps;
    for (var i = 0; i < steps; i++) {
      ['x', 'y'].forEach(function (axis) {
        velocity[axis] += ((target[axis] - pull[axis]) * 240 - velocity[axis] * 19) * dt;
        pull[axis] += velocity[axis] * dt;
      });
    }
    var moving = Math.abs(pull.x - target.x) + Math.abs(pull.y - target.y) +
      Math.abs(velocity.x) + Math.abs(velocity.y) > 0.0003;
    if (!moving) {
      pull.x = target.x;
      pull.y = target.y;
      velocity.x = velocity.y = 0;
      if (pointer === null && !target.x && !target.y) hint.textContent = idleHint;
    }
    draw();
    if (moving) frame = window.requestAnimationFrame(animate);
    else previousTime = 0;
  }

  function wake() {
    if (active() && !frame) frame = window.requestAnimationFrame(animate);
  }

  function release() {
    pointer = null;
    figure.classList.remove('is-dragging');
    target.x = target.y = 0;
    wake();
  }

  function position(event) {
    var rect = control.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  }

  function limit(value) { return Math.max(-0.14, Math.min(0.14, value)); }

  function tug(x, y, point) {
    if (!active() || pointer !== null) return;
    window.clearTimeout(releaseTimer);
    // Keep a tap near the edge close enough to the face to make the tug visible.
    grab.x = point ? Math.max(0.25, Math.min(0.75, point.x)) : 0.5;
    grab.y = point ? Math.max(0.2, Math.min(0.75, point.y)) : 0.45;
    target.x = x;
    target.y = y;
    hint.textContent = 'Hello from behind the terminal.';
    wake();
    releaseTimer = window.setTimeout(release, 160);
  }

  function updateMotion() {
    reset();
    if (motion.matches || !ready) {
      figure.classList.remove('is-interactive', 'is-ready');
      control.disabled = true;
      hint.textContent = 'A face behind the terminal.';
      return;
    }
    control.disabled = false;
    draw();
    figure.classList.add('is-interactive', 'is-ready');
    hint.textContent = idleHint;
  }

  function initialize() {
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!gl) { fallback(); return; }
      var vertex = compile(gl.VERTEX_SHADER,
        'attribute vec2 aPosition; varying vec2 vUv;' +
        'void main(){vUv=vec2(aPosition.x,1.0-aPosition.y);' +
        'gl_Position=vec4(aPosition*2.0-1.0,0.0,1.0);}');
      var fragment = compile(gl.FRAGMENT_SHADER,
        'precision mediump float; varying vec2 vUv; uniform sampler2D uTexture;' +
        'uniform vec2 uGrab; uniform vec2 uPull;' +
        'void main(){vec2 d=vUv-uGrab-uPull;' +
        'float weight=exp(-dot(d,d)/0.022);' +
        'vec2 source=vUv-uPull*weight;' +
        'if(source.x<0.0||source.x>1.0||source.y<0.0||source.y>1.0)' +
        '{gl_FragColor=vec4(0.0);}else{gl_FragColor=texture2D(uTexture,source);}}');
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Portrait program unavailable');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      var attribute = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      grabLocation = gl.getUniformLocation(program, 'uGrab');
      pullLocation = gl.getUniformLocation(program, 'uPull');
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // Keep image rows unflipped: both vUv and pointer coordinates start at the top.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Portrait texture unavailable');
      ready = true;
      updateMotion();
    } catch (_) { fallback(); }
  }

  control.addEventListener('pointerdown', function (event) {
    if (!active() || pointer !== null || !event.isPrimary || event.button !== 0) return;
    window.clearTimeout(releaseTimer);
    reset();
    var point = position(event);
    grab.x = point.x;
    grab.y = point.y;
    pointerStart.x = event.clientX;
    pointerStart.y = event.clientY;
    dragged = false;
    suppressClick = false;
    pointer = event.pointerId;
    control.setPointerCapture(pointer);
  });
  control.addEventListener('pointermove', function (event) {
    if (event.pointerId !== pointer) return;
    var distanceX = event.clientX - pointerStart.x;
    var distanceY = event.clientY - pointerStart.y;
    if (!dragged && distanceX * distanceX + distanceY * distanceY < 36) return;
    dragged = true;
    figure.classList.add('is-dragging');
    hint.textContent = 'Pull, then let go.';
    var point = position(event);
    target.x = limit(point.x - grab.x);
    target.y = limit(point.y - grab.y);
    wake();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
    control.addEventListener(name, function (event) {
      if (event.pointerId !== pointer) return;
      // Browsers dispatch a click after a drag; a canceled scroll must not tug either.
      suppressClick = dragged || name !== 'pointerup';
      release();
    });
  });
  // Native activation also supplies Enter/Space and assistive-technology clicks.
  control.addEventListener('click', function (event) {
    if (event.detail === 0) {
      suppressClick = false;
      tug(0.065, -0.04);
    } else if (suppressClick) {
      suppressClick = false;
    } else {
      tug(0.065, -0.04, position(event));
    }
  });
  control.addEventListener('keydown', function (event) {
    var directions = { ArrowLeft: [-0.08, 0], ArrowRight: [0.08, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] };
    if (event.key === 'Escape') {
      reset();
      if (ready) draw();
    } else if (directions[event.key] && active()) {
      event.preventDefault();
      tug(directions[event.key][0], directions[event.key][1]);
    }
  });
  canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); fallback(); });
  canvas.addEventListener('webglcontextrestored', initialize);
  image.addEventListener('error', fallback);
  if (motion.addEventListener) motion.addEventListener('change', updateMotion);
  else motion.addListener(updateMotion);
  document.addEventListener('visibilitychange', function () {
    reset();
    if (active()) draw();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var nextVisible = entries[0].isIntersecting;
      if (visible === nextVisible) return;
      visible = nextVisible;
      reset();
      if (active()) draw();
    }).observe(figure);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { if (active()) draw(); }).observe(control);
  } else window.addEventListener('resize', function () { if (active()) draw(); });

  control.disabled = true;
  if (image.complete && image.naturalWidth) initialize();
  else image.addEventListener('load', initialize, { once: true });
})();
