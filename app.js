import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CAR, SYSTEMS, PARTS } from './parts.js';
import { OPERATIONS } from './ops.js';

const V3 = (a) => new THREE.Vector3(...(a || [0, 0, 0]));
const clock = new THREE.Clock();
const now = () => clock.getElapsedTime();
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ─────────────── Сцена ───────────────
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d141c);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const OVERVIEW = { pos: V3([4.6, 2.5, 3.9]), target: V3([0.3, 0.5, 0]) };
camera.position.copy(OVERVIEW.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(OVERVIEW.target);
controls.enableDamping = true;
controls.minDistance = 0.12;
controls.maxDistance = 12;
// Телефон: один палец — двигать, два пальца — вращать и приближать щипком
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xe4eefa, 0x1a2230, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(3, 6, 3);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fc4ff, 0.7);
fill.position.set(-4, 2, -3);
scene.add(fill);
const under = new THREE.DirectionalLight(0xc8d6e6, 0.5);
under.position.set(0.5, -4, 1);
scene.add(under);
scene.add(new THREE.GridHelper(12, 48, 0x2a3a4c, 0x182330));

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

// ─────────────── Кузов (прозрачный силуэт седана) ───────────────
const body = new THREE.Group();
{
  const s = new THREE.Shape();
  s.moveTo(2.15, 0.22);
  [[2.2, 0.4], [2.19, 0.62], [2.12, 0.8], [1.05, 1.0], [0.3, 1.44], [-0.7, 1.46], [-1.5, 1.08], [-2.1, 1.02], [-2.2, 0.7], [-2.17, 0.28], [-2.1, 0.22], [-1.64, 0.22]]
    .forEach(([x, y]) => s.lineTo(x, y));
  s.absarc(-1.27, 0.31, 0.37, Math.PI, 0, true);
  s.lineTo(-0.9, 0.22);
  s.lineTo(0.93, 0.22);
  s.absarc(1.3, 0.31, 0.37, Math.PI, 0, true);
  s.lineTo(1.67, 0.22);
  s.lineTo(2.15, 0.22);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 24 });
  g.translate(0, 0, -0.81);
  body.add(new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x9fb7d0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 })));
  body.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), new THREE.LineBasicMaterial({ color: 0x6fa8e0, transparent: true, opacity: 0.4 })));
  scene.add(body);
}

// ─────────────── Построение деталей ───────────────
function mat(color, opacity = 1) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.55, transparent: opacity < 1, opacity });
  if (opacity < 1) m.depthWrite = false;
  m.userData.baseOpacity = opacity;
  m.userData.baseTransparent = opacity < 1;
  return m;
}
function orient(g, ax) {
  if (ax === 'z') g.rotateX(Math.PI / 2);
  else if (ax === 'x') g.rotateZ(Math.PI / 2);
  return g;
}
class Helix extends THREE.Curve {
  constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return out.set(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r);
  }
}
function shapeMesh(sh) {
  let g;
  switch (sh.t) {
    case 'box': g = new THREE.BoxGeometry(...sh.s); break;
    case 'cyl': g = orient(new THREE.CylinderGeometry(sh.r, sh.r, sh.h, 28), sh.ax || 'y'); break;
    case 'tube': g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sh.pts.map(V3), false, 'centripetal'), Math.max(16, sh.pts.length * 16), sh.r, 10, false); break;
    case 'helix': g = new THREE.TubeGeometry(new Helix(sh.r, sh.h, sh.turns), sh.turns * 24, sh.w, 6, false); break;
    case 'torus': g = new THREE.TorusGeometry(sh.R, sh.r, 8, 32, sh.arc); if (sh.ax === 'x') g.rotateY(Math.PI / 2); break;
    default: throw new Error('unknown shape ' + sh.t);
  }
  const m = new THREE.Mesh(g, mat(sh.c ?? 0x9aa2ab, sh.o ?? 1));
  if (sh.p) m.position.set(...sh.p);
  if (sh.rz) m.rotation.z = sh.rz;
  return m;
}
const TYPES = {
  wheel: () => [
    shapeMesh({ t: 'cyl', r: 0.31, h: 0.2, ax: 'z', c: 0x1b1e23 }),
    shapeMesh({ t: 'cyl', r: 0.2, h: 0.206, ax: 'z', c: 0xa9b1ba }),
    shapeMesh({ t: 'cyl', r: 0.07, h: 0.212, ax: 'z', c: 0x5f6770 }),
  ],
  belt: (d) => {
    const cx = d.pulleys.reduce((s, p) => s + p[0], 0) / d.pulleys.length;
    const cy = d.pulleys.reduce((s, p) => s + p[1], 0) / d.pulleys.length;
    const ps = d.pulleys.map(([x, y, r]) => ({ x, y, r, a: Math.atan2(y - cy, x - cx) })).sort((a, b) => a.a - b.a);
    const pts = [];
    for (const p of ps) for (let k = -2; k <= 2; k++) {
      const a = p.a + k * 0.42;
      pts.push(new THREE.Vector3(p.x + Math.cos(a) * (p.r + 0.006), p.y + Math.sin(a) * (p.r + 0.006), d.z));
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 300, 0.007, 8, true), mat(d.color));
    return [m];
  },
};

