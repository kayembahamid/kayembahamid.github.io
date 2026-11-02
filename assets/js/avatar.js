/* Elastic portrait: continuous expression routines with visitor-controlled pulls. */
(function () {
  'use strict';

  var figure = document.getElementById('heroPortrait');
  var control = document.getElementById('portraitControl');
  var image = document.getElementById('portraitImage');
  var canvas = document.getElementById('portraitCanvas');
  var hint = document.getElementById('portraitHint');
  if (!figure || !control || !image || !canvas || !hint) return;
  var hero = document.getElementById('top') || figure;
  var bootScreen = document.getElementById('bootScreen');
  var bootComplete = !bootScreen || bootScreen.hidden;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var gl, program, buffer, texture;
  var textures = [], uniforms = {};
  var ready = false, visible = true, hovered = false;
  var loadedFaces = {}, optionalStarted = false, generation = 0;
  var pointer = null, pointerStart = { x: 0, y: 0 }, dragged = false, suppressClick = false;
  var frame = 0, releaseTimer = 0, idleTimer = 0, previousTime = 0;
  var routine = null, idleStep = 0;
  var grab = { x: 0.5, y: 0.45 };
  var pull = spring(), look = spring(), demo = spring();
  var tilt = scalar(), blink = scalar(), surprise = scalar(), yawn = scalar(), brows = scalar(), laugh = scalar();
  var cursor = { x: 0, y: 0 };
  var ghost = { x: 0.35, y: 0.47, angle: -18 };
  var expressionAssets = [
    ['data-blink-src', 'uBlinkTexture', 'uBlink', blink],
    ['data-reaction-src', 'uReactionTexture', 'uSurprise', surprise],
    ['data-yawn-src', 'uYawnTexture', 'uYawn', yawn],
    ['data-brows-src', 'uBrowsTexture', 'uBrows', brows],
    ['data-laugh-src', 'uLaughTexture', 'uLaugh', laugh]
  ];
  var idleHint = window.matchMedia('(hover: none)').matches ? 'Tap or drag to say hello.' : 'Move your mouse. Tap or drag.';

  function spring() { return { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0 }; }
  function scalar() { return { value: 0, target: 0, velocity: 0 }; }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function active() { return ready && !motion.matches && visible && !document.hidden; }
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
    yawn.target = brows.target = laugh.target = 0;
    figure.classList.remove('is-demonstrating', 'is-scratching');
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
    clearScalar(yawn); clearScalar(brows); clearScalar(laugh);
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
        loadedFaces[unit] = true;
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
    expressionAssets.forEach(function (asset, index) { optionalPortrait(asset[0], index + 1, generation); });
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
    expressionAssets.forEach(function (asset, index) {
      gl.uniform1f(uniforms[asset[2]], loadedFaces[index + 1] ? asset[3].value : 0);
    });
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    figure.style.setProperty('--ghost-x', (ghost.x * 100).toFixed(2) + '%');
    figure.style.setProperty('--ghost-y', (ghost.y * 100).toFixed(2) + '%');
    figure.style.setProperty('--ghost-angle', ghost.angle.toFixed(2) + 'deg');
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
  // Keep showing the personality while the visible page is quiet. Only a real
  // grab or tap takes over; a wandering pointer must not keep postponing the acts.
  function scheduleIdle(delay) {
    window.clearTimeout(idleTimer);
    idleTimer = 0;
    if (!active() || !bootComplete || pointer !== null) return;
    if (delay === undefined) delay = idleStep === 0 ? 250 : [450, 550, 500, 650][idleStep % 4];
    idleTimer = window.setTimeout(function () {
      idleTimer = 0;
      if (!active() || pointer !== null) return;
      var kinds = ['brows', 'scratch', 'yawn', 'laugh', 'doze', 'demo', 'glance', 'blink'];
      var kind = kinds[idleStep % kinds.length];
      idleStep++;
      routine = { kind: kind, phase: kind, start: null, duration: {
        brows: 2200, scratch: 3300, yawn: 3000, laugh: 3000,
        doze: 3400, demo: 2500, glance: 1700, blink: 850
      }[kind] };
      if (kind === 'demo' || kind === 'scratch') figure.classList.add('is-demonstrating');
      if (kind === 'scratch') figure.classList.add('is-scratching');
      say({ brows: 'Oh, hello there.', scratch: 'Just an itch. Your turn next.',
        yawn: 'Long night at the terminal.', laugh: 'Okay, that got me.',
        doze: 'Just resting my eyes.', demo: 'Go on. Give my cheek a pull.'
      }[kind] || idleHint);
      wake();
    }, delay);
  }
  function activity() {
    cancelAttention();
    blink.target = 0;
    tilt.target = 0;
    surprise.target = hovered ? 0.15 : 0;
    // Give the visitor's elastic pull time to settle before the next act.
    scheduleIdle(2400);
  }
  function envelope(progress, rise, fall) {
    return Math.min(clamp(progress / rise, 0, 1), clamp((1 - progress) / fall, 0, 1));
  }
  function animateRoutine(now) {
    if (!routine) return false;
    if (routine.start === null) routine.start = now;
    var elapsed = (now - routine.start) / 1000;
    var p = clamp((now - routine.start) / routine.duration, 0, 1);
    var strength = envelope(p, 0.18, 0.18);
    blink.target = yawn.target = brows.target = laugh.target = 0;
    look.tx = cursor.x; look.ty = cursor.y;
    tilt.target = 0;
    surprise.target = hovered ? 0.15 : 0;
    demo.tx = demo.ty = 0;
    routine.phase = routine.kind;
    if (routine.kind === 'brows') {
      // Two deliberately readable raises rather than a near-invisible twitch.
      brows.target = p < 0.5 ? envelope(p / 0.5, 0.23, 0.18) : envelope((p - 0.5) / 0.5, 0.2, 0.3);
      look.ty -= brows.target * 0.009;
      tilt.target = Math.sin(p * Math.PI) * -0.023;
      blink.target = eyelid(elapsed, 0.83, 0.26);
    } else if (routine.kind === 'blink') {
      blink.target = Math.max(eyelid(elapsed, 0.1, 0.25), eyelid(elapsed, 0.47, 0.25));
    } else if (routine.kind === 'glance') {
      look.tx += Math.sin(p * Math.PI * 2) * 0.03;
      look.ty -= Math.sin(p * Math.PI) * 0.006;
      tilt.target = Math.sin(p * Math.PI * 2) * 0.028;
      blink.target = eyelid(elapsed, 1.35, 0.25);
    } else if (routine.kind === 'yawn') {
      yawn.target = strength;
      blink.target = strength * 0.35;
      tilt.target = -strength * 0.032;
      look.ty -= strength * 0.012;
    } else if (routine.kind === 'laugh') {
      laugh.target = strength;
      var chuckle = Math.sin(elapsed * Math.PI * 7) * strength;
      look.ty += chuckle * 0.01;
      tilt.target = Math.sin(elapsed * Math.PI * 3.5) * strength * 0.026;
      brows.target = pulse(elapsed, 0.1, 0.35) * 0.4;
    } else if (routine.kind === 'doze') {
      if (p < 0.69) {
        var droop = clamp(p / 0.3, 0, 1);
        blink.target = droop;
        look.ty += droop * 0.025;
        tilt.target = droop * 0.085;
        routine.phase = 'dozing';
      } else {
        routine.phase = 'waking';
        var jolt = envelope((p - 0.69) / 0.31, 0.12, 0.35);
        surprise.target = jolt;
        look.ty -= jolt * 0.019;
        tilt.target = -jolt * 0.035;
        say('I am awake. Definitely awake.');
      }
    } else if (routine.kind === 'scratch') {
      // The cursor visibly arrives, makes four short scratching strokes, leaves.
      var arriving = clamp(p / 0.2, 0, 1);
      var leaving = clamp((p - 0.78) / 0.22, 0, 1);
      var contact = p >= 0.2 && p < 0.78;
      var stroke = contact ? Math.sin((p - 0.2) / 0.58 * Math.PI * 8) : 0;
      ghost.x = (0.88 + (0.35 - 0.88) * arriving) + leaving * 0.48 + stroke * 0.006;
      ghost.y = (0.25 + (0.47 - 0.25) * arriving) - leaving * 0.2 + stroke * 0.023;
      ghost.angle = -18 + stroke * 13;
      demo.tx = contact ? stroke * 0.009 : 0;
      demo.ty = contact ? stroke * 0.012 : 0;
      look.tx -= strength * 0.012;
      brows.target = strength * 0.5;
      laugh.target = contact ? 0.25 : 0;
    } else if (routine.kind === 'demo') {
      var stretch = p < 0.27 ? Math.sin(p / 0.27 * Math.PI / 2) : p < 0.63 ? 1 : Math.max(0, 1 - (p - 0.63) / 0.15);
      var waggle = p > 0.27 && p < 0.63 ? Math.sin((p - 0.27) * Math.PI * 15) : 0;
      demo.tx = -0.13 * stretch + waggle * 0.012;
      demo.ty = 0.015 * stretch + waggle * 0.007;
      ghost.x = 0.35 + demo.x; ghost.y = 0.47 + demo.y;
      ghost.angle = -18 + demo.x * 100;
      surprise.target = stretch * 0.85;
      blink.target = eyelid(elapsed, 2.04, 0.25);
    }
    if (p < 1) return true;
    routine = null;
    demo.tx = demo.ty = blink.target = tilt.target = yawn.target = brows.target = laugh.target = 0;
    look.tx = cursor.x; look.ty = cursor.y;
    surprise.target = hovered ? 0.15 : 0;
    figure.classList.remove('is-demonstrating', 'is-scratching');
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
      stepSpring(pull, dt, 150, 11);
      stepSpring(look, dt, 120, 19);
      stepSpring(demo, dt, 200, 19);
      stepScalar(tilt, dt, 140, 20);
      stepScalar(blink, dt, 950, 48);
      stepScalar(surprise, dt, 180, 24);
      stepScalar(yawn, dt, 180, 24);
      stepScalar(brows, dt, 220, 26);
      stepScalar(laugh, dt, 180, 24);
    }
    // Evaluate every channel so a settled one snaps exactly to its target.
    var moving = [movingSpring(pull), movingSpring(look), movingSpring(demo), movingScalar(tilt), movingScalar(blink), movingScalar(surprise), movingScalar(yawn), movingScalar(brows), movingScalar(laugh)].some(Boolean);
    if (pointer !== null && dragged) state('dragging');
    else if (routine && routine.kind === 'scratch') state('scratching');
    else if (routine && routine.kind === 'brows') state('raising-brows');
    else if (routine && routine.kind === 'yawn') state('yawning');
    else if (routine && routine.kind === 'laugh') state('laughing');
    else if (routine && routine.kind === 'demo') state('demonstrating');
    else if (routine && routine.kind === 'doze') state(routine.phase);
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
    scheduleIdle(2400);
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
      loadedFaces = {};
      optionalStarted = false;
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
      if (!gl) { fallback(); return; }
      var vertex = compile(gl.VERTEX_SHADER,
        'attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=vec2(aPosition.x,1.0-aPosition.y);gl_Position=vec4(aPosition*2.0-1.0,0.0,1.0);}');
      var fragment = compile(gl.FRAGMENT_SHADER,
        'precision mediump float;varying vec2 vUv;uniform sampler2D uTexture;uniform sampler2D uBlinkTexture;uniform sampler2D uReactionTexture;' +
        'uniform sampler2D uYawnTexture;uniform sampler2D uBrowsTexture;uniform sampler2D uLaughTexture;' +
        'uniform vec2 uGrab;uniform vec2 uPull;uniform vec2 uLook;uniform vec2 uDemo;uniform float uTilt;uniform float uBlink;uniform float uSurprise;uniform float uYawn;uniform float uBrows;uniform float uLaugh;' +
        'float oval(vec2 p,vec2 center,vec2 radius){return 1.0-smoothstep(0.5,1.0,length((p-center)/radius));}' +
        // Lengthen the deformation along a large pull instead of folding a fixed-radius patch.
        'void main(){float pullLength=length(uPull);vec2 axis=uPull/max(pullLength,0.0001);vec2 d=vUv-uGrab-uPull;float along=dot(d,axis);vec2 across=d-axis*along;' +
        'float weight=exp(-(along*along/(0.03+1.4*pullLength*pullLength)+dot(across,across)/0.032));vec2 source=vUv-uPull*weight;' +
        'vec2 demoDelta=vUv-vec2(0.35,0.47)-uDemo;source-=uDemo*exp(-dot(demoDelta,demoDelta)/0.018);' +
        'vec2 head=(source-vec2(0.5,0.38))/vec2(0.27,0.36);float headWeight=exp(-dot(head,head)*1.8);' +
        'vec2 neck=source-vec2(0.5,0.72);source-=vec2(-neck.y,neck.x)*uTilt*headWeight;source-=uLook*headWeight;' +
        'float pupils=max(oval(source,vec2(0.416,0.362),vec2(0.027,0.016)),oval(source,vec2(0.59,0.36),vec2(0.027,0.016)));source-=uLook*0.2*pupils;' +
        'if(source.x<0.0||source.x>1.0||source.y<0.0||source.y>1.0){gl_FragColor=vec4(0.0);return;}' +
        'vec4 base=texture2D(uTexture,source);float face=oval(source,vec2(0.5,0.415),vec2(0.245,0.23));' +
        'vec4 color=mix(base,texture2D(uReactionTexture,source),clamp(uSurprise,0.0,1.0)*face);' +
        'float mouth=1.0-smoothstep(0.8,1.0,length((source-vec2(0.5,0.545))/vec2(0.185,0.16)));float expressiveFace=max(face,mouth);' +
        'color=mix(color,texture2D(uYawnTexture,source),clamp(uYawn,0.0,1.0)*expressiveFace);' +
        'color=mix(color,texture2D(uLaughTexture,source),clamp(uLaugh,0.0,1.0)*expressiveFace);' +
        'float browArea=oval(source,vec2(0.5,0.325),vec2(0.23,0.105));color=mix(color,texture2D(uBrowsTexture,source),clamp(uBrows,0.0,1.0)*browArea);' +
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
      ['uGrab', 'uPull', 'uLook', 'uDemo', 'uTilt', 'uBlink', 'uSurprise', 'uYawn', 'uBrows', 'uLaugh'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
      texture = makeTexture(image, 0);
      [0, 1, 2, 3, 4, 5].forEach(function (unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); });
      gl.activeTexture(gl.TEXTURE0);
      ['uTexture', 'uBlinkTexture', 'uReactionTexture', 'uYawnTexture', 'uBrowsTexture', 'uLaughTexture'].forEach(function (name, unit) { gl.uniform1i(gl.getUniformLocation(program, name), unit); });
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
    pull.tx = clamp(point.x - grab.x, -0.30, 0.30);
    pull.ty = clamp(point.y - grab.y, -0.30, 0.30);
    var length = Math.sqrt(pull.tx * pull.tx + pull.ty * pull.ty);
    if (length > 0.34) { pull.tx *= 0.34 / length; pull.ty *= 0.34 / length; }
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
    if (event.key === 'Escape') { reset(); if (ready) draw(); scheduleIdle(1200); }
    else if (directions[event.key] && active()) { event.preventDefault(); tug(directions[event.key][0], directions[event.key][1]); }
  });
  control.addEventListener('pointerenter', function (event) {
    if (!active() || event.pointerType === 'touch' || pointer !== null) return;
    hovered = true;
    if (!routine) surprise.target = 0.2;
    wake();
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
    cursor.x = inside ? clamp((event.clientX - rect.left - rect.width / 2) / (rect.width * 1.4), -1, 1) * 0.024 : 0;
    cursor.y = inside ? clamp((event.clientY - rect.top - rect.height * 0.4) / (rect.height * 1.2), -1, 1) * 0.015 : 0;
    look.tx = cursor.x; look.ty = cursor.y;
    wake();
  });
  window.addEventListener('pointerout', function (event) {
    if (event.relatedTarget !== null || !active() || pointer !== null) return;
    cursor.x = cursor.y = look.tx = look.ty = 0; wake();
  });
  // Losing keyboard focus does not mean the portrait has left the screen.
  // Release an interrupted grab, but keep entertaining a visitor reading beside it.
  window.addEventListener('blur', function () {
    reset();
    if (active()) { loadExpressions(); draw(); scheduleIdle(250); }
  });
  window.addEventListener('portfolio:ready', function () { bootComplete = true; if (active()) scheduleIdle(120); });
  window.addEventListener('focus', function () {
    if (!active()) return;
    loadExpressions();
    draw();
    if (!routine && !idleTimer && pointer === null) scheduleIdle(250);
  });
  canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); fallback(); });
  canvas.addEventListener('webglcontextrestored', initialize);
  image.addEventListener('error', fallback);
  if (motion.addEventListener) motion.addEventListener('change', updateMotion);
  else motion.addListener(updateMotion);
  document.addEventListener('visibilitychange', function () { reset(); if (active()) { loadExpressions(); draw(); scheduleIdle(250); } });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var next = entries[0].isIntersecting;
      if (visible === next) return;
      visible = next; reset();
      if (active()) { loadExpressions(); draw(); scheduleIdle(250); }
    }).observe(figure);
  }
  if ('ResizeObserver' in window) new ResizeObserver(function () { if (active()) draw(); }).observe(control);
  else window.addEventListener('resize', function () { if (active()) draw(); });
  control.disabled = true;
  if (image.complete && image.naturalWidth) initialize();
  else image.addEventListener('load', initialize, { once: true });
})();
