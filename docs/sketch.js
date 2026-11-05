let live = null;      // dati live: ultimi 7 giorni + massimo di ogni giorno dell'anno in corso
let hist = null;      // anelli storici
let layer = null;     // grafica con lo storico, disegnata una volta sola
let hoverIdx = -1;

const LOW = 20, HIGH = 185, THRESHOLD = 110;
const RING_IN = 0.12, RING_OUT = 0.36;     // fascia degli anelli storici (frazione della larghezza)
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

// lato del canvas = larghezza del riquadro #viz: così il canvas non viene rimpicciolito dal CSS
// e le coordinate del mouse corrispondono a quelle del disegno
const vizSize = () => min(document.getElementById("viz").clientWidth, 900);

function setup() {
  const s = vizSize();
  createCanvas(s, s).parent("viz");
  colorMode(HSB, 360, 100, 100, 100);
  noiseSeed(7);                       // stessa forma di vetro a ogni caricamento
  refreshLive();
  loadHistory();
  setInterval(refreshLive, 5 * 60 * 1000);
}

function windowResized() {
  resizeCanvas(vizSize(), vizSize());
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
  drawMose(layer);
}

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

// ---------- etichette: i mesi attorno agli anelli ----------
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
    g.line(0.415 * width * cos(a0), 0.415 * width * sin(a0),
           0.428 * width * cos(a0), 0.428 * width * sin(a0));
    g.noStroke();
    g.fill(0, 0, 100, 55);
    g.text(MONTHS[m], 0.44 * width * cos(am), 0.44 * width * sin(am));
  }
}

// ---------- MOSE: una tacca sul giorno della prima attivazione; il resto compare con l'hover ----------
const MOSE_DAY = "2020-10-03";
let mosePts = null;     // linea "prima/dopo", disegnata solo quando si passa sugli anni con il MOSE

function moseInfo() {
  const [y, m, d] = MOSE_DAY.split("-").map(Number);
  const i = hist.rings.findIndex(r => r.info.y === y);
  if (i < 1 || i + 1 >= hist.rings.length) return null;
  const fm = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5 / hist.rings[i].n;
  return { y, m, d, i, fm };
}

const isMoseYear = idx => { const M = moseInfo(); return M != null && idx >= M.i; };

// punto a metà tra due anelli vicini, allo stesso angolo (frazione dell'anno f, da 0 a 1)
function between(idxA, idxB, f) {
  const A = hist.rings[idxA], B = hist.rings[idxB];
  const [ax, ay] = ringPoint(A, round(f * A.n) % A.n, idxA);
  const [bx, by] = ringPoint(B, round(f * B.n) % B.n, idxB);
  return [(ax + bx) / 2, (ay + by) / 2];
}

function drawMose(g) {
  const M = moseInfo();
  mosePts = null;
  if (!M) return;
  const { i, fm } = M;

  // la linea prima/dopo: tra l'anno prima e l'anno MOSE fino al giorno, poi tra l'anno MOSE e quello dopo
  mosePts = [];
  for (let f = 0; f <= fm; f += 0.002) mosePts.push(between(i - 1, i, f));
  mosePts.push(between(i - 1, i, fm), between(i, i + 1, fm));
  for (let f = fm; f <= 1.0001; f += 0.002) mosePts.push(between(i, i + 1, f));

  // la tacca: una piccola paratoia di traverso sull'anello, nel giorno della prima attivazione
  const ring = hist.rings[i];
  const [px, py] = ringPoint(ring, round(fm * ring.n) % ring.n, i);
  const a = -HALF_PI + TWO_PI * fm, len = 3.5 * scale();
  g.blendMode(BLEND);
  g.stroke(185, 30, 100, 25); g.strokeWeight(4 * scale());
  g.line(px - len * cos(a), py - len * sin(a), px + len * cos(a), py + len * sin(a));
  g.stroke(185, 15, 100, 95); g.strokeWeight(1.6 * scale());
  g.line(px - len * cos(a), py - len * sin(a), px + len * cos(a), py + len * sin(a));
}

// ---------- il presente: l'anello dell'anno in corso che si scrive un giorno alla volta ----------
function nowRing() {
  if (!hist || !live || !live.days || !live.days.length) return null;
  const y = Number(live.days[live.days.length - 1].d.slice(0, 4));
  if (hist.rings.some(r => r.info.y === y)) return null;         // l'anno è già nell'archivio
  const n = y % 4 === 0 ? 366 : 365;
  const vals = new Array(n).fill(null);
  for (const d of live.days) {
    const [yy, m, dd] = d.d.split("-").map(Number);
    if (yy !== y) continue;
    vals[Math.round((Date.UTC(yy, m - 1, dd) - Date.UTC(yy, 0, 1)) / 864e5)] = d.max;
  }
  return { y, n, vals, idx: hist.rings.length };
}