const parts = new Map();
const pickables = [];
for (const d of PARTS) {
  const root = new THREE.Group();
  const content = new THREE.Group();
  root.add(content);
  const pos = V3(d.pos);
  root.position.copy(pos);
  const meshes = d.type ? TYPES[d.type](d) : d.shapes.map(shapeMesh);
  for (const m of meshes) { m.userData.partId = d.id; content.add(m); pickables.push(m); }
  if (d.parent) {
    const par = parts.get(d.parent);
    root.position.sub(par.pos);
    par.content.add(root);
  } else scene.add(root);
  const div = document.createElement('div');
  div.className = 'label';
  const label = new CSS2DObject(div);
  label.center.set(0.5, 1.15);
  label.visible = false;
  scene.add(label);
  parts.set(d.id, { def: d, root, content, pos, meshes, base: root.position.clone(), state: { off: V3(), op: 1 }, label, labelDiv: div, showLabel: false });
}
scene.updateMatrixWorld(true);
for (const p of parts.values()) {
  const b = new THREE.Box3();
  p.meshes.forEach((m) => b.expandByObject(m));
  p.box = b; // габариты в исходном положении
  const c = b.getCenter(V3());
  p.labelLocal = p.root.worldToLocal(new THREE.Vector3(c.x, b.max.y + 0.012, c.z));
}

// Какие операции меняют деталь
const opsFor = new Map();
for (const o of OPERATIONS) for (const t of o.target) {
  if (!opsFor.has(t)) opsFor.set(t, []);
  opsFor.get(t).push(o);
}
// Детали с одинаковым названием (4 катушки, 4 гайки...) — для подсказок считаем одной
function relatedOps(id) {
  const name = parts.get(id).def.name;
  const set = new Set();
  for (const [t, list] of opsFor) if (t === id || parts.get(t).def.name === name) list.forEach((o) => set.add(o));
  for (const o of OPERATIONS) if (o.steps.some((s) => (s.actions || []).some((a) => a.id === id))) set.add(o);
  return [...set];
}

// ─────────────── Состояния деталей и анимация ───────────────
let showRemoved = false;
const tweens = new Map();

function applyState(p) {
  const { off } = p.state;
  const op = p.state.op * (p.ghost ? 0.18 : 1);
  p.root.position.copy(p.base).add(off);
  for (const m of p.meshes) {
    const mt = m.material;
    mt.opacity = mt.userData.baseOpacity * op;
    const tr = op < 0.999 || mt.userData.baseTransparent;
    if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; }
    mt.depthWrite = op >= 0.999 && !mt.userData.baseTransparent;
  }
  p.root.visible = p.state.op > 0.01;
}

