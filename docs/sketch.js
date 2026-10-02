let live = null;      // dati live (ultimi 7 giorni)
let hist = null;      // anelli storici
let layer = null;     // grafica con lo storico, disegnata una volta sola
let hoverIdx = -1;

const LOW = 20, HIGH = 185, THRESHOLD = 110;
const RING_IN = 0.10, RING_OUT = 0.34;     // fascia degli anelli storici (frazione della larghezza)
const hueOf = cm => map(constrain(cm, LOW, HIGH), LOW, HIGH, 190, 8);   // turchese -> rosso
const scale = () => width / 900;

async function loadJson(path) {
  const res = await fetch(path + "?t=" + Date.now());
  if (!res.ok) throw new Error(path + " " + res.status);
  return res.json();
}
async function refreshLive() {
  try { live = await loadJson("live.json"); } catch (e) { console.warn(e); }
}
async function loadHistory() {
  try { hist = buildRings(await loadJson("tides.json")); renderHistory(); }
  catch (e) { console.warn(e); }
}

function setup() {
  const s = min(windowWidth, 900);
  createCanvas(s, s);
  colorMode(HSB, 360, 100, 100, 100);
  noiseSeed(7);                       // stessa forma di vetro a ogni caricamento
  refreshLive();
  loadHistory();
  setInterval(refreshLive, 5 * 60 * 1000);
}

function windowResized() {
  resizeCanvas(min(windowWidth, 900), min(windowWidth, 900));
  if (hist) renderHistory();
}

// ---------- storico: un anello per anno (2002 al centro, 2025 all'esterno) ----------
function buildRings(data) {
  const byYear = {};
  for (const d of data.days) {
    const [y, m, dd] = d.d.split("-").map(Number);
    const doy = Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(y, 0, 1)) / 864e5);
    (byYear[y] ??= [])[doy] = d.max;
  }
  const rings = data.years.slice().sort((a, b) => a.y - b.y).map(info => {
    const n = info.y % 4 === 0 ? 366 : 365;
    let raw = Array.from({ length: n }, (_, i) => (byYear[info.y] || [])[i]);
    let last = raw.find(v => v != null) ?? 50;
    raw = raw.map(v => (v == null ? last : (last = v)));          // giorni mancanti: ultimo valore noto
    const vals = raw.map((v, i) => {                              // smussatura che conserva i picchi
      const p = raw[(i - 1 + n) % n], q = raw[(i + 1) % n];
      return Math.max(0.5 * v + 0.25 * (p + q), v - 12);
    });
    return { n, raw, vals, info };
  });
  return { rings };
}

const ringRadius = idx => map(idx, 0, hist.rings.length - 1, RING_IN, RING_OUT) * width;

function ringPoint(ring, i, idx) {
  const a = -HALF_PI + TWO_PI * i / ring.n;                       // gennaio in alto
  const wob = (noise(cos(a) * 1.2 + idx * 3.1, sin(a) * 1.2 + idx * 3.1) - 0.5) * 5 * scale();
  const r = ringRadius(idx) + (ring.vals[i] - 60) * 0.22 * scale() + wob;
  return [r * cos(a), r * sin(a)];
}

function renderHistory() {
  layer = createGraphics(width, height);
  layer.colorMode(HSB, 360, 100, 100, 100);
  layer.translate(width / 2, height / 2);
  layer.blendMode(SCREEN);                                        // sovrapposizioni luminose: effetto vetro
  layer.noFill();
  hist.rings.forEach((ring, idx) => {
    let prev = ringPoint(ring, 0, idx);
    for (let i = 1; i <= ring.n; i++) {
      const cur = ringPoint(ring, i % ring.n, idx);
      const h = hueOf(ring.vals[i % ring.n]);
      layer.stroke(h, 55, 100, 5);  layer.strokeWeight(5 * scale());    // alone
      layer.line(prev[0], prev[1], cur[0], cur[1]);
      layer.stroke(h, 70, 100, 32); layer.strokeWeight(1.1 * scale());  // filo
      layer.line(prev[0], prev[1], cur[0], cur[1]);
      prev = cur;
    }
    layer.noStroke();
    ring.raw.forEach((v, i) => {                                  // bolle: giorni di acqua alta
      if (v < THRESHOLD) return;
      const [x, y] = ringPoint(ring, i, idx);
      layer.fill(hueOf(v), 40, 100, 45);
      layer.circle(x, y, map(v, THRESHOLD, HIGH, 3, 9) * scale());
    });
    layer.noFill();
  });
}

