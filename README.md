# 🌊 Acqua Alta

**Venice's tides, turned into glowing glass rings.** One ring per year from 2002 to 2025, plus the current year being written day by day.

**Live demo → https://bl4nche.github.io/Acqua-altA/**

## How to read it

- **Each ring is a year:** 2002 in the centre, 2025 outside. January is at the top and the year runs clockwise.
- **The further the line goes out, the higher the water.** Colour goes from turquoise (low) to amber and red (high).
- **Dots** are days above 110 cm, when Venice floods.
- **The outermost bright ring is the current year**, written one day at a time. The glowing point is today.
- Hover or tap a ring to see that year's highest tide and its number of high-water days.

## The pipeline

```
Comune di Venezia open data
   ├─ yearly archive (2002–2025) ─► download.py ► clean.py ► export.py ─► docs/tides.json
   └─ live feed ─► fetch_live.py (GitHub Action) ─► data/processed/live.csv ─► docs/live.json
                                                          GitHub Pages + p5.js ◄─┘
```

- **`clean.py`** merges 24 yearly CSVs with four different layouts into one hourly series. It converts solar time (UTC+1) to UTC, drops `-999` and impossible values, and fills only gaps of 3 hours or less.
- **`export.py`** reduces about 210,000 hourly rows to one max/min/mean per day (about 400 KB).
- **`fetch_live.py`** runs in GitHub Actions. It stores the latest reading together with the astronomical tide and the meteo surge, and exports the last 7 days plus the daily maxima of the current year.
- **Sanity check:** the highest day in the series is 12 November 2019 at 181 cm (hourly data), which matches the historic flood.

## Caveats

- **Not real-time:** GitHub runs the scheduled job only 3–4 times a day, so daily maxima for the current year can be lower than the true peak.
- **Data gap:** there is no measured data between the end of the archive (31 Dec 2025) and the start of live collection (30 Sep 2026). The gap will close when the Comune publishes the 2026 archive.
- **Not for warnings:** the data is not validated. For official forecasts, see the Centro Previsioni e Segnalazioni Maree.

## What about MOSE?

MOSE is the system of mobile barriers at the three inlets of the lagoon. When a high tide is forecast, they rise and close Venice off from the sea.

- **First used on 3 October 2020.** In the first seasons the barriers were raised for forecasts of about 130 cm. The threshold then went down to 120 cm, and **from the 2024–25 season it is 110 cm**.
- **What this means for the data:** Punta della Salute is *inside* the lagoon. When MOSE is up, the station measures the protected water level, not the tide outside. Since late 2020 the rings therefore show what the city actually experienced, not what the sea alone would have done.
- **So fewer high-water days after 2020 do not mean calmer seas.** The barriers are the most likely reason, but I haven't proven it. Checking it would need the dates of each closure, or a station outside the lagoon to compare with.

## Run it locally

```bash
py -m pip install -r requirements.txt
py etl/download.py && py etl/clean.py && py etl/export.py
cd docs && py -m http.server 8000      # open http://localhost:8000
```

The Comune's live feed may answer with an anti-bot page instead of data when you run `fetch_live.py` from your own computer (it does from mine), so I run it from GitHub. To get fresh live data, go to **Actions → Update tide data → Run workflow**, then run `git pull`.

## Credits

Tide data: **Comune di Venezia – CPSM**, via dati.venezia.it (CC-BY). The station is Punta della Salute, and levels are in cm above the local tide-gauge zero (ZMPS). Built with Python (pandas, requests), p5.js, GitHub Actions and Pages, with help from an AI assistant.
