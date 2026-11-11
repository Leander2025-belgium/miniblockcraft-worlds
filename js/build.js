// Geavanceerd bouwen: ongedaan maken/opnieuw, selecteren (twee hoeken), vullen, muren, leegmaken,
// kopiëren, draaien, plakken en blauwdrukken bewaren.
// B = bouwmodus aan/uit. In de bouwmodus: linkerklik = hoek 1, rechterklik = hoek 2,
// Enter = vullen, M… zie BUILD_KEYS. Z/Y (of Ctrl+Z/Ctrl+Y) werken altijd.
import * as THREE from 'three';
import { cacheGet, cachePut, cacheDelete } from './storage.js';
import { BLOCKS } from './blocks.js';

const MAXVOL = 220000; // max. blokken per bewerking (vlot op telefoons)
const BP_INDEX = 'blokstad-blueprints';

export class Builder {
  constructor(game) {
    this.g = game; this.on = false;
    this.undoStack = []; this.redoStack = []; this.cur = null;
    this.a = null; this.b = null; this.clip = null;
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0xffd34d }));
    this.pasteBox = new THREE.LineSegments(box.clone(), new THREE.LineBasicMaterial({ color: 0x4dd2ff }));
    this.selBox.visible = this.pasteBox.visible = false;
    this.selBox.renderOrder = this.pasteBox.renderOrder = 5;
    game.scene.add(this.selBox, this.pasteBox);
    this.bar = document.getElementById('build-bar');
    this.bindBar();
  }
  // ---------- geschiedenis ----------
  begin() { this.cur = new Map(); }
  set(x, y, z, b) {
    const w = this.g.world, from = w.get(x, y, z);
    if (from === b) return false;
    if (!w.set(x, y, z, b)) return false;
    if (this.cur) {
      const k = x + ',' + y + ',' + z, e = this.cur.get(k);
      if (e) e[4] = b; else this.cur.set(k, [x, y, z, from, b]);
    }
    return true;
  }
  commit() {
    const c = this.cur; this.cur = null;
    const list = c ? [...c.values()].filter(e => e[3] !== e[4]) : [];
    if (!list.length) return;
    this.undoStack.push(list);
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
    this.g.dirty = true; this.g.lastEditAt = performance.now();
  }
  apply(list, useTo) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, y, z, from, to] of list) {
      this.g.world.set(x, y, z, useTo ? to : from);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    this.remesh(x0, z0, x1, z1);
    this.g.dirty = true; this.g.lastEditAt = performance.now();
  }
  undo() { const l = this.undoStack.pop(); if (!l) return this.g.toast('Niets om ongedaan te maken'); this.apply(l, false); this.redoStack.push(l); this.g.toast(`↶ Ongedaan gemaakt (${l.length} blokken)`); }
  redo() { const l = this.redoStack.pop(); if (!l) return this.g.toast('Niets om opnieuw te doen'); this.apply(l, true); this.undoStack.push(l); this.g.toast(`↷ Opnieuw (${l.length} blokken)`); }
  remesh(x0, z0, x1, z1) {
    const done = new Set();
    for (let x = Math.floor((x0 - 1) / 16) * 16; x <= x1 + 1; x += 16) for (let z = Math.floor((z0 - 1) / 16) * 16; z <= z1 + 1; z += 16) {
      const src = this.g.world.sourceAt(x, z); if (!src) continue;
      const cx = Math.floor((x - src.ox) / 16), cz = Math.floor((z - src.oz) / 16), k = src.key + ':' + cx + ',' + cz;
      if (done.has(k) || cx < 0 || cz < 0 || cx >= src.w.nc || cz >= src.w.nc) continue;
      done.add(k);
      if (src.w.recomputeTop) src.w.recomputeTop(cx, cz);
      this.g.buildChunk(src, cx, cz);
    }
  }
  // ---------- bouwmodus ----------
  toggle(on = !this.on) {
    this.on = on;
    if (this.bar) this.bar.hidden = !on;
    this.g.ui.root.classList.toggle('building', on);
    this.selBox.visible = on && !!(this.a && this.b);
    this.pasteBox.visible = false;
    this.g.toast(on ? '🏗 Bouwmodus: klik links = hoek 1, rechts = hoek 2 · Enter vullen · K muren · Del leeg · C kopiëren · V plakken · R draaien · O blauwdruk · L lijst · B stoppen' : 'Bouwmodus uit');
  }
  corner(which) {
    const t = this.g.target || this.g.raycast(); if (!t) return;
    const p = this.g.keys.has('ShiftLeft') ? [t.x + t.n[0], t.y + t.n[1], t.z + t.n[2]] : [t.x, t.y, t.z];
    if (which === 1) this.a = p; else this.b = p;
    if (!this.b) this.b = p; if (!this.a) this.a = p;
    this.showSel();
    const [s] = this.range();
    this.g.toast(`Hoek ${which} gezet · selectie ${s[0]} × ${s[1]} × ${s[2]}`);
  }
  range() {
    const a = this.a, b = this.b;
    const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    return [[hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1], lo, hi];
  }
  showSel() {
    if (!this.a || !this.b) { this.selBox.visible = false; return; }
    const [s, lo] = this.range();
    this.selBox.scale.set(s[0] + 0.04, s[1] + 0.04, s[2] + 0.04);
    this.selBox.position.set(lo[0] + s[0] / 2, lo[1] + s[1] / 2, lo[2] + s[2] / 2);
    this.selBox.visible = this.on;
  }
  need() { if (!this.a || !this.b) { this.g.toast('Kies eerst twee hoeken (klik links en rechts op blokken)'); return false; } const [s] = this.range(); if (s[0] * s[1] * s[2] > MAXVOL) { this.g.toast(`Selectie te groot (max. ${MAXVOL.toLocaleString('nl-BE')} blokken)`); return false; } return true; }
  fill(mode) {
    if (!this.need()) return;
    const [s, lo, hi] = this.range(), b = mode === 'clear' ? 0 : this.g.hotbar[this.g.slot];
    this.begin();
    let n = 0;
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      if (mode === 'walls' && x !== lo[0] && x !== hi[0] && z !== lo[2] && z !== hi[2]) continue;
      if (this.set(x, y, z, b)) n++;
    }
    this.commit();
    this.remesh(lo[0], lo[2], hi[0], hi[2]);
    this.g.toast(`${mode === 'clear' ? '🧹 Leeggemaakt' : mode === 'walls' ? '🧱 Muren gebouwd' : '🪣 Gevuld'}: ${n} blokken${mode !== 'clear' ? ' ' + BLOCKS[b].name : ''}`);
    void s;
  }
  copy() {
    if (!this.need()) return;
    const [s, lo] = this.range(), data = new Uint8Array(s[0] * s[1] * s[2]), w = this.g.world;
    let i = 0;
    for (let y = 0; y < s[1]; y++) for (let z = 0; z < s[2]; z++) for (let x = 0; x < s[0]; x++) data[i++] = w.get(lo[0] + x, lo[1] + y, lo[2] + z);
    this.clip = { sx: s[0], sy: s[1], sz: s[2], data };
    this.g.toast(`📋 Gekopieerd: ${s[0]} × ${s[1]} × ${s[2]} · V = plakken waar je kijkt`);
  }
  rotate() {
    const c = this.clip; if (!c) return this.g.toast('Eerst iets kopiëren of een blauwdruk kiezen');
    const out = new Uint8Array(c.data.length), nsx = c.sz, nsz = c.sx;
    for (let y = 0; y < c.sy; y++) for (let z = 0; z < c.sz; z++) for (let x = 0; x < c.sx; x++) {
      const nx = c.sz - 1 - z, nz = x;
      out[(y * nsz + nz) * nsx + nx] = c.data[(y * c.sz + z) * c.sx + x];
    }
    this.clip = { sx: nsx, sy: c.sy, sz: nsz, data: out };
    this.g.toast('↻ 90° gedraaid');
  }
  pasteSpot() {
    const t = this.g.target || this.g.raycast(); if (!t || !this.clip) return null;
    return [t.x + t.n[0], t.y + t.n[1], t.z + t.n[2]];
  }
  paste() {
    const c = this.clip; if (!c) return this.g.toast('Eerst iets kopiëren (C) of een blauwdruk kiezen (L)');
    const p = this.pasteSpot(); if (!p) return;
    const x0 = p[0] - Math.floor(c.sx / 2), z0 = p[2] - Math.floor(c.sz / 2), y0 = p[1];
    this.begin();
    let i = 0, n = 0;
    for (let y = 0; y < c.sy; y++) for (let z = 0; z < c.sz; z++) for (let x = 0; x < c.sx; x++) {
      const b = c.data[i++];
      if (b && this.set(x0 + x, y0 + y, z0 + z, b)) n++; // lucht in de blauwdruk laat bestaande blokken staan
    }
    this.commit();
    this.remesh(x0, z0, x0 + c.sx, z0 + c.sz);
    this.g.toast(`📌 Geplakt: ${n} blokken`);
  }
  // ---------- blauwdrukken ----------
  list() { try { return JSON.parse(localStorage.getItem(BP_INDEX) || '[]'); } catch { return []; } }
  async saveBlueprint() {
    if (!this.clip) { if (this.a && this.b) this.copy(); else return this.g.toast('Selecteer eerst een gebouw (twee hoeken)'); }
    if (document.pointerLockElement) document.exitPointerLock();
    const name = (prompt('Naam van de blauwdruk:', `Gebouw ${this.list().length + 1}`) || '').trim();
    if (!name) return;
    const c = this.clip, key = 'bp-' + Date.now();
    await cachePut(key, { sx: c.sx, sy: c.sy, sz: c.sz, data: c.data });
    const l = this.list(); l.unshift({ key, name, sx: c.sx, sy: c.sy, sz: c.sz });
    try { localStorage.setItem(BP_INDEX, JSON.stringify(l.slice(0, 60))); } catch { /* vol */ }
    this.g.toast(`💾 Blauwdruk "${name}" bewaard`);
    this.renderList();
  }
  async loadBlueprint(item) {
    const v = await cacheGet(item.key);
    if (!v) { this.g.toast('Blauwdruk niet gevonden'); return; }
    this.clip = { sx: v.sx, sy: v.sy, sz: v.sz, data: new Uint8Array(v.data) };
    this.g.toast(`📐 "${item.name}" klaar om te plakken (V of 📌)`);
    document.getElementById('bp-list')?.setAttribute('hidden', '');
  }
  async deleteBlueprint(item) {
    await cacheDelete(item.key);
    try { localStorage.setItem(BP_INDEX, JSON.stringify(this.list().filter(i => i.key !== item.key))); } catch { /* niets */ }
    this.renderList();
  }
  renderList() {
    const box = document.getElementById('bp-items'); if (!box) return;
    const l = this.list();
    box.innerHTML = l.length ? '' : '<p class="help">Nog geen blauwdrukken. Selecteer een gebouw en tik op 💾.</p>';
    for (const it of l) {
      const row = document.createElement('div'); row.className = 'bp-row';
      row.innerHTML = `<span></span><button class="btn">Plakken</button><button class="btn">✕</button>`;
      row.children[0].textContent = `${it.name} · ${it.sx}×${it.sy}×${it.sz}`;
      row.children[1].onclick = () => this.loadBlueprint(it);
      row.children[2].onclick = () => this.deleteBlueprint(it);
      box.appendChild(row);
    }
  }
  showList() {
    const el = document.getElementById('bp-list'); if (!el) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderList(); el.hidden = !el.hidden;
  }
  // ---------- invoer ----------
  key(e) {
    const c = e.code;
    if ((c === 'KeyZ' && !e.shiftKey) || (c === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey)) { this.undo(); return true; }
    if (c === 'KeyY' || (c === 'KeyZ' && e.shiftKey)) { this.redo(); return true; }
    if (c === 'KeyB') { this.toggle(); return true; }
    if (!this.on) return false;
    if (c === 'Enter' || c === 'NumpadEnter') { this.fill('fill'); return true; }
    if (c === 'KeyK') { this.fill('walls'); return true; }
    if (c === 'Delete' || c === 'Backspace') { this.fill('clear'); return true; }
    if (c === 'KeyC') { this.copy(); return true; }
    if (c === 'KeyV') { this.paste(); return true; }
    if (c === 'KeyR') { this.rotate(); return true; }
    if (c === 'KeyO') { this.saveBlueprint(); return true; }
    if (c === 'KeyL') { this.showList(); return true; }
    if (c === 'KeyX') { this.a = this.b = null; this.showSel(); this.g.toast('Selectie gewist'); return true; }
    return false;
  }
  // klik in de bouwmodus = hoeken kiezen
  click(button) { if (!this.on) return false; this.corner(button === 2 ? 2 : 1); return true; }
  update() {
    if (!this.on || !this.clip) { this.pasteBox.visible = false; return; }
    const p = this.pasteSpot(); if (!p) { this.pasteBox.visible = false; return; }
    const c = this.clip, x0 = p[0] - Math.floor(c.sx / 2), z0 = p[2] - Math.floor(c.sz / 2);
    this.pasteBox.scale.set(c.sx, c.sy, c.sz);
    this.pasteBox.position.set(x0 + c.sx / 2, p[1] + c.sy / 2, z0 + c.sz / 2);
    this.pasteBox.visible = true;
  }
  bindBar() {
    const on = (id, f) => document.getElementById(id)?.addEventListener('click', (e) => { e.stopPropagation(); f(); });
    on('bb-c1', () => this.corner(1)); on('bb-c2', () => this.corner(2));
    on('bb-fill', () => this.fill('fill')); on('bb-walls', () => this.fill('walls')); on('bb-clear', () => this.fill('clear'));
    on('bb-copy', () => this.copy()); on('bb-paste', () => this.paste()); on('bb-rot', () => this.rotate());
    on('bb-save', () => this.saveBlueprint()); on('bb-list', () => this.showList());
    on('bb-undo', () => this.undo()); on('bb-redo', () => this.redo()); on('bb-exit', () => this.toggle(false));
    on('bp-close', () => document.getElementById('bp-list')?.setAttribute('hidden', ''));
  }
}
