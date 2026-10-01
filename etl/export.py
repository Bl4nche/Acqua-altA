"""Esporta docs/tides.json (piccolo) dalla serie oraria pulita."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HOURLY = Path("data/processed/hourly.csv")
OUT = Path("docs/tides.json")
THRESHOLD_CM = 110     # soglia di "acqua alta": verifica la definizione e citala nel README
MIN_HOURS = 18         # un giorno con meno ore valide ha il massimo inaffidabile...


def main():
    df = pd.read_csv(HOURLY)
    ts = pd.to_datetime(df["timestamp_utc"], utc=True).dt.tz_convert("Etc/GMT-1")
    s = pd.Series(df["livello_cm"].to_numpy(), index=pd.DatetimeIndex(ts))

    g = s.resample("1D")
    daily = pd.DataFrame({"max": g.max(), "min": g.min(),
                          "mean": g.mean(), "n": g.count()}).dropna(subset=["max"])
    # ...salvo che il picco misurato superi già la soglia: allora l'evento è certo
    daily = daily[(daily["n"] >= MIN_HOURS) | (daily["max"] >= THRESHOLD_CM)]

    high_hours = (s >= THRESHOLD_CM).groupby(s.index.year).sum()
    years = []
    for y, d in daily.groupby(daily.index.year):
        years.append({
            "y": int(y),
            "days": int(len(d)),
            "high_days": int((d["max"] >= THRESHOLD_CM).sum()),
            "high_hours": int(high_hours.get(y, 0)),
            "max_cm": int(round(d["max"].max())),
            "max_day": d["max"].idxmax().strftime("%Y-%m-%d"),
        })

    days = [{"d": i.strftime("%Y-%m-%d"), "max": int(round(r["max"])),
             "min": int(round(r["min"])), "mean": int(round(r["mean"]))}
            for i, r in daily.iterrows()]

    payload = {
        "meta": {
            "source": "Comune di Venezia - Centro Previsioni e Segnalazioni Maree (CC-BY)",
            "station": "Punta della Salute, Canal Grande",
            "unit": "cm rispetto allo zero mareografico di Punta della Salute (ZMPS)",
            "timezone": "ora solare UTC+1",
            "high_water_threshold_cm": THRESHOLD_CM,
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "years": years,
        "days": days,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Scritto {OUT} ({OUT.stat().st_size / 1e3:.0f} KB): {len(days)} giorni, {len(years)} anni")
    print("\nI 5 giorni più alti:")
    print(daily["max"].nlargest(5).round(0).to_string())


if __name__ == "__main__":
    main()