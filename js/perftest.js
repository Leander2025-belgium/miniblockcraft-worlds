// Prestatietest op je eigen toestel (TERRANOVA 14.1). Dezelfde vaste scènes als de benchmark van de ontwikkeling
// (tests/browser/bench.cjs): Megatower City overdag, 's nachts, op straat, in de metro en in het station, met een
// vast grafisch profiel. Per scène: laadtijd, gemiddelde FPS, mediaan en 95e percentiel van de frametijd, langste
// frame, tekenopdrachten, driehoeken en JS-geheugen (als de browser dat geeft), plus de grafische kaart van het toestel.
// Je eigen instellingen worden vooraf bewaard en daarna teruggezet. Het resultaat kan je kopiëren en doorsturen:
// zo zijn er echte metingen op echte grafische kaarten en telefoons (de ontwikkeling meet zonder GPU).
export const PROFILE = { quality: 'normal', shadows: true, view: 160, lod: 1600, auto: false, fps: false, cycle: false, weather: 'clear', weatherSet: true };
export const SCENES = [
  { id: 'mega-dag', naam: 'Megatower overdag', hour: 13, at: [5184, 2, 4990, Math.PI, 0.18] },
  { id: 'mega-nacht', naam: 'Megatower ’s nachts', hour: 22, at: [5184, 2, 4990, Math.PI, 0.18] },
  { id: 'mega-straat', naam: 'Laan met tram', hour: 9, at: [30 * 128 + 4, 3, 4600, Math.PI, -0.05] },
  { id: 'mega-metro', naam: 'Metroperron', hour: 13, at: [5337, -17, 5116, Math.PI / 2, 0] },
  { id: 'mega-centraal', naam: 'Station Megatower Centraal', hour: 13, at: [38 * 128 + 64, 14, 47 * 128 + 30, 0, -0.1] },
];
// korte versie voor de automatische test (sessionStorage 'tn-perf-kort'): minder lang meten en wachten
const KORT = (() => { try { return sessionStorage.getItem('tn-perf-kort') === '1'; } catch { return false; } })();
const SAMPLE = KORT ? 2500 : 10000, WARM = KORT ? 500 : 2500, LOADMAX = KORT ? 20000 : 90000;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function deviceInfo(renderer) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    gpuMaker: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    webgl: gl.getParameter(gl.VERSION), browser: navigator.userAgent, cpuKernen: navigator.hardwareConcurrency || null, geheugen_GB: navigator.deviceMemory || null,
    scherm: `${screen.width}×${screen.height} @${devicePixelRatio}`, canvas: `${renderer.domElement.width}×${renderer.domElement.height}`,
  };
}
// meet de frames van de echte spellus gedurende ms milliseconden
function sample(g, ms) {
  return new Promise(done => {
    const R = g.renderer, ft = [], calls = [], tris = [];
    R.info.autoReset = false; R.info.reset();
    let last = performance.now(); const end = last + ms;
    const step = () => {
      const now = performance.now(); ft.push(now - last); last = now;
      calls.push(R.info.render.calls); tris.push(R.info.render.triangles); R.info.reset();
      if (now < end) requestAnimationFrame(step); else { R.info.autoReset = true; done({ ft: ft.slice(1), calls: calls.slice(1), tris: tris.slice(1) }); }
    };
    requestAnimationFrame(() => { last = performance.now(); requestAnimationFrame(step); });
  });
}
// TERRANOVA 16: het ritme van de browser zelf, zonder dat de game iets tekent of rekent. Geeft de browser maar 30
// beelden per seconde (bv. energiebesparingsmodus van iOS, een 30 Hz-scherm), dan kan de game nooit sneller.
function idleRhythm(g, ms) {
  return new Promise(done => {
    g.idleFrame = true; const ft = []; let last = performance.now(); const end = last + ms;
    const step = () => { const now = performance.now(); ft.push(now - last); last = now; if (now < end) requestAnimationFrame(step); else { g.idleFrame = false; done(ft.slice(2)); } };
    requestAnimationFrame(() => { last = performance.now(); requestAnimationFrame(step); });
  });
}
// verdeling van de frames over vsync-stappen: 1 = op het volle ritme van het scherm, 2 = elke tweede verversing
// (bij 60 Hz: 30 FPS), 3 = elke derde … Frames die net iets te traag zijn voor 1 stap vallen naar 2: zo ontstaan
// 'precies 30 FPS' zonder dat er ergens een grens van 30 in de code staat.
export function vsyncSteps(ft, interval) {
  const c = { 1: 0, 2: 0, 3: 0, '4+': 0 };
  for (const t of ft) { const k = Math.max(1, Math.round(t / interval)); c[k >= 4 ? '4+' : k]++; }
  for (const k in c) c[k] = +(c[k] / Math.max(1, ft.length)).toFixed(2);
  return c;
}
export function rhythmVerdict(res) {
  const r = res.ritme; if (!r) return null;
  if (r.hz < 40) return `De browser zelf geeft maar ${r.hz} beelden per seconde, ook als de game niets tekent: de grens ligt bij het toestel of de browser (bv. energiebesparingsmodus), niet bij TERRANOVA.`;
  const sc = Object.values(res.scenes).filter(s => s.vsync);
  const at2 = sc.filter(s => s.vsync[2] >= 0.5).map(s => s.naam);
  if (at2.length) return `De browser kan ${r.hz} beelden per seconde. In ${at2.join(', ')} duurt het tekenen net te lang voor één verversing, waardoor de meeste frames twee verversingen wachten (${Math.round(r.hz / 2)} FPS). Dat is geen ingebouwde grens: wat lichter tekenen (resolutie, kijkafstand, schaduwen) kan die scènes naar ${r.hz} FPS brengen.`;
  return `De browser kan ${r.hz} beelden per seconde; er is geen vaste grens van 30 FPS gemeten.`;
}
export async function runPerfTest(g, onStep) {
  const res = { versie: document.querySelector('meta[name="tn-version"]')?.content || null, datum: new Date().toISOString(), toestel: deviceInfo(g.renderer), profiel: PROFILE, scenes: {} };
  { const ft = await idleRhythm(g, KORT ? 800 : 2000), iv = pct(ft, 0.5); res.ritme = { interval_ms: +iv.toFixed(2), hz: Math.round(1000 / iv) }; }
  for (let i = 0; i < SCENES.length; i++) {
    const S = SCENES[i], r = { naam: S.naam };
    onStep?.(i, S);
    const pl = g.player, [x, dy, z, yaw, pitch] = S.at;
    if (g.drive) g.drive.exit?.(); g.seat = null;
    g.settings.hour = S.hour; g.settings.cycle = false;
    pl.fly = true; pl.pos.set(x, g.meta.ground + dy, z); pl.vel?.set?.(0, 0, 0); pl.yaw = yaw; pl.pitch = pitch;
    if (g.tiled) g.tiled.aheadKey = null; g.updateTiles(true);
    g.touch = true; g.setPaused?.(false); g.showOverlay?.(null);
    const t0 = performance.now();
    while (performance.now() - t0 < LOADMAX) { if (g.readyHere() && (!g.tiled || g.tiled.inFlight === 0) && g.queue.length < 4) break; await wait(250); }
    r.laden_ms = Math.round(performance.now() - t0);
    await wait(WARM);
    const m = await sample(g, SAMPLE), ft = m.ft, avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    r.vsync = vsyncSteps(ft, res.ritme.interval_ms);
    r.frames = ft.length; r.fps = +(1000 / avg).toFixed(1); r.mediaan_ms = +pct(ft, 0.5).toFixed(1); r.p95_ms = +pct(ft, 0.95).toFixed(1); r.max_ms = +Math.max(...ft).toFixed(1);
    r.tekenopdr = Math.round(m.calls.reduce((a, b) => a + b, 0) / m.calls.length); r.driehoeken_k = Math.round(m.tris.reduce((a, b) => a + b, 0) / m.tris.length / 1000);
    const mem = performance.memory; r.heap_MB = mem ? Math.round(mem.usedJSHeapSize / 1048576) : null;
    res.scenes[S.id] = r;
  }
  return res;
}
export function resultHtml(res) {
  const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = res.toestel;
  let h = `<p class="small"><b>Grafische kaart:</b> ${esc(t.gpu)} <span class="muted">(${esc(t.gpuMaker)})</span><br><b>Scherm:</b> ${esc(t.scherm)} · canvas ${esc(t.canvas)} · ${esc(t.cpuKernen)} kernen${t.geheugen_GB ? ` · ${t.geheugen_GB} GB` : ''}</p>`;
  h += '<div style="overflow:auto"><table class="small" style="width:100%;border-collapse:collapse"><tr><th align="left">Scène</th><th>FPS</th><th>mediaan</th><th>p95</th><th>max</th><th>tekenopdr.</th><th>driehoeken</th><th>laden</th><th title="Aandeel frames op 1, 2, 3 of meer schermverversingen">vsync 1/2/3+</th></tr>';
  for (const r of Object.values(res.scenes)) h += `<tr><td>${esc(r.naam)}</td><td align="center"><b>${r.fps}</b></td><td align="center">${r.mediaan_ms} ms</td><td align="center">${r.p95_ms} ms</td><td align="center">${r.max_ms} ms</td><td align="center">${r.tekenopdr}</td><td align="center">${r.driehoeken_k}k</td><td align="center">${(r.laden_ms / 1000).toFixed(1)} s</td><td align="center">${r.vsync ? `${Math.round(r.vsync[1] * 100)}/${Math.round(r.vsync[2] * 100)}/${Math.round((r.vsync[3] + r.vsync['4+']) * 100)} %` : '—'}</td></tr>`;
  h += '</table></div>';
  const v = rhythmVerdict(res);
  if (res.ritme) h += `<p class="small"><b>Ritme van de browser zonder tekenen:</b> ${res.ritme.hz} Hz (${res.ritme.interval_ms} ms per verversing).${v ? '<br>' + esc(v) : ''}</p>`;
  return h;
}