// Детали, закрывающие обзор на текущем шаге, делаем полупрозрачными
let focusIds = [];
const occRay = new THREE.Raycaster();
function updateOccluders() {
  const keep = new Set(focusIds);
  for (const [id, h] of hl) if (h.kind !== 'target') keep.add(id);
  const next = new Set();
  if (curOp && focusIds.length) {
    for (const id of focusIds) {
      const p = parts.get(id);
      if (!p || p.state.op < 0.05) continue;
      const b = new THREE.Box3();
      p.meshes.forEach((m) => b.expandByObject(m));
      const c = b.getCenter(V3()), sz = b.getSize(V3()).multiplyScalar(0.3);
      const pts = [c, c.clone().add(V3([sz.x, sz.y, 0])), c.clone().add(V3([-sz.x, -sz.y, 0])), c.clone().add(V3([0, sz.y, sz.z])), c.clone().add(V3([0, -sz.y, -sz.z]))];
      for (const pt of pts) {
        const dir = pt.clone().sub(camera.position);
        const dist = dir.length();
        occRay.set(camera.position, dir.normalize());
        occRay.far = dist - 0.005;
        for (const h of occRay.intersectObjects(pickables, false)) {
          const pid = h.object.userData.partId;
          if (!keep.has(pid) && isShown(h.object)) next.add(pid);
        }
      }
    }
  }
  for (const p of parts.values()) {
    const g = next.has(p.def.id);
    if (!!p.ghost !== g) { p.ghost = g; applyState(p); }
  }
}
function setState(p, st) {
  p.state.off.copy(st.off); p.state.op = st.op;
  tweens.delete(p.def.id);
  applyState(p);
}
function tweenTo(p, to, delay, dur) {
  tweens.set(p.def.id, { p, from: { off: p.state.off.clone(), op: p.state.op }, to, t0: now() + delay, dur });
}
function targetState(p, action, xray) {
  const d = p.def;
  let st;
  if (!action || action.mode === 'install') st = { off: V3(), op: 1 };
  else {
    const ro = V3(d.removeOffset || [0, 0.15, 0]);
    if (action.mode === 'loosen') {
      const off = action.offset ? V3(action.offset) : d.loosenOffset ? V3(d.loosenOffset) : ro;
      st = { off, op: 1 };
    } else st = { off: ro, op: showRemoved ? 0.14 : 0 };
  }
  if (xray && st.op > 0.3) st.op = 0.28;
  return st;
}

// ─────────────── Подсветка и подписи ───────────────
const HL_COLOR = { action: 0xff8a1f, info: 0x33b5ff, target: 0x2ee37a, pick: 0xffffff };
let hl = new Map();
let picked = null;
let hovered = null;

function setEmissive(p, hex, k) {
  for (const m of p.meshes) { m.material.emissive.setHex(hex); m.material.emissiveIntensity = k; }
}
function clearEmissive() { for (const p of parts.values()) setEmissive(p, 0, 0); }
function setHighlights(map, labelTargets) {
  clearEmissive();
  hl = map;
  for (const p of parts.values()) p.showLabel = false;
  for (const [id, h] of hl) {
    const p = parts.get(id);
    if (p.def.label === false) continue;
    if (h.kind === 'target' && !labelTargets) continue;
    const tool = h.kind === 'action' ? h.tool || p.def.tool : null;
    p.labelDiv.className = `label ${h.kind}`;
    p.labelDiv.innerHTML = `<b>${esc(p.def.name)}</b>${tool ? `<span>${esc(tool)}</span>` : ''}`;
    p.showLabel = true;
  }
}

