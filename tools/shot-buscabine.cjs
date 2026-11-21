const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.module.js', r => r.fulfill({ body: fs.readFileSync('/home/user/miniblockcraft-worlds/node_modules/three/build/three.module.js'), contentType: 'application/javascript' }));
  await p.goto((process.env.BASE || 'http://localhost:8765/') + '#debug');
  await p.waitForTimeout(1500);
  await p.evaluate(async (type) => {
    const THREE = await import('three'); const V = await import('./js/vehicles.js');
    const M = V.buildModels(); const m = M[type];
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc7e8);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const add = (g) => { if (g) scene.add(new THREE.Mesh(g, mat)); };
    for (const k of ['paint', 'trim', 'trimIn', 'win', 'light']) { const g = m[k]; if (Array.isArray(g)) g.forEach(add); else add(g); }
    if (m.full) add(m.full);
    const c = document.createElement('canvas'); c.width = 900; c.height = 560; c.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.body.appendChild(c);
    const R = new THREE.WebGLRenderer({ canvas: c, antialias: true }); R.setSize(900, 560, false);
    const cam = new THREE.PerspectiveCamera(70, 900 / 560, 0.05, 200);
    const hz = (V.BUS_TYPES[type] ? V.BUS_TYPES[type].L : 12) / 2;
    cam.position.set(-0.52, 2.0, hz - 1.3); cam.lookAt(-0.45, 1.45, hz - 0.5);
    R.render(scene, cam); window.__keys = Object.keys(m);
  }, process.env.TYPE || 'busCity');
  console.log('keys', await p.evaluate(() => window.__keys));
  await p.screenshot({ path: process.env.OUT || '/tmp/cab.png' });
  console.log('fouten:', errs.join(' | ') || 'geen'); await b.close();
})();
