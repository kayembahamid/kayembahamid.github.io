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
  }
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
        blink: uniforms.uBlink, surprise: uniforms.uSurprise, tilt: uniforms.uTilt,
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
      // Future attention timers are intentional; user gestures must stop RAF first.
      while (frames.size || [...timers.values()].some(item => item.at - now <= 500)) {
        assert.ok(count++ < 600, 'animation must settle without permanent rendering'); step();
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

test('a held drag renders a localized pull, then springs back with no permanent RAF', () => {
  const p = portrait();
  p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 220 }); p.run(12);
  assert.ok(p.draws.at(-1).pull[0] > 0.10);
  assert.deepEqual(p.draws.at(-1).grab, [0.5, 140 / 320]);
  assert.equal(p.draws.at(-1).state, 'dragging');
  assert.equal(p.portraitHint.textContent, 'Pull, then let go.');
  p.pointer('pointerup'); p.settle();
  assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
  assert.equal(p.pendingFrames, 0);
  assert.equal(p.pendingTimers, 1, 'one future attention timer is allowed');
});

test('mouse, touch, and keyboard tugs include an expression and settle', () => {
  for (const mode of ['mouse', 'touch', 'keyboard']) {
    const p = portrait({ coarse: mode === 'touch' });
    if (mode !== 'keyboard') { p.pointer('pointerdown', { pointerType: mode }); p.pointer('pointerup', { pointerType: mode }); }
    p.click(mode === 'keyboard' ? 0 : 1); p.run(8);
    assert.ok(p.draws.at(-1).pull[0] > 0.015, mode);
    assert.ok(p.draws.at(-1).surprise > 0.2, mode);
    assert.equal(p.portraitHint.textContent, 'Hello from behind the terminal.');
    p.settle();
    assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
    assert.equal(p.draws.at(-1).surprise, 0);
    assert.equal(p.pendingFrames, 0);
    if (mode === 'touch') assert.equal(p.portraitHint.textContent, 'Tap or drag to say hello.');
  }
});

test('drag completion and canceled touch scrolling suppress their synthetic click only', () => {
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

test('reduced motion and blocked WebGL show only the still photo and load no expressions', () => {
  for (const options of [{ reduced: true }, { unavailable: true }, { blocked: true }]) {
    const p = portrait(options); assertStill(p); assert.equal(p.imageLoads, 0);
  }
});

test('runtime motion changes and context loss recover without stranded capture', () => {
  const p = portrait(); p.pointer('pointerdown'); p.pointer('pointermove', { clientX: 220 }); p.run(4);
  p.motion.matches = true; p.motion.change(); assertStill(p); assert.equal(p.captured.size, 0);
  p.motion.matches = false; p.motion.change(); assert.equal(p.portraitControl.disabled, false);
  p.context(true); assertStill(p); p.context(false); assert.equal(p.portraitControl.disabled, false);
  p.click(0); p.run(5); assert.ok(p.draws.at(-1).pull[0] > 0.015);
});

test('without input the portrait fully blinks, demonstrates a cheek pull, then stops rendering', () => {
  const p = portrait(); p.advance(4500);
  assert.ok(p.draws.some(draw => draw.blink >= 1), 'blink must reach a fully closed blend');
  assert.ok(p.draws.some(draw => draw.demo[0] < -0.05));
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), true);
  assert.equal(p.portraitHint.textContent, 'Try pulling my cheek.');
  const x = parseFloat(p.heroPortrait.style.getPropertyValue('--ghost-x'));
  assert.ok(x >= 24 && x <= 36, 'ghost must follow the cheek inside the portrait');
  p.advance(2500); p.settle();
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), false);
  assert.equal(p.pendingFrames, 0);
  const count = p.draws.length; p.advance(1000); assert.equal(p.draws.length, count);
});

test('later idle routines include glances and dozing with a surprised wake-up', () => {
  const p = portrait(); p.advance(38000);
  assert.ok(p.draws.some(draw => draw.state === 'looking' && Math.abs(draw.look[0]) > 0.01));
  assert.ok(p.draws.some(draw => draw.state === 'dozing' && draw.blink > 0.9));
  assert.ok(p.draws.some(draw => draw.state === 'dozing' && draw.surprise > 0.4));
});

test('mouse motion follows the cursor, settles while held, and ignores touch hover', () => {
  const p = portrait();
  p.windowEvent('pointermove', { pointerType: 'mouse', clientX: 80, clientY: 80 }); p.settle();
  assert.ok(p.draws.at(-1).look[0] < -0.002);
  assert.equal(p.pendingFrames, 0);
  const last = p.draws.at(-1).look;
  p.windowEvent('pointermove', { pointerType: 'touch', clientX: 250, clientY: 250 });
  assert.deepEqual(p.draws.at(-1).look, last); assert.equal(p.pendingFrames, 0);
  p.windowEvent('pointermove', { pointerType: 'mouse', clientX: 250, clientY: 200 }); p.settle();
  assert.ok(p.draws.at(-1).look[0] > 0.002);
  p.windowEvent('pointerout', { relatedTarget: null }); p.settle();
  assert.deepEqual(p.draws.at(-1).look, [0, 0]);
});

test('visitor input immediately owns the face and cancels an automatic demonstration', () => {
  const p = portrait(); p.advance(4000);
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), true);
  p.pointer('pointerdown'); p.run(1);
  assert.equal(p.heroPortrait.classList.contains('is-demonstrating'), false);
  assert.deepEqual(p.draws.at(-1).demo, [0, 0]);
  p.pointer('pointermove', { clientX: 220 }); p.run(10);
  assert.ok(p.draws.at(-1).pull[0] > 0.10); assert.deepEqual(p.draws.at(-1).demo, [0, 0]);
});

test('idle work stops entirely offscreen, in a hidden tab, or after blur', () => {
  for (const mode of ['offscreen', 'hidden', 'blur']) {
    const p = portrait(); p.advance(4000);
    if (mode === 'offscreen') p.intersection(false);
    if (mode === 'hidden') p.visibility(true);
    if (mode === 'blur') p.windowEvent('blur');
    assert.equal(p.pending, 0, mode);
    const count = p.draws.length; p.advance(30000); assert.equal(p.draws.length, count);
    if (mode === 'offscreen') p.intersection(true);
    if (mode === 'hidden') p.visibility(false);
    if (mode === 'blur') p.windowEvent('focus');
    assert.equal(p.pendingTimers, 1, mode + ' resumes a delayed idle routine');
  }
});

test('failed or missing expression assets never replace the working base portrait', () => {
  for (const options of [{ noExpressions: true }, { expressionFailure: true }, { optionalUploadFails: true }, { optionalUploadThrows: true }]) {
    const p = portrait(options); p.advance(1000);
    assert.equal(p.portraitControl.disabled, false);
    assert.ok(p.draws.every(draw => draw.blink === 0));
    assert.equal(p.units[0], p.units[1]); assert.equal(p.units[0], p.units[2]);
    assert.equal(p.activeUnit, 0);
    p.click(); p.run(8); assert.ok(p.draws.at(-1).pull[0] > 0.015);
  }
});

test('expressions load only when motion is allowed and stale async loads cannot revive a lost context', () => {
  const p = portrait({ reduced: true }); assert.equal(p.imageLoads, 0);
  p.motion.matches = false; p.motion.change(); assert.equal(p.imageLoads, 2);
  const delayed = portrait({ delayedExpressions: true }); delayed.context(true); delayed.finishImages();
  assertStill(delayed);
  delayed.context(false); delayed.finishImages(); delayed.advance(1000);
  assert.ok(delayed.draws.some(draw => draw.blink >= 1));
});