// ─────────────── Камера ───────────────
let camTween = null;
const DIRS = {
  top: [0.55, 1.6, 0.2], front: [1.6, 0.7, 0.15], front_low: [1.5, 0.15, 0.25], right: [0.45, 1.0, 1.4], left: [0.4, 0.75, -1.5],
  fr: [1.2, 1.0, 1.0], fl: [1.2, 1.0, -1.0], below: [1.3, -0.75, 0.45], below_right: [0.6, -0.9, 1.2],
  rear_left: [-1.1, 0.55, -1.0], left_top: [0.6, 1.2, -1.0], lamp: [-1.2, 1.0, -0.35],
};
function flyToPose(pos, target, dur = 1.1) {
  camTween = { fp: camera.position.clone(), ft: controls.target.clone(), tp: pos.clone(), tt: target.clone(), t0: now(), dur };
}
function frameIds(ids, dirName) {
  const b = new THREE.Box3();
  for (const id of ids) { const p = parts.get(id); if (p) b.union(p.box); }
  if (b.isEmpty()) return flyToPose(OVERVIEW.pos, OVERVIEW.target);
  const c = b.getCenter(V3());
  const r = Math.max(b.getSize(V3()).length() / 2, 0.06);
  const fov = (camera.fov * Math.PI) / 180;
  const fit = r / Math.sin(Math.min(fov, fov * camera.aspect) / 2);
  const dist = THREE.MathUtils.clamp(fit * 1.3 + 0.45, 0.8, 4.5);
  const dir = V3(DIRS[dirName] || DIRS.fr).normalize();
  flyToPose(c.clone().addScaledVector(dir, dist), c);
}
controls.addEventListener('start', () => { camTween = null; });
controls.addEventListener('end', () => updateOccluders());

// ─────────────── Операции и шаги ───────────────
let curOp = null;
let curStep = -1;
let auto = null;

function modesBefore(op, upto) {
  const m = new Map();
  for (let i = 0; i < upto; i++) {
    const s = op.steps[i];
    if (s.restoreAll) m.clear();
    for (const a of s.actions || []) a.mode === 'install' ? m.delete(a.id) : m.set(a.id, a);
  }
  return m;
}
function resetAll() { for (const p of parts.values()) setState(p, targetState(p, null, false)); }

function selectOp(id) {
  stopAuto();
  curOp = OPERATIONS.find((o) => o.id === id);
  resetAll();
  curStep = -1;
  pick(null, false);
  goStep(0);
  if (window.matchMedia('(max-width: 820px)').matches) viewport.scrollIntoView({ behavior: 'smooth' });
}
function exitOp() {
  stopAuto();
  curOp = null;
  curStep = -1;
  focusIds = [];
  resetAll();
  updateOccluders();
  setHighlights(new Map());
  flyToPose(OVERVIEW.pos, OVERVIEW.target);
  renderPanel();
}

function goStep(i) {
  const op = curOp;
  i = Math.max(0, Math.min(op.steps.length - 1, i));
  const forward = i === curStep + 1;
  curStep = i;
  const s = op.steps[i];
  const prev = modesBefore(op, i);
  const cur = new Map((s.actions || []).map((a) => [a.id, a]));
  const xr = new Set(s.xray || []);

  for (const p of parts.values()) {
    const id = p.def.id;
    const pre = targetState(p, prev.get(id), false);
    if (s.restoreAll) {
      if (!forward) setState(p, pre);
      tweenTo(p, targetState(p, null, xr.has(id)), 0.6, 1.2);
    } else if (cur.has(id)) {
      if (!forward) setState(p, pre);
      const a = cur.get(id);
      tweenTo(p, targetState(p, a, xr.has(id)), 0.9 + (a.delay || 0), 1.0);
    } else {
      tweenTo(p, targetState(p, prev.get(id), xr.has(id)), 0, 0.4);
    }
  }

  const map = new Map();
  for (const t of op.target) map.set(t, { kind: 'target' });
  for (const id of s.highlight || []) map.set(id, { kind: 'info' });
  for (const a of s.actions || []) map.set(a.id, { kind: 'action', tool: a.tool });
  setHighlights(map, !s.actions?.length);

  const focus = s.focus || [...(s.actions || []).map((a) => a.id), ...(s.highlight || [])];
  focusIds = focus.length ? focus : op.target;
  frameIds(focusIds, s.dir || op.dir);
  renderPanel();
}

function replay() { if (curOp) { const i = curStep; curStep = -99; goStep(i); } }
function stopAuto() { if (auto) { clearInterval(auto); auto = null; } }
function toggleAuto() {
  if (auto) { stopAuto(); renderPanel(); return; }
  if (curStep >= curOp.steps.length - 1) { curStep = -99; goStep(0); }
  auto = setInterval(() => {
    if (curStep < curOp.steps.length - 1) goStep(curStep + 1);
    else { stopAuto(); renderPanel(); }
  }, 4500);
  renderPanel();
}

