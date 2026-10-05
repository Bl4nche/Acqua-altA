# 🌊 Acqua Alta

**Venice's tides, turned into glowing glass rings.** Live data in the outer ring, 24 years of history inside.

![Acqua Alta screenshot](docs/screenshot.png)

**Live demo → https://bl4nche.github.io/Acqua-altA/**

---

## What is this?

Venice floods ("acqua alta") whenever the tide climbs past about 110 cm. I wanted to see what that looks like when you turn the numbers into something you can look at, so I built a little generative-art piece out of the city's open tide data. The look is inspired by Murano glass: luminous strokes, overlapping colours, a bit of wobble like blown glass.

It's also a small end-to-end data project: download messy archives, clean them, build a pipeline that keeps updating itself, and ship a static site.

## How to read it

- **Outer ring = right now.** Radius and colour follow the current tide level at Punta della Salute. The ring moves more when the *meteo surge* is bigger (see below). The thin lines inside it are the last few days.
- **Inner rings = one year each**, from 2002 (centre) to 2025 (outside). January is at the top and the year runs clockwise. Every day's highest tide pushes the line outwards, and the little glowing dots are days above 110 cm.
- **Colour:** turquoise for low water, amber and red for high water.
- Hover over a ring to see the year, its highest tide and how many high-water days it had.

**Meteo surge** = measured level − astronomical tide. The astronomical tide is what the moon and sun alone would do. The difference is wind and air pressure, and it's what turns a normal tide into a flood.

## The pipeline

```
Comune di Venezia open data
   │
   ├─ archive (ZIP, 2002–2025, hourly) ──► download.py ► clean.py ► export.py ──► docs/tides.json
   │
   └─ live feed (every 5 min) ──► fetch_live.py (GitHub Action) ──► data/processed/live.csv ──► docs/live.json
                                                                                                    │
                                                                       GitHub Pages ◄── p5.js sketch ┘
```

1. **`etl/download.py`** grabs the archive ZIP into `data/raw/` (not committed, it's regenerated).
2. **`etl/clean.py`** turns 24 differently formatted yearly files into one clean hourly series.
3. **`etl/export.py`** shrinks it to one number per day (max, min, mean) plus a summary per year: about 400 KB instead of 210,000 rows, so it loads instantly.
4. **`etl/fetch_live.py`** runs on a schedule in GitHub Actions. It reads the latest measurement, compares it to the astronomical tide for the same minute, appends it to `live.csv` and rewrites `live.json`.
5. **`docs/sketch.js`** is the p5.js sketch, served by GitHub Pages.

## Cleaning the data (the unglamorous part)

The archive is 24 yearly CSVs and they don't agree with each other:

- 4 different layouts: ISO dates, `dd/mm/yyyy`, two-digit years padded with trailing spaces, and date and time split across columns.
- A mix of `;` and `,` as separators, one or two header lines, empty columns.
- Some years have several level columns. I used the 1-minute mean level, the one that's in every year.
- `saluteCG2021.csv` has 24 empty rows at the end (`;;;;`). Nothing lost, they're just dropped.
- Next to the hourly files there are also files with only the highs and lows. I ignore those on purpose.

What the script does:

- Times are in **solar time (UTC+1) all year**, with no daylight saving. I convert everything to UTC with a fixed offset so nothing shifts by an hour in summer.
- The Comune uses `-999` for "no data" and I treat anything beyond ±300 cm as impossible. In the end only 2 readings were dropped.
- Gaps are only filled when they last **3 hours or less**: a tide changes slowly enough for that, but not for longer. I'm not inventing data over bigger holes (9 hours filled out of 210,384).
- Sanity check: the highest day in the whole series comes out as **12 November 2019 at 181 cm**, which matches the famous flood (the true peak was a bit higher, but I only have hourly data). That's how I knew the units and the time conversion were right.

`data/processed/quality_by_year.csv` has a coverage report per year.

## Live updates (with caveats)

The Comune publishes the latest reading every 5 minutes, with about 3 minutes of delay. The feed only contains the *latest* value, so I collect the history myself, one reading at a time, with a scheduled GitHub Action.

Be aware:

- **"Near real-time", not real-time.** GitHub's scheduler is best-effort, so runs can be late or skipped. The page shows when it was last updated.
- Data from the Comune is **not validated** and **not an alert system**. For official warnings, go to the Centro Previsioni e Segnalazioni Maree.
- **There's a gap** between the end of the archive (31 Dec 2025) and when I started collecting live data (30 Sep 2026): no measured data for those months.
- Since 2020 the MOSE barriers have been closing the lagoon during the worst tides. My guess is that this is why the highest peaks after 2020 look lower, but that's a hypothesis, not something I've proven.

## Run it locally

```bash
git clone https://github.com/Bl4nche/Acqua-altA.git
cd Acqua-altA
py -m pip install -r requirements.txt   # Windows; use python3 / pip elsewhere

py etl/download.py      # fetch the archive
py etl/clean.py         # hourly series + quality report
py etl/export.py        # docs/tides.json
py etl/fetch_live.py    # latest live reading

cd docs
py -m http.server 8000  # then open http://localhost:8000
```

Opening `index.html` by double-clicking won't work: the browser blocks loading the JSON files that way.

## Repo layout

```
etl/        download, clean, export, fetch_live
data/       raw (ignored) and processed
docs/       the website (served by GitHub Pages)
.github/    the workflow that updates live data
```

## Data and credits

- Tide data: **Comune di Venezia, Centro Previsioni e Segnalazioni Maree (CPSM)**, via dati.venezia.it, licensed **CC-BY**. Station: Punta della Salute, Canal Grande. Levels are in cm above the Punta della Salute zero (ZMPS).
- Built with Python (pandas, requests), p5.js and GitHub Actions + Pages.
- I built this with help from an AI assistant. I wrote down every cleaning decision above because I wanted to understand and be able to defend them.

## What's next

- Turn the tide into sound (Tone.js), so a whole year can be "played" in 30 seconds.
- A year slider and PNG export.
- A notebook with the exploratory analysis.