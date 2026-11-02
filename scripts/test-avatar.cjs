/* Run with: node --test scripts/test-avatar.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/avatar.js'), 'utf8');

// Run the real event handlers, idle scheduler, and springs with a deterministic
// clock. Record the shader uniforms for every draw rather than mirroring the UI.
function portrait(options = {}) {
  let now = 0, nextId = 1, textureId = 0, activeUnit = 0, glError = 0;
  let intersect, contextLost = false, imageLoads = 0;
  const frames = new Map(), timers = new Map(), draws = [], uniforms = {}, units = {};
  const captured = new Set(), documentEvents = {}, windowEvents = {}, nodes = {}, imageCallbacks = [];
  for (const id of ['heroPortrait', 'portraitControl', 'portraitImage', 'portraitCanvas', 'portraitHint', 'top']) {
    const classes = new Set(), events = {}, attrs = {}, styles = {};
    nodes[id] = {
      disabled: false, complete: true, naturalWidth: 900, width: 0, height: 0,
      classList: {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value)
      },
      style: { setProperty: (key, value) => { styles[key] = value; }, getPropertyValue: key => styles[key] },
      setAttribute: (key, value) => { attrs[key] = value; },
      getAttribute: key => attrs[key] || null,
      addEventListener: (type, callback) => (events[type] ||= []).push(callback),
      fire(type, values = {}) { (events[type] || []).forEach(callback => callback({ preventDefault() {}, ...values })); },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 320 }),
      setPointerCapture: id => captured.add(id),
      hasPointerCapture: id => captured.has(id),
      releasePointerCapture(id) { captured.delete(id); this.fire('lostpointercapture', { pointerId: id }); }
    };
  }
  if (!options.noExpressions) {
    nodes.heroPortrait.setAttribute('data-blink-src', 'blink.webp');
    nodes.heroPortrait.setAttribute('data-reaction-src', 'surprise.webp');
    nodes.heroPortrait.setAttribute('data-yawn-src', 'yawn.webp');
    nodes.heroPortrait.setAttribute('data-brows-src', 'brows.webp');
    nodes.heroPortrait.setAttribute('data-laugh-src', 'laugh.webp');
  }
  if (options.booting) nodes.bootScreen = { hidden: false };
  const gl = new Proxy({}, {
    get(_, key) {
      if (key === 'NO_ERROR') return 0;
      if (key === 'TEXTURE0') return 100;
      if (key === 'getError') return () => { const error = glError; glError = 0; return error; };
      if (key === 'isContextLost') return () => contextLost;
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
      if (key === 'getUniformLocation') return (_, name) => name;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'uniform2f') return (name, x, y) => { uniforms[name] = [x, y]; };
      if (key === 'uniform1f') return (name, value) => { uniforms[name] = value; };
      if (key === 'activeTexture') return unit => { activeUnit = unit - 100; };
      if (key === 'bindTexture') return (_, item) => { units[activeUnit] = item; };
      if (key === 'texImage2D') return (...args) => {
        if (args.at(-1).optional && options.optionalUploadFails) glError = 1282;
        if (args.at(-1).optional && options.optionalUploadThrows) throw new Error('Optional upload blocked');
      };
      if (key === 'createTexture') return () => ({ id: ++textureId });
      if (key === 'drawArrays') return () => draws.push({
        pull: [...uniforms.uPull], look: [...uniforms.uLook], demo: [...uniforms.uDemo], grab: [...uniforms.uGrab],
        blink: uniforms.uBlink, surprise: uniforms.uSurprise, yawn: uniforms.uYawn, brows: uniforms.uBrows, laugh: uniforms.uLaugh, tilt: uniforms.uTilt,
        state: nodes.heroPortrait.getAttribute('data-portrait-state'), time: now
      });
      if (['createShader', 'createProgram', 'createBuffer'].includes(key)) return () => ({});
      if (key === key.toUpperCase()) return 1;
      return () => {};
    }
  });
  nodes.portraitCanvas.getContext = () => {
    if (options.blocked) throw new Error('Context blocked');
    return options.unavailable ? null : gl;
  };
  class ExpressionImage {
    constructor() { this.optional = true; }
    set src(_) {
      imageLoads++;
      if (options.expressionFailure) return;
      if (options.delayedExpressions) imageCallbacks.push(() => this.onload());
      else this.onload();
    }
  }
  const motion = { matches: !!options.reduced, addEventListener: (_, callback) => { motion.change = callback; } };
  const document = {
    hidden: false, getElementById: id => nodes[id],
    addEventListener: (type, callback) => { documentEvents[type] = callback; }
  };
  function IntersectionObserver(callback) { intersect = callback; this.observe = () => {}; }
  const window = {
    devicePixelRatio: 3, IntersectionObserver,
    matchMedia: query => query.includes('reduced-motion') ? motion : { matches: !!options.coarse },
    addEventListener: (type, callback) => { (windowEvents[type] ||= []).push(callback); },
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(source, { window, document, Image: ExpressionImage, IntersectionObserver, Float32Array, Math });
  function step() {
    now += 1000 / 60;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback(now));
  }
  return {
    ...nodes, draws, captured, motion, units,
    get pending() { return frames.size + timers.size; },
    get pendingFrames() { return frames.size; },
    get pendingTimers() { return timers.size; },
    get imageLoads() { return imageLoads; },
    get activeUnit() { return activeUnit; },
    step,
    run(count) { for (let i = 0; i < count; i++) step(); },
    advance(milliseconds) { const end = now + milliseconds; while (now < end) step(); },
    settle() {
      let count = 0;
      // Used after visitor gestures; future automatic acts do not delay this check.
      while (frames.size || count < 18) {
        assert.ok(count++ < 240, 'visitor gesture must settle before automatic acts resume'); step();
      }
    },
    pointer(type, values = {}) {
      nodes.portraitControl.fire(type, { isPrimary: true, button: 0, pointerId: 1, clientX: 160, clientY: 140, ...values });
      if (type === 'pointerup' || type === 'pointercancel') captured.delete(1);
    },
    click(detail = 1) { nodes.portraitControl.fire('click', { detail, clientX: 170, clientY: 150 }); },
    windowEvent(type, values = {}) { (windowEvents[type] || []).forEach(callback => callback(values)); },
    intersection: value => intersect([{ isIntersecting: value }]),
    visibility(value) { document.hidden = value; documentEvents.visibilitychange(); },
    context(value) { contextLost = value; nodes.portraitCanvas.fire(value ? 'webglcontextlost' : 'webglcontextrestored'); },
    portfolioReady() { if (nodes.bootScreen) nodes.bootScreen.hidden = true; (windowEvents['portfolio:ready'] || []).forEach(callback => callback()); },
    finishImages() { imageCallbacks.splice(0).forEach(callback => callback()); }
  };
}
function assertStill(p) {
  assert.equal(p.portraitControl.disabled, true);
  assert.equal(p.heroPortrait.classList.contains('is-ready'), false);
  assert.equal(p.heroPortrait.classList.contains('is-interactive'), false);
  assert.equal(p.portraitHint.textContent, 'A face behind the terminal.');
  p.click(); p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 220 });
  assert.equal(p.pending, 0);
}

test('a large mouse drag stretches farther and rebounds elastically before automatic acts resume', () => {
  const p = portrait();
  p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 300 }); p.advance(600);
  assert.ok(p.draws.at(-1).pull[0] > 0.25, 'new pull must be visibly greater than the old .14 limit');
  assert.deepEqual(p.draws.at(-1).grab, [0.5, 140 / 320]);
  assert.equal(p.draws.at(-1).state, 'dragging');
  p.pointer('pointerup');
  const released = p.draws.length; p.settle();
  assert.ok(p.draws.slice(released).some(draw => draw.pull[0] < -0.015), 'soft spring must overshoot on release');
  assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
  assert.equal(p.pendingFrames, 0);
  p.advance(2800);
  assert.ok(p.draws.some(draw => draw.time > 3000 && draw.state === 'raising-brows'), 'automatic personality resumes after the visitor lets go');
});

test('diagonal dragging remains bounded while allowing a larger elastic grip', () => {
  const p = portrait(); p.pointer('pointerdown');
  p.pointer('pointermove', { clientX: 900, clientY: 900 }); p.advance(1500);
  const pull = p.draws.at(-1).pull;
  assert.ok(Math.hypot(...pull) > 0.32 && Math.hypot(...pull) < 0.35);
});

test('mouse, touch, and keyboard tugs still include an expression and settle', () => {
  for (const mode of ['mouse', 'touch', 'keyboard']) {
    const p = portrait({ coarse: mode === 'touch' });
    if (mode !== 'keyboard') { p.pointer('pointerdown', { pointerType: mode }); p.pointer('pointerup', { pointerType: mode }); }
    p.click(mode === 'keyboard' ? 0 : 1); p.run(8);
    assert.ok(p.draws.at(-1).pull[0] > 0.015, mode);
    assert.ok(p.draws.at(-1).surprise > 0.2, mode);
    assert.equal(p.portraitHint.textContent, 'Hello from behind the terminal.');
    p.settle(); assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
    assert.equal(p.pendingFrames, 0);
    if (mode === 'touch') assert.equal(p.portraitHint.textContent, 'Tap or drag to say hello.');
  }
});

test('drag completion and canceled touch scrolling suppress only their synthetic click', () => {
  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const p = portrait(); p.pointer('pointerdown');
    if (end === 'pointerup') { p.pointer('pointermove', { clientX: 220 }); p.run(5); }
    p.pointer(end); p.settle();
    const count = p.draws.length; p.click();
    assert.equal(p.pendingFrames, 0, end); assert.equal(p.draws.length, count);
    p.pointer('pointerdown'); p.pointer('pointerup'); p.click();
    assert.ok(p.pendingFrames > 0);
  }
});

test('duplicate visibility observations preserve a drag; hiding cancels capture and all timers', () => {
  const p = portrait(); p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 220 }); p.run(5);
  p.intersection(true); assert.equal(p.captured.size, 1); p.run(5);
  assert.ok(p.draws.at(-1).pull[0] > 0.10);
  p.visibility(true); assert.equal(p.captured.size, 0); assert.equal(p.pending, 0);
  p.visibility(false); assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
});

test('the first eyebrow act starts promptly, without waiting for a pointer event', () => {
  const p = portrait(); p.advance(600);
  assert.ok(p.draws.some(draw => draw.state === 'raising-brows' && draw.time <= 300));
  assert.ok(p.draws.at(-1).brows > 0.5);
  p.advance(700); assert.ok(p.draws.some(draw => draw.blink >= 1));
});

test('boot loading preloads expressions but starts the first visible act after portfolio ready', () => {
  const p = portrait({ booting: true });
  assert.equal(p.imageLoads, 5);
  p.advance(5000);
  assert.equal(p.pending, 0);
  assert.ok(!p.draws.some(draw => draw.brows > 0));
  p.portfolioReady(); p.advance(400);
  assert.ok(p.draws.some(draw => draw.state === 'raising-brows' && draw.time <= 5250));
});

test('without input every requested act appears and the cycle repeats with short rests', () => {
  const p = portrait(); p.advance(51000);
  for (const name of ['raising-brows', 'scratching', 'yawning', 'laughing', 'dozing', 'waking', 'demonstrating']) {
    const starts = p.draws.filter((draw, index) => draw.state === name && (!index || p.draws[index - 1].state !== name));
    assert.ok(starts.length >= 2, name + ' must recur without input');
    assert.ok(starts[0].time < 21000, name + ' must be in the first continuous cycle');
  }
  assert.ok(p.draws.some(draw => draw.yawn > 0.95));
  assert.ok(p.draws.some(draw => draw.laugh > 0.95));
  assert.ok(p.draws.some(draw => draw.state === 'dozing' && draw.blink > 0.95));
  assert.ok(p.draws.some(draw => draw.state === 'waking' && draw.surprise > 0.8));
  assert.ok(p.draws.some(draw => draw.state === 'demonstrating' && draw.demo[0] < -0.11));
  const gaps = p.draws.slice(1).map((draw, index) => draw.time - p.draws[index].time);
  assert.ok(Math.max(...gaps) <= 800, 'visible animation must not disappear into multi-second idle gaps');
});

test('the automatic cursor scratches back and forth several times on the cheek', () => {
  const p = portrait(); p.advance(6500);
  const strokes = p.draws.filter(draw => draw.state === 'scratching' && Math.abs(draw.demo[1]) > 0.002);
  let reversals = 0;
  for (let i = 1; i < strokes.length; i++) if (Math.sign(strokes[i].demo[1]) !== Math.sign(strokes[i - 1].demo[1])) reversals++;
  assert.ok(reversals >= 6, 'four clear scratching strokes must reverse direction repeatedly');
});

test('passive mouse motion follows the cursor without canceling the continuous acts', () => {
  const p = portrait();
  for (let i = 0; i < 1500; i++) {
    p.windowEvent('pointermove', { pointerType: 'mouse', clientX: i % 2 ? 80 : 250, clientY: 120 });
    p.step();
  }
  for (const name of ['raising-brows', 'scratching', 'yawning', 'laughing', 'dozing', 'waking']) assert.ok(p.draws.some(draw => draw.state === name), name);
  assert.ok(p.draws.some(draw => Math.abs(draw.look[0]) > 0.002));
  const last = p.draws.at(-1).look;
  p.windowEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 10 });
  assert.deepEqual(p.draws.at(-1).look, last);
});

test('grabbing immediately takes control from an automatic scratch or demonstration', () => {
  const p = portrait(); p.advance(4500);
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), true);
  p.pointer('pointerdown'); p.run(1);
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), false);
  assert.equal(p.heroPortrait.classList.contains('is-scratching'), false);
  assert.deepEqual(p.draws.at(-1).demo, [0, 0]);
  p.pointer('pointermove', { clientX: 280 }); p.run(15);
  assert.ok(p.draws.at(-1).pull[0] > 0.25); assert.deepEqual(p.draws.at(-1).demo, [0, 0]);
});

test('automatic work stops completely when inactive and resumes promptly when visible', () => {
  for (const mode of ['offscreen', 'hidden', 'blur']) {
    const p = portrait(); p.advance(4500);
    if (mode === 'offscreen') p.intersection(false);
    if (mode === 'hidden') p.visibility(true);
    if (mode === 'blur') p.windowEvent('blur');
    assert.equal(p.pending, 0, mode);
    const count = p.draws.length; p.advance(30000); assert.equal(p.draws.length, count);
    if (mode === 'offscreen') p.intersection(true);
    if (mode === 'hidden') p.visibility(false);
    if (mode === 'blur') p.windowEvent('focus');
    p.advance(400);
    assert.ok(p.draws.some(draw => draw.time >= 34500 && draw.state !== 'idle'), mode + ' resumes an act within400ms');
  }
});

test('reduced motion and blocked WebGL retain only the still portrait', () => {
  for (const options of [{ reduced: true }, { unavailable: true }, { blocked: true }]) {
    const p = portrait(options); assertStill(p); assert.equal(p.imageLoads, 0);
  }
});

test('runtime motion changes and context loss recover without stranded pointer capture', () => {
  const p = portrait(); p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 220 }); p.run(4);
  p.motion.matches = true; p.motion.change(); assertStill(p); assert.equal(p.captured.size, 0);
  p.motion.matches = false; p.motion.change(); assert.equal(p.portraitControl.disabled, false);
  p.context(true); assertStill(p); p.context(false); assert.equal(p.portraitControl.disabled, false);
  p.click(0); p.run(5); assert.ok(p.draws.at(-1).pull[0] > 0.015);
});

test('failed expression downloads or uploads retain valid base samplers and dragging', () => {
  for (const options of [{ noExpressions: true }, { expressionFailure: true }, { optionalUploadFails: true }, { optionalUploadThrows: true }]) {
    const p = portrait(options); p.advance(1000);
    assert.equal(p.portraitControl.disabled, false);
    assert.ok(p.draws.every(draw => draw.blink === 0 && draw.brows === 0 && draw.yawn === 0 && draw.laugh === 0));
    for (let unit = 1; unit <= 5; unit++) assert.equal(p.units[0], p.units[unit]);
    assert.equal(p.activeUnit, 0);
    p.click(); p.run(8); assert.ok(p.draws.at(-1).pull[0] > 0.015);
  }
});

test('optional faces load only when allowed and stale context callbacks cannot revive the canvas', () => {
  const p = portrait({ reduced: true }); assert.equal(p.imageLoads, 0);
  p.motion.matches = false; p.motion.change(); assert.equal(p.imageLoads, 5);
  const delayed = portrait({ delayedExpressions: true }); delayed.context(true); delayed.finishImages(); assertStill(delayed);
  delayed.context(false); delayed.finishImages(); delayed.advance(1400);
  assert.ok(delayed.draws.some(draw => draw.blink >= 1));
});