// ---------- il presente: anello esterno in movimento ----------
// k = intensità del movimento (1 per l'anello attuale, meno per la scia)
function liveBlob(cm, surge, seed, t, k) {
  const base = map(constrain(cm, -50, 190), -50, 190, 0.40, 0.425) * width;
  const surgeAmt = map(constrain(abs(surge ?? 0), 0, 60), 0, 60, 0, 1);
  const amp = (0.008 + 0.014 * surgeAmt) * width * k;     // sempre visibile, più forte col meteo
  const pulse = 1 + 0.012 * sin(frameCount * 0.03);       // il respiro
  beginShape();
  for (let a = 0; a < TWO_PI; a += 0.04) {
    const n = noise(cos(a) * 1.6 + seed, sin(a) * 1.6 + seed, t) - 0.5;
    const ripple = 0.35 * sin(a * 6 + frameCount * 0.04 + seed * 10)
                 + 0.35 * sin(a * 3 - frameCount * 0.025);
    const r = min(base * pulse + amp * (2 * n + ripple), 0.468 * width);
    vertex(r * cos(a), r * sin(a));
  }
  endShape(CLOSE);
}

function drawLive() {
  const r = live.readings, t = frameCount * 0.012, cur = r[r.length - 1];
  const h = hueOf(cur.cm);
  noFill();

  // scia: letture degli ultimi giorni
  const step = max(1, floor(r.length / 90));
  for (let i = 0; i < r.length - 1; i += step) {
    stroke(hueOf(r[i].cm), 70, 100, 14);
    strokeWeight(1 * scale());
    liveBlob(r[i].cm, r[i].surge, i * 0.05, t, 0.7);
  }

  // anello attuale: corpo luminoso + alone + contorno
  fill(h, 50, 100, 4);
  noStroke();
  liveBlob(cur.cm, cur.surge, r.length * 0.05, t, 1);
  noFill();
  for (let g = 4; g >= 1; g--) {
    stroke(h, 60, 100, 9);
    strokeWeight(g * 6 * scale());
    liveBlob(cur.cm, cur.surge, r.length * 0.05, t, 1);
  }
  stroke(h, 25, 100, 95);
  strokeWeight(3 * scale());
  liveBlob(cur.cm, cur.surge, r.length * 0.05, t, 1);
}

// ---------- hover ----------
function updateHover() {
  hoverIdx = -1;
  if (!hist || mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  const d = dist(mouseX, mouseY, width / 2, height / 2);
  const idx = round(map(d, RING_IN * width, RING_OUT * width, 0, hist.rings.length - 1));
  if (idx >= 0 && idx < hist.rings.length && abs(d - ringRadius(idx)) < 0.012 * width) hoverIdx = idx;
}

function drawHover() {
  const ring = hist.rings[hoverIdx];
  stroke(0, 0, 100, 85);
  strokeWeight(1.6 * scale());
  beginShape();
  for (let i = 0; i < ring.n; i++) { const [x, y] = ringPoint(ring, i, hoverIdx); vertex(x, y); }
  endShape(CLOSE);
}

// ---------- disegno ----------
function draw() {
  background(230, 40, 8);
  updateHover();
  if (layer) image(layer, 0, 0, width, height);
  push();
  translate(width / 2, height / 2);
  blendMode(SCREEN);
  noFill();
  if (hoverIdx >= 0) drawHover();
  if (live && live.readings.length) drawLive();
  pop();
  blendMode(BLEND);
  drawHud();
}

function drawHud() {
  const fs = width < 600 ? 11 : 14;
  noStroke();
  fill(0, 0, 95);
  textSize(fs);
  textAlign(LEFT, TOP);
  if (!live && !hist) { textAlign(CENTER, CENTER); text("Carico i dati della laguna…", width / 2, height / 2); return; }
  if (live && live.readings.length) {
    const cur = live.readings[live.readings.length - 1];
    const when = new Date(live.updated).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
    text(`Adesso, Punta della Salute: ${cur.cm.toFixed(0)} cm`, 16, 16);
    if (cur.surge != null) text(`Sovralzo meteo: ${cur.surge > 0 ? "+" : ""}${cur.surge.toFixed(0)} cm`, 16, 16 + fs * 1.5);
    text(`Aggiornato: ${when}`, 16, 16 + fs * 3);
  }
  textAlign(LEFT, BOTTOM);
  if (hoverIdx >= 0) {
    const i = hist.rings[hoverIdx].info, [y, m, d] = i.max_day.split("-");
    fill(0, 0, 100);
    text(`${i.y}: massimo ${i.max_cm} cm (${d}/${m}) · ${i.high_days} giorni sopra ${THRESHOLD} cm`, 16, height - 34);
  }
  fill(0, 0, 70);
  textSize(fs - 3);
  text("Anello esterno: adesso. Dentro, un anello per anno dal 2002 (centro) al 2025; gennaio in alto.", 16, height - 22);
  text("Dati: Comune di Venezia, CPSM (CC-BY). Non validati: non usare come allerta.", 16, height - 8);
}