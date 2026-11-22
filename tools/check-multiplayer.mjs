// Multiplayerserver (prototype): de servertest uitvoeren als de afhankelijkheid (ws) geïnstalleerd is.
// Zonder `npm install` in server/ wordt de test eerlijk overgeslagen (de game zelf heeft de server niet nodig).
import fs from 'fs';
import { spawnSync } from 'child_process';
const dir = new URL('../server/', import.meta.url).pathname;
if (!fs.existsSync(dir + 'node_modules/ws')) { console.log('overgeslagen: voer eerst `npm install` uit in server/'); process.exit(0); }
const r = spawnSync(process.execPath, ['test-protocol.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
process.exitCode = r.status ?? 1;