const NOW_GAP = 0.02;                       // spazio in più tra l'ultimo anno dell'archivio e quello di oggi

function nowPoint(ring, i, v) {
  const a = -HALF_PI + TWO_PI * i / ring.n;
  const r = ringRadius(ring.idx) + NOW_GAP * width + (v - 60) * 0.22 * scale();
  return [r * cos(a), r * sin(a)];
}

function drawNowRing() {
  const ring = nowRing();
  if (!ring) return;
  const days = ring.vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
  const [lastI, lastV] = days[days.length - 1];

  // la parte dell'anno ancora da scrivere: un cerchio di puntini appena visibile
  noStroke();
  fill(0, 0, 100, 35);
  for (let i = lastI + 2; i < ring.n; i += 2) {
    const [x, y] = nowPoint(ring, i, 60);
    circle(x, y, 2.2 * scale());
  }

  // la parte già scritta: come gli altri anelli, ma più luminosa
  noFill();
  for (let k = 1; k < days.length; k++) {
    const [i0, v0] = days[k - 1], [i1, v1] = days[k];
    if (i1 - i0 > 3) continue;                                   // non unisco buchi lunghi
    const [x0, y0] = nowPoint(ring, i0, v0), [x1, y1] = nowPoint(ring, i1, v1);
    stroke(hueOf(v1), 55, 100, 14); strokeWeight(7 * scale());
    line(x0, y0, x1, y1);
    stroke(hueOf(v1), 25, 100, 95); strokeWeight(2.2 * scale());
    line(x0, y0, x1, y1);
  }

  // la punta della penna: oggi, con il livello dell'ultima lettura
  const cur = live.readings[live.readings.length - 1];
  const [tx, ty] = nowPoint(ring, lastI, lastV);
  const glow = 1 + 0.25 * sin(frameCount * 0.05);
  noStroke();
  for (let g = 4; g >= 1; g--) {
    fill(hueOf(cur.cm), 60, 100, 10);
    circle(tx, ty, g * 7 * glow * scale());
  }
  fill(0, 0, 100, 95);
  circle(tx, ty, 5 * scale());

  // etichetta accanto alla punta, rivolta verso l'esterno
  blendMode(BLEND);
  fill(0, 0, 100, 90);
  textSize(max(10, 12 * scale()));
  textAlign(tx < 0 ? RIGHT : LEFT, CENTER);
  const out = 14 * scale() * (tx < 0 ? -1 : 1);
  text(`${ring.y} · oggi ${cur.cm.toFixed(0)} cm`, tx + out, ty);
  blendMode(SCREEN);
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
  if (mosePts && isMoseYear(hoverIdx)) {                        // anni con il MOSE: compare la linea prima/dopo
    drawingContext.setLineDash([4 * scale(), 4 * scale()]);
    stroke(185, 20, 100, 45);
    strokeWeight(1.2 * scale());
    beginShape(); mosePts.forEach(([x, y]) => vertex(x, y)); endShape();
    drawingContext.setLineDash([]);
  }
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
  if (live && hist) drawNowRing();
  pop();
  blendMode(BLEND);
  drawHud();
}

function drawHud() {
  const fs = width < 600 ? 11 : 14;
  noStroke();
  fill(0, 0, 95);
  textSize(fs);
  if (!live && !hist) { textAlign(CENTER, CENTER); text("Carico i dati della laguna…", width / 2, height / 2); return; }
  textAlign(LEFT, BOTTOM);
  if (hoverIdx >= 0) {
    const i = hist.rings[hoverIdx].info, [y, m, d] = i.max_day.split("-");
    const M = moseInfo();
    const mose = !isMoseYear(hoverIdx) ? "" : i.y === M.y ? ` · MOSE dal ${M.d}/${M.m}` : " · protetto dal MOSE";
    fill(0, 0, 100);
    text(`${i.y}: massimo ${i.max_cm} cm (${d}/${m}) · ${i.high_days} giorni sopra ${THRESHOLD} cm${mose}`, 16, height - 34);
  }
}

function touchStarted() { updateHover(); }