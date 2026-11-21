// Reisplanner in een eigen thread (TERRANOVA 15): reizigers (js/travelers.js) vragen hier hun plan, zodat het
// rekenen (± 8–40 ms per plan) het beeld niet ophoudt. Zelfde planner als de speler gebruikt (js/megaplan.js).
import { plan } from './megaplan.js';
self.onmessage = (e) => {
  const { id, from, to, hour } = e.data;
  let r = null;
  try { r = plan(from, to, hour); } catch (err) { r = { error: String(err && err.message || err) }; }
  self.postMessage({ id, r });
};