// ─────────────── Наведение и клик по детали ───────────────
const raycaster = new THREE.Raycaster();
const tip = $('#tip');
function isShown(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function hitPart(e) {
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  for (const h of raycaster.intersectObjects(pickables, false)) {
    const p = parts.get(h.object.userData.partId);
    if (isShown(h.object) && p.state.op > 0.3 && !p.ghost) return p;
  }
  return null;
}
let down = null, moveQueued = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const p = hitPart(e);
  pick(p ? p.def.id : null, false);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  moveQueued = e;
});
renderer.domElement.addEventListener('pointerleave', () => { hovered = null; tip.hidden = true; });
function updateHover() {
  if (!moveQueued) return;
  const e = moveQueued; moveQueued = null;
  if (e.buttons) { tip.hidden = true; return; }
  const p = hitPart(e);
  hovered = p ? p.def.id : null;
  renderer.domElement.style.cursor = p ? 'pointer' : '';
  if (!p) { tip.hidden = true; return; }
  const d = p.def;
  const r = viewport.getBoundingClientRect();
  tip.innerHTML = `<b>${esc(d.name)}</b><span>${esc(d.sys || '')}</span>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}<em>Клик — подробнее</em>`;
  tip.hidden = false;
  const x = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8);
  const y = Math.min(e.clientY - r.top + 14, r.height - tip.offsetHeight - 8);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}

function pick(id, fly) {
  picked = id;
  if (!id) clearEmissiveExceptHl();
  if (id && fly) frameIds([id], 'fr');
  renderPicked();
}
function clearEmissiveExceptHl() { for (const p of parts.values()) if (!hl.has(p.def.id)) setEmissive(p, 0, 0); }

// ─────────────── Панель ───────────────
let tab = 'ops';
let search = '';

function renderOps() {
  const groups = [...new Set(OPERATIONS.map((o) => o.group))];
  return groups.map((g) => `
    <div class="group-title">${esc(g)}</div>
    ${OPERATIONS.filter((o) => o.group === g).map((o) => `
      <button class="op ${curOp?.id === o.id ? 'active' : ''}" data-op="${o.id}">
        <span class="op-name">${esc(o.name)}</span>
        <span class="op-meta">${o.steps.length} шагов · ${esc(o.difficulty)} · ${esc(o.time)}</span>
      </button>`).join('')}`).join('');
}

function renderCatalog() {
  const q = search.trim().toLowerCase();
  const seen = new Set();
  const list = [...parts.values()].filter((p) => {
    const d = p.def;
    if (d.minor && !opsFor.has(d.id)) return false;
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return !q || d.name.toLowerCase().includes(q) || (d.sys || '').toLowerCase().includes(q) || (d.desc || '').toLowerCase().includes(q);
  });
  if (!list.length) return '<p class="hint">Ничего не найдено.</p>';
  return SYSTEMS.map((sys) => {
    const items = list.filter((p) => p.def.sys === sys);
    if (!items.length) return '';
    return `<div class="group-title">${esc(sys)}</div>${items.map((p) => `
      <button class="part-row ${picked === p.def.id ? 'active' : ''}" data-part="${p.def.id}">
        <span>${esc(p.def.name)}</span>${opsFor.has(p.def.id) ? '<i title="Есть инструкция замены">🔧</i>' : ''}
      </button>`).join('')}`;
  }).join('');
}

