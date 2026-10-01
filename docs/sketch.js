let live = null;

async function refreshLive() {
  try {
    const res = await fetch("live.json?t=" + Date.now());   // evita la cache
    if (!res.ok) throw new Error(res.status);
    live = await res.json();
  } catch (e) {
    console.warn("live.json non disponibile", e);
  }
}

function setup() {
  const s = min(windowWidth, 900);
  createCanvas(s, s);
  colorMode(HSB, 360, 100, 100, 100);
  refreshLive();
  setInterval(refreshLive, 5 * 60 * 1000);   // ricarica ogni 5 minuti
}

function windowResized() {
  const s = min(windowWidth, 900);
  resizeCanvas(s, s);
}

// livello (cm) -> colore e raggio
const levelHue = cm => map(constrain(cm, -50, 190), -50, 190, 190, 10);
const levelRadius = cm => map(constrain(cm, -50, 190), -50, 190, 0.16, 0.38) * width;

// una forma di vetro: cerchio deformato dal rumore di Perlin
function blob(cm, surge, seed, t) {
  const wobble = map(constrain(abs(surge ?? 0), 0, 60), 0, 60, 0.08, 0.5);
  const base = levelRadius(cm);
  beginShape();
  for (let a = 0; a < TWO_PI; a += 0.06) {
    const n = noise(cos(a) + seed, sin(a) + seed, t);
    const r = base * (1 + wobble * (n - 0.5));
    vertex(r * cos(a), r * sin(a));
  }
  endShape(CLOSE);
}

function draw() {
  background(230, 40, 8);

  if (!live || !live.readings.length) {
    fill(0, 0, 90);
    textAlign(CENTER, CENTER);
    textSize(16);
    text("Carico i dati della laguna…", width / 2, height / 2);
    return;
  }

  const r = live.readings;
  const t = frameCount * 0.004;
  const cur = r[r.length - 1];

  push();
  translate(width / 2, height / 2);
  blendMode(SCREEN);                 // sovrapposizioni luminose, effetto vetro
  noFill();

  // storico: al massimo ~150 anelli, per non appesantire il browser
  const step = max(1, floor(r.length / 150));
  for (let i = 0; i < r.length - 1; i += step) {
    stroke(levelHue(r[i].cm), 70, 100, 14);
    strokeWeight(1.2);
    blob(r[i].cm, r[i].surge, i * 0.05, t);
  }

  // lettura attuale: alone + contorno netto
  for (let k = 3; k >= 1; k--) {
    stroke(levelHue(cur.cm), 60, 100, 10);
    strokeWeight(k * 5);
    blob(cur.cm, cur.surge, r.length * 0.05, t);
  }
  stroke(levelHue(cur.cm), 30, 100, 90);
  strokeWeight(2);
  blob(cur.cm, cur.surge, r.length * 0.05, t);
  pop();

  blendMode(BLEND);
  drawHud(cur);
}

function drawHud(cur) {
  const when = new Date(live.updated).toLocaleString("it-IT", {
    timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short",
  });
  noStroke();
  fill(0, 0, 95);
  textAlign(LEFT, TOP);
  textSize(14);
  text(`Punta della Salute: ${cur.cm.toFixed(0)} cm`, 16, 16);
  if (cur.surge != null) {
    text(`Sovralzo meteo: ${cur.surge > 0 ? "+" : ""}${cur.surge.toFixed(0)} cm`, 16, 36);
  }
  text(`Aggiornato: ${when}`, 16, 56);

  fill(0, 0, 70);
  textSize(11);
  textAlign(LEFT, BOTTOM);
  text("Dati: Comune di Venezia, CPSM (CC-BY). Non validati: non usare come allerta.", 16, height - 12);
}