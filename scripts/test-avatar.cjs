/* Run with: node --test scripts/test-avatar.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/avatar.js'), 'utf8');

// Exercise the real event handlers and spring loop, recording each WebGL draw's
// uniforms. No browser or dependency installation is needed for these regressions.
function portrait(options = {}) {
  let now = 0;
  let nextId = 1;
  let intersect;
  let contextLost = false;
  const frames = new Map();
  const timers = new Map();
  const draws = [];
  const uniforms = {};
  const captured = new Set();
  const documentEvents = {};
  const nodes = {};

  for (const id of ['heroPortrait', 'portraitControl', 'portraitImage', 'portraitCanvas', 'portraitHint']) {
    const classes = new Set();
    const events = {};
    nodes[id] = {
      disabled: false, complete: true, naturalWidth: 900, width: 0, height: 0,
      classList: {
        add: (...values) => values.forEach(value => classes.add(value)),
        remove: (...values) => values.forEach(value => classes.delete(value)),
        contains: value => classes.has(value)
      },
      addEventListener: (type, callback) => (events[type] ||= []).push(callback),
      fire(type, values = {}) {
        const event = { preventDefault() {}, ...values };
        (events[type] || []).forEach(callback => callback(event));
      },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 320 }),
      setPointerCapture: id => captured.add(id),
      hasPointerCapture: id => captured.has(id),
      releasePointerCapture(id) {
        captured.delete(id);
        this.fire('lostpointercapture', { pointerId: id });
      }
    };
  }

  const gl = new Proxy({}, {
    get(_, key) {
      if (key === 'NO_ERROR') return 0;
      if (key === 'getError') return () => 0;
      if (key === 'isContextLost') return () => contextLost;
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
      if (key === 'getUniformLocation') return (_, name) => name;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'uniform2f') return (name, x, y) => { uniforms[name] = [x, y]; };
      if (key === 'drawArrays') return () => draws.push({ pull: [...uniforms.uPull], grab: [...uniforms.uGrab] });
      if (['createShader', 'createProgram', 'createBuffer', 'createTexture'].includes(key)) return () => ({});
      if (key === key.toUpperCase()) return 1;
      return () => {};
    }
  });
  nodes.portraitCanvas.getContext = () => {
    if (options.blocked) throw new Error('Context blocked');
    return options.unavailable ? null : gl;
  };
  const motion = {
    matches: !!options.reduced,
    addEventListener: (_, callback) => { motion.change = callback; }
  };
  const document = {
    hidden: false,
    getElementById: id => nodes[id],
    addEventListener: (type, callback) => { documentEvents[type] = callback; }
  };
  function IntersectionObserver(callback) { intersect = callback; this.observe = () => {}; }
  const window = {
    devicePixelRatio: 3,
    IntersectionObserver,
    matchMedia: () => motion,
    addEventListener() {},
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(source, { window, document, IntersectionObserver, Float32Array, Math });

  function step() {
    now += 1000 / 60;
    for (const [id, timer] of timers) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(callback => callback(now));
  }
  return {
    ...nodes, draws, captured, motion,
    get pending() { return frames.size + timers.size; },
    step,
    run(count) { for (let i = 0; i < count; i++) step(); },
    settle() {
      let count = 0;
      while (frames.size || timers.size) {
        assert.ok(count++ < 600, 'spring must settle and stop scheduling work');
        step();
      }
    },
    pointer(type, values = {}) {
      nodes.portraitControl.fire(type, { isPrimary: true, button: 0, pointerId: 1, clientX: 160, clientY: 140, ...values });
      if (type === 'pointerup' || type === 'pointercancel') captured.delete(1);
    },
    click(detail = 1) { nodes.portraitControl.fire('click', { detail, clientX: 170, clientY: 150 }); },
    intersection: value => intersect([{ isIntersecting: value }]),
    visibility(value) { document.hidden = value; documentEvents.visibilitychange(); },
    context(value) {
      contextLost = value;
      nodes.portraitCanvas.fire(value ? 'webglcontextlost' : 'webglcontextrestored');
    }
  };
}

function assertStill(p) {
  assert.equal(p.portraitControl.disabled, true);
  assert.equal(p.heroPortrait.classList.contains('is-ready'), false);
  assert.equal(p.heroPortrait.classList.contains('is-interactive'), false);
  assert.equal(p.portraitHint.textContent, 'A face behind the terminal.');
  p.click();
  p.pointer('pointerdown');
  p.pointer('pointermove', { clientX: 220 });
  assert.equal(p.pending, 0);
}

test('a held drag sends nonzero localized shader uniforms, then springs back and stops', () => {
  const p = portrait();
  p.pointer('pointerdown');
  p.pointer('pointermove', { clientX: 220 });
  p.run(12);
  assert.ok(p.draws.at(-1).pull[0] > 0.10);
  assert.deepEqual(p.draws.at(-1).grab, [0.5, 140 / 320]);
  assert.equal(p.portraitHint.textContent, 'Pull, then let go.');
  p.pointer('pointerup');
  p.settle();
  assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
  assert.equal(p.portraitHint.textContent, 'Tap or drag to stretch.');
  assert.equal(p.pending, 0);
});

test('mouse click, touch tap, and native keyboard activation each visibly tug and settle', () => {
  for (const mode of ['mouse', 'touch', 'keyboard']) {
    const p = portrait();
    if (mode !== 'keyboard') {
      p.pointer('pointerdown', { pointerType: mode });
      p.pointer('pointerup', { pointerType: mode });
    }
    p.click(mode === 'keyboard' ? 0 : 1);
    p.run(5);
    assert.ok(p.draws.at(-1).pull[0] > 0.015, mode + ' must change the rendered displacement');
    assert.equal(p.portraitHint.textContent, 'Hello from behind the terminal.');
    p.settle();
    assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
  }
});

test('post-drag click and canceled scrolling gesture never start a second tug', () => {
  for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const p = portrait();
    p.pointer('pointerdown');
    if (end === 'pointerup') {
      p.pointer('pointermove', { clientX: 220 });
      p.run(5);
    }
    p.pointer(end);
    p.settle();
    const count = p.draws.length;
    p.click();
    assert.equal(p.pending, 0, end + ' must suppress its synthetic click');
    assert.equal(p.draws.length, count);
    // A subsequent real tap is not swallowed by the previous gesture.
    p.pointer('pointerdown');
    p.pointer('pointerup');
    p.click();
    assert.ok(p.pending > 0);
  }
});

test('duplicate visible observations preserve an active drag; hidden pages cancel it', () => {
  const p = portrait();
  p.pointer('pointerdown');
  p.pointer('pointermove', { clientX: 220 });
  p.run(5);
  p.intersection(true);
  assert.equal(p.captured.size, 1);
  p.run(5);
  assert.ok(p.draws.at(-1).pull[0] > 0.10);
  p.visibility(true);
  assert.equal(p.captured.size, 0);
  assert.equal(p.pending, 0);
  p.visibility(false);
  assert.deepEqual(p.draws.at(-1).pull, [0, 0]);
});

test('reduced motion and unavailable or blocked WebGL retain the still image', () => {
  for (const options of [{ reduced: true }, { unavailable: true }, { blocked: true }]) assertStill(portrait(options));
});

test('motion preference changes and context loss recover without stranded pointer capture', () => {
  const p = portrait();
  p.pointer('pointerdown');
  p.pointer('pointermove', { clientX: 220 });
  p.run(4);
  p.motion.matches = true;
  p.motion.change();
  assertStill(p);
  assert.equal(p.captured.size, 0);
  p.motion.matches = false;
  p.motion.change();
  assert.equal(p.portraitControl.disabled, false);
  p.context(true);
  assertStill(p);
  p.context(false);
  assert.equal(p.portraitControl.disabled, false);
  p.click(0);
  p.run(5);
  assert.ok(p.draws.at(-1).pull[0] > 0.015);
});