function renderStep() {
  const op = curOp, s = op.steps[curStep];
  const tools = [...new Set((s.actions || []).filter((a) => a.mode !== 'install').map((a) => a.tool || parts.get(a.id).def.tool).filter(Boolean))];
  return `
    <div class="step-head">
      <button id="b-exit" class="ghost-btn" title="К списку">← Все операции</button>
    </div>
    <div class="op-title-big">${esc(op.name)}</div>
    <div class="step-head"><span class="badge">Шаг ${curStep + 1} из ${op.steps.length}</span><span class="muted">${esc(op.difficulty)} · ${esc(op.time)}</span></div>
    <div class="progress"><i style="width:${((curStep + 1) / op.steps.length) * 100}%"></i></div>
    <h3>${esc(s.title)}</h3>
    <p>${esc(s.text)}</p>
    ${tools.length ? `<div class="chips">${tools.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
    <div class="nav">
      <button id="b-prev" ${curStep === 0 ? 'disabled' : ''}>◀ Назад</button>
      <button id="b-replay" title="Повторить анимацию">↻</button>
      <button id="b-auto">${auto ? '■ Стоп' : '▶ Авто'}</button>
      <button id="b-next" class="primary" ${curStep === op.steps.length - 1 ? 'disabled' : ''}>Далее ▶</button>
    </div>
    <ol class="steps">${op.steps.map((x, i) => `<li data-i="${i}" class="${i === curStep ? 'cur' : i < curStep ? 'done' : ''}">${esc(x.title)}</li>`).join('')}</ol>
    <div class="meta">
      <div><b>Инструмент:</b> ${esc(op.tools.join(', '))}</div>
      ${op.note ? `<div class="status">${esc(op.note)}</div>` : ''}
      <div class="status">Механиком не проверено. Моменты затяжки сверяйте с заводским мануалом.</div>
      ${op.sources.length ? `<div><b>Источник:</b> ${op.sources.map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>`).join(' · ')}</div>` : '<div>Источник: общий порядок работ, без ссылки на руководство.</div>'}
    </div>`;
}

function renderPanel() {
  const el = $('#content');
  if (curOp) {
    el.innerHTML = renderStep();
    $('#b-exit').onclick = exitOp;
    $('#b-prev').onclick = () => { stopAuto(); goStep(curStep - 1); };
    $('#b-next').onclick = () => { stopAuto(); goStep(curStep + 1); };
    $('#b-replay').onclick = replay;
    $('#b-auto').onclick = toggleAuto;
    el.querySelectorAll('.steps li').forEach((li) => (li.onclick = () => { stopAuto(); goStep(+li.dataset.i); }));
  } else {
    el.innerHTML = `
      <div class="tabs">
        <button class="${tab === 'ops' ? 'on' : ''}" data-tab="ops">Замена деталей (${OPERATIONS.length})</button>
        <button class="${tab === 'parts' ? 'on' : ''}" data-tab="parts">Все детали</button>
      </div>
      ${tab === 'ops' ? `<div class="list">${renderOps()}</div>` : `
        <input id="search" type="search" placeholder="Поиск: генератор, колодки, термостат…" value="${esc(search)}" />
        <div class="list" id="catalog">${renderCatalog()}</div>`}`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; renderPanel(); }));
    const inp = $('#search');
    if (inp) inp.oninput = () => { search = inp.value; $('#catalog').innerHTML = renderCatalog(); bindLists(); };
  }
  bindLists();
}
function bindLists() {
  document.querySelectorAll('[data-op]').forEach((b) => (b.onclick = () => selectOp(b.dataset.op)));
  document.querySelectorAll('[data-part]').forEach((b) => (b.onclick = () => pick(b.dataset.part, true)));
}

