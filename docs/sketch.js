let live = null;      // dati live (ultimi 7 giorni)
let hist = null;      // anelli storici
let layer = null;     // grafica con lo storico, disegnata una volta sola
let hoverIdx = -1;

const LOW = 20, HIGH = 185, THRESHOLD = 110;
const RING_IN = 0.10, RING_OUT = 0.30;     // fascia degli anelli storici (frazione della larghezza)
const TRAIL_COUNT = 18;                    // quante linee nella scia del live
const TRAIL_GAP = 0.012;                   // distanza tra anello attuale e prima linea della scia
const TRAIL_SPREAD = 0.04;                 // quanto si apre la scia verso l'interno
const hueOf = cm => map(constrain(cm, LOW, HIGH), LOW, HIGH, 190, 8);   // turchese -> rosso
const scale = () => width / 900;

async function loadJson(path) {
  const res = await fetch(path + "?t=" + Date.now());
  if (!res.ok) throw new Error(path + " " + res.status);
  return res.json();
}
async function refreshLive() {
  try { live = await loadJson("live.json"); updateLiveBox(); } catch (e) { console.warn(e); }
}
async function loadHistory() {
  try { hist = buildRings(await loadJson("tides.json")); renderHistory(); }
  catch (e) { console.warn(e); }
}

function tideClass(cm) {
  if (cm >= 140) return "marea eccezionale";
  if (cm >= 110) return "marea molto sostenuta";
  if (cm >= 80) return "marea sostenuta";
  return "marea normale";
}

function updateLiveBox() {
  if (!live || !live.readings.length) return;
  const cur = live.readings[live.readings.length - 1];
  const when = new Date(live.updated).toLocaleString("it-IT",
    { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
  const surge = cur.surge == null ? ""
    : `sovralzo meteo ${cur.surge > 0 ? "+" : ""}${cur.surge.toFixed(0)} cm · `;
  select("#live-cm").html(`${cur.cm.toFixed(0)} cm`);
  select("#live-class").html(tideClass(cur.cm))
    .style("color", color(hueOf(cur.cm), 60, 100).toString());
  select("#live-meta").html(`${surge}aggiornato ${when}`);
}

function setup() {
  const s = min(windowWidth -32, 900);
  createCanvas(s, s).parent("viz");
  colorMode(HSB, 360, 100, 100, 100);
  noiseSeed(7);                       // stessa forma di vetro a ogni caricamento
  refreshLive();
  loadHistory();
  setInterval(refreshLive, 5 * 60 * 1000);
}

function windowResized() {
  resizeCanvas(min(windowWidth -32, 900), min(windowWidth -32, 900));
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
  drawLabels(layer);
}

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

// ---------- etichette: mesi, primo e ultimo anno, la marea più alta ----------
function drawLabels(g) {
  g.blendMode(BLEND);
  g.textFont("Inter");
  g.textSize(max(9, 11 * scale()));
  g.textAlign(CENTER, CENTER);

  // mesi attorno agli anelli: una tacca all'inizio del mese, la lettera a metà
  for (let m = 0; m < 12; m++) {
    const a0 = -HALF_PI + TWO_PI * m / 12;
    const am = a0 + PI / 12;
    g.stroke(0, 0, 100, 25);
    g.strokeWeight(1);
    g.line(0.335 * width * cos(a0), 0.335 * width * sin(a0),
           0.348 * width * cos(a0), 0.348 * width * sin(a0));
    g.noStroke();
    g.fill(0, 0, 100, 55);
    g.text(MONTHS[m], 0.355 * width * cos(am), 0.355 * width * sin(am));
  }

  // primo anno al centro, ultimo sopra l'anello esterno
  const last = hist.rings.length - 1;
  g.fill(0, 0, 100, 70);
  g.text(hist.rings[0].info.y, 0, 0);
  g.text(hist.rings[last].info.y, 0, -0.322 * width);

  // annotazione: il giorno più alto del 2019, con una linea verso l'angolo più vicino
  const idx = hist.rings.findIndex(r => r.info.y === 2019);
  if (idx < 0) return;
  const ring = hist.rings[idx], info = ring.info;
  const [y, m, d] = info.max_day.split("-").map(Number);
  const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5);
  const [px, py] = ringPoint(ring, doy, idx);
  const tx = (px < 0 ? -1 : 1) * 0.47 * width;
  const ty = (py < 0 ? -1 : 1) * 0.45 * height;
  g.stroke(0, 0, 100, 50);
  g.strokeWeight(1);
  g.line(px, py, tx, ty);
  g.noStroke();
  g.fill(0, 0, 100, 90);
  g.textAlign(px < 0 ? LEFT : RIGHT, py < 0 ? BOTTOM : TOP);
  g.text(`La marea più alta dal 2002\n${d}/${m}/${y} · ${info.max_cm} cm`, tx, ty);
}

// ---------- il presente: anello esterno in movimento ----------
// k = intensità del movimento, offset = spostamento verso l'interno (frazione della larghezza)
function liveBlob(cm, surge, seed, t, k, offset = 0) {
  const base = map(constrain(cm, -50, 190), -50, 190, 0.40, 0.425) * width;
  const surgeAmt = map(constrain(abs(surge ?? 0), 0, 60), 0, 60, 0, 1);
  const amp = (0.008 + 0.014 * surgeAmt) * width * k;     // sempre visibile, più forte col meteo
  const pulse = 1 + 0.012 * sin(frameCount * 0.03);       // il respiro
  beginShape();
  for (let a = 0; a < TWO_PI; a += 0.04) {
    const n = noise(cos(a) * 1.6 + seed, sin(a) * 1.6 + seed, t) - 0.5;
    const ripple = 0.35 * sin(a * 6 + frameCount * 0.04 + seed * 10)
                 + 0.35 * sin(a * 3 - frameCount * 0.025);
    const r = min(base * pulse + amp * (2 * n + ripple), 0.468 * width) - offset * width;
    vertex(r * cos(a), r * sin(a));
  }
  endShape(CLOSE);
}

function drawLive() {
  const r = live.readings, t = frameCount * 0.012, cur = r[r.length - 1];
  const h = hueOf(cur.cm);
  noFill();

  // scia: letture degli ultimi giorni, distribuite verso l'interno
  const N = min(TRAIL_COUNT, r.length - 1);
  for (let j = 0; j < N; j++) {
    const pos = (j + 1) / (N + 1);                         // 0 = più vecchia, 1 = più recente
    const i = round(pos * (r.length - 1));
    const offset = TRAIL_GAP + TRAIL_SPREAD * (1 - pos);
    stroke(hueOf(r[i].cm), 70, 100, 22);
    strokeWeight(1.2 * scale());
    liveBlob(r[i].cm, r[i].surge, i * 0.05, t, 0.7, offset);
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
  textAlign(LEFT, BOTTOM);
  if (hoverIdx >= 0) {
    const i = hist.rings[hoverIdx].info, [y, m, d] = i.max_day.split("-");
    fill(0, 0, 100);
    text(`${i.y}: massimo ${i.max_cm} cm (${d}/${m}) · ${i.high_days} giorni sopra ${THRESHOLD} cm`, 16, height - 34);
  }
  fill(0, 0, 70);
  }

function touchStarted() { updateHover(); }