'use strict';
/*
 * main.js — the routing engine, the controls, and the frame loop.
 *
 * Written fresh rather than lifted: ChipTycoon walks a fixed polyline, this
 * walks a scenario over a graph, dwelling at each stop for as long as that stop
 * has to explain. Pause holds indefinitely.
 */
(function () {
  var flow = window.EC_FLOW;
  var canvas = document.getElementById('map');
  var ctx = canvas.getContext('2d');

  var scenario = flow.scenarios[0];
  var TRAVEL = 1500;                       // ms per hop

  var st = {
    idx: 0,                                // index into scenario.steps
    phase: 'dwell',                        // 'travel' | 'dwell'
    t: 0,                                  // ms elapsed in this phase
    paused: false,
    speed: 1,
    follow: true,
    dpr: 1
  };

  function stopById(id) {
    for (var i = 0; i < flow.stops.length; i++) if (flow.stops[i].id === id) return flow.stops[i];
    return null;
  }

  function step(i) { return scenario.steps[Math.max(0, Math.min(scenario.steps.length - 1, i))]; }

  function resize() {
    st.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * st.dpr;
    canvas.height = canvas.clientHeight * st.dpr;
  }

  /** Where the cart is right now, and what it is carrying. */
  function cartState() {
    var cur = step(st.idx);
    var here = stopById(cur.at);
    if (st.phase === 'travel' && st.idx > 0) {
      var prev = step(st.idx - 1);
      var from = stopById(prev.at);
      var k = Math.min(1, st.t / TRAVEL);
      var e = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k;   // ease in/out
      return {
        gx: from.grid.x + (here.grid.x - from.grid.x) * e,
        gy: from.grid.y + (here.grid.y - from.grid.y) * e,
        cargo: prev.cargo,                                   // changes ON arrival
        pulse: 0
      };
    }
    var p = 0.5 + 0.5 * Math.sin(st.t / 260);
    return { gx: here.grid.x, gy: here.grid.y, cargo: cur.cargo, pulse: p };
  }

  function activeTrack() {
    if (st.phase !== 'travel' || st.idx === 0) return null;
    return step(st.idx - 1).at + '>' + step(st.idx).at;
  }

  function stopStateFor(id) {
    var cur = step(st.idx);
    if (id === cur.at && st.phase === 'dwell') return 'current';
    for (var i = 0; i < st.idx; i++) if (scenario.steps[i].at === id) return 'visited';
    return 'ahead';
  }

  // ---------------------------------------------------------------- the panel

  var elTitle = document.getElementById('title');
  var elNote = document.getElementById('note');
  var elSrc = document.getElementById('src');
  var elCargo = document.getElementById('cargo');
  var elStamps = document.getElementById('stamps');
  var elVia = document.getElementById('via');
  var elTimer = document.getElementById('timer');
  var elProgress = document.getElementById('progress');
  var elCount = document.getElementById('count');

  function paintPanel() {
    var cur = step(st.idx);
    elTitle.textContent = cur.title;
    elNote.textContent = cur.note;
    elSrc.textContent = cur.src;
    elCargo.textContent = cur.cargo.label;
    elCargo.style.color = cur.cargo.tint;
    elVia.textContent = cur.via ? cur.via : 'starts here';

    elStamps.innerHTML = '';
    (cur.cargo.stamps || []).forEach(function (s) {
      var b = document.createElement('span');
      b.className = 'stamp';
      b.textContent = s;
      elStamps.appendChild(b);
    });

    elCount.textContent = (st.idx + 1) + ' / ' + scenario.steps.length;
    var done = st.idx / (scenario.steps.length - 1);
    elProgress.style.width = Math.round(done * 100) + '%';
  }

  // ------------------------------------------------------------------- clock

  var last = performance.now();

  function tick(now) {
    var dt = Math.min(64, now - last);
    last = now;

    if (!st.paused) {
      st.t += dt * st.speed;
      var cur = step(st.idx);
      if (st.phase === 'travel') {
        if (st.t >= TRAVEL) { st.phase = 'dwell'; st.t = 0; paintPanel(); }
      } else if (st.idx < scenario.steps.length - 1) {
        if (st.t >= cur.dwell) { st.idx++; st.phase = 'travel'; st.t = 0; paintPanel(); }
      }
    }

    var cart = cartState();
    if (st.follow) Iso.glideTo(cart.gx, cart.gy, 0.055);

    var cur2 = step(st.idx);
    var remain = st.phase === 'dwell'
      ? Math.max(0, cur2.dwell - st.t)
      : Math.max(0, TRAVEL - st.t);
    elTimer.textContent = st.paused ? 'paused'
      : (st.phase === 'dwell' ? (remain / 1000).toFixed(1) + 's' : 'in transit');

    Render.draw(ctx, canvas, flow, {
      dpr: st.dpr,
      cart: cart,
      activeTrack: activeTrack(),
      stopState: stopStateFor
    });

    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- controls

  function goto(i) {
    st.idx = Math.max(0, Math.min(scenario.steps.length - 1, i));
    st.phase = 'dwell';
    st.t = 0;
    paintPanel();
  }

  document.getElementById('play').onclick = function () {
    st.paused = !st.paused;
    this.textContent = st.paused ? '▶ Play' : '❚❚ Pause';
  };
  document.getElementById('back').onclick = function () { goto(st.idx - 1); };
  document.getElementById('fwd').onclick = function () { goto(st.idx + 1); };
  document.getElementById('restart').onclick = function () { goto(0); fit(); };
  document.getElementById('speed').onclick = function () {
    st.speed = st.speed === 1 ? 2 : (st.speed === 2 ? 0.5 : 1);
    this.textContent = st.speed + '×';
  };
  document.getElementById('followBtn').onclick = function () {
    st.follow = !st.follow;
    this.textContent = st.follow ? '◎ Following' : '○ Free';
    this.classList.toggle('on', st.follow);
  };

  function fit() {
    Iso.frame(flow.stops.map(function (s) { return s.grid; }), canvas);
  }
  document.getElementById('fit').onclick = function () { st.follow = false;
    document.getElementById('followBtn').textContent = '○ Free';
    document.getElementById('followBtn').classList.remove('on');
    fit();
  };

  // Pan and zoom, pointer and wheel and touch.
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    Iso.pan(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    st.follow = false;
    var b = document.getElementById('followBtn');
    b.textContent = '○ Free'; b.classList.remove('on');
  });
  canvas.addEventListener('pointerup', function () { drag = null; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    Iso.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ') { e.preventDefault(); document.getElementById('play').click(); }
    if (e.key === 'ArrowRight') goto(st.idx + 1);
    if (e.key === 'ArrowLeft') goto(st.idx - 1);
  });

  window.addEventListener('resize', function () { resize(); });

  resize();
  fit();
  Iso.lookAt(step(0).at ? stopById(step(0).at).grid.x : 0, stopById(step(0).at).grid.y);
  paintPanel();
  requestAnimationFrame(tick);
})();