function renderPicked() {
  const el = $('#picked');
  if (!picked) { el.innerHTML = ''; el.hidden = true; if (!curOp && tab === 'parts') renderPanel(); return; }
  const d = parts.get(picked).def;
  const ops = relatedOps(picked);
  el.hidden = false;
  el.innerHTML = `
    <button class="x" id="b-unpick" title="Закрыть">×</button>
    <div class="picked-sys">${esc(d.sys || '')}</div>
    <div class="picked-title">${esc(d.name)}</div>
    ${d.desc ? `<p>${esc(d.desc)}</p>` : ''}
    ${d.where ? `<p class="muted">${esc(d.where)}</p>` : ''}
    ${d.tool ? `<div class="chips"><span class="chip">${esc(d.tool)}</span></div>` : ''}
    ${d.faults?.length ? `<div class="faults"><b>Признаки неисправности</b><ul>${d.faults.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    ${ops.length ? `<div class="picked-ops">${ops.map((o) => `<button class="primary" data-op="${o.id}">Как заменить: ${esc(o.name)}</button>`).join('')}</div>` : '<div class="muted">Инструкции замены для этой детали пока нет.</div>'}
    <button id="b-showpart" class="ghost-btn">Показать на модели</button>`;
  $('#b-unpick').onclick = () => pick(null, false);
  $('#b-showpart').onclick = () => frameIds([picked], 'fr');
  el.querySelectorAll('[data-op]').forEach((b) => (b.onclick = () => selectOp(b.dataset.op)));
  if (!curOp && tab === 'parts') { $('#catalog') && ($('#catalog').innerHTML = renderCatalog()); bindLists(); }
}

$('#car-title').textContent = `${CAR.make} ${CAR.model} ${CAR.generation} · ${CAR.engine}`;
$('#b-overview').onclick = () => { if (curOp) { const s = curOp.steps[curStep]; const f = s.focus || [...(s.actions || []).map((a) => a.id), ...(s.highlight || [])]; frameIds(f.length ? f : curOp.target, s.dir || curOp.dir); } };
$('#b-home').onclick = () => flyToPose(OVERVIEW.pos, OVERVIEW.target);
$('#b-body').onclick = (e) => { body.visible = !body.visible; e.currentTarget.classList.toggle('off', !body.visible); };
$('#b-ghost').onclick = (e) => {
  showRemoved = !showRemoved;
  e.currentTarget.classList.toggle('off', !showRemoved);
  if (curOp) replay();
};
window.addEventListener('keydown', (e) => {
  if (!curOp || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight') { stopAuto(); goStep(curStep + 1); }
  if (e.key === 'ArrowLeft') { stopAuto(); goStep(curStep - 1); }
  if (e.key === 'Escape') exitOp();
});
renderPanel();

// ─────────────── Цикл отрисовки ───────────────
renderer.setAnimationLoop(() => {
  const t = now();
  for (const [id, tw] of tweens) {
    if (t < tw.t0) continue;
    const k = Math.min(1, (t - tw.t0) / tw.dur), e = ease(k);
    tw.p.state.off.lerpVectors(tw.from.off, tw.to.off, e);
    tw.p.state.op = tw.from.op + (tw.to.op - tw.from.op) * e;
    applyState(tw.p);
    if (k >= 1) tweens.delete(id);
  }
  if (camTween) {
    const k = Math.min(1, (t - camTween.t0) / camTween.dur), e = ease(k);
    camera.position.lerpVectors(camTween.fp, camTween.tp, e);
    controls.target.lerpVectors(camTween.ft, camTween.tt, e);
    if (k >= 1) { camTween = null; updateOccluders(); }
  }
  controls.update();
  updateHover();
  for (const [id, h] of hl) {
    const k = h.kind === 'action' ? 0.55 + 0.45 * Math.sin(t * 6) : h.kind === 'info' ? 0.45 + 0.25 * Math.sin(t * 3.5) : 0.35 + 0.15 * Math.sin(t * 2);
    setEmissive(parts.get(id), HL_COLOR[h.kind], k);
  }
  for (const p of parts.values()) if (!hl.has(p.def.id) && p.def.id !== picked && p.def.id !== hovered && p.meshes[0].material.emissiveIntensity) setEmissive(p, 0, 0);
  if (hovered && hovered !== picked && !hl.has(hovered)) setEmissive(parts.get(hovered), HL_COLOR.pick, 0.18);
  if (picked) setEmissive(parts.get(picked), HL_COLOR.pick, 0.3 + 0.15 * Math.sin(t * 5));
  for (const p of parts.values()) {
    if (!p.showLabel) { p.label.visible = false; continue; }
    p.label.position.copy(p.root.localToWorld(p.labelLocal.clone()));
    p.label.visible = p.state.op > 0.3 && isShown(p.root);
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

window.__app = { parts, goStep, selectOp, exitOp, OPERATIONS, camera, controls }; // для отладки
