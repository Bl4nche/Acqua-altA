import json
from pathlib import Path

import pandas as pd
import requests

BASE = "https://dati.venezia.it/sites/default/files/dataset/opendata/"
STATION = "Punta Salute Canal Grande"
LIVE_CSV = Path("data/processed/live.csv")
LIVE_JSON = Path("docs/live.json")


def get_json(name):
    r = requests.get(BASE + name, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_reading():
    """Ultima lettura misurata della stazione. Ritorna (data_locale, cm) o None."""
    for row in get_json("livello.json"):
        if row.get("stazione") != STATION:
            continue
        if "valore" not in row or "data" not in row:
            return None                                   # stazione senza dato
        metres = float(row["valore"].replace("m", "").replace(",", ".").strip())
        if metres <= -900:                                # -999 = dato non pervenuto
            return None
        return row["data"], metres * 100
    return None


def astronomical_cm(local_time):
    """Marea astronomica (cm) allo stesso istante, dal file dell'anno."""
    year = local_time[:4]
    data = get_json(f"as{year}min.json")
    return next((float(d["valore"]) for d in data if d["data"] == local_time), None)


def main():
    reading = fetch_reading()
    if reading is None:
        print("Nessuna lettura valida: esco senza modificare nulla.")
        return
    local_time, cm = reading

    ts = pd.Timestamp(local_time).tz_localize("Etc/GMT-1").tz_convert("UTC")
    age = pd.Timestamp.now(tz="UTC") - ts
    if age > pd.Timedelta(hours=2):
        print(f"ATTENZIONE: la lettura ha {age} di ritardo, la fonte potrebbe essere ferma.")

    astro = astronomical_cm(local_time)
    new = pd.DataFrame([{
        "timestamp_utc": ts,
        "livello_cm": round(cm, 1),
        "astronomica_cm": astro,
        "sovralzo_cm": round(cm - astro, 1) if astro is not None else None,
    }])

    LIVE_CSV.parent.mkdir(parents=True, exist_ok=True)
    if LIVE_CSV.exists():
        old = pd.read_csv(LIVE_CSV)
        new = pd.concat([old, new])
    new["timestamp_utc"] = pd.to_datetime(new["timestamp_utc"], utc=True, format="ISO8601")
    new = (new.drop_duplicates("timestamp_utc")
              .query("livello_cm.abs() < 300")            # scarta valori impossibili
              .sort_values("timestamp_utc"))
    new.to_csv(LIVE_CSV, index=False)

    # JSON leggero per il sito: solo gli ultimi 7 giorni
    recent = new[new["timestamp_utc"] > new["timestamp_utc"].max() - pd.Timedelta(days=7)]
    readings = [{
        "t": r.timestamp_utc.isoformat(),
        "cm": r.livello_cm,
        "astro": None if pd.isna(r.astronomica_cm) else r.astronomica_cm,
        "surge": None if pd.isna(r.sovralzo_cm) else r.sovralzo_cm,
    } for r in recent.itertuples()]
    LIVE_JSON.parent.mkdir(parents=True, exist_ok=True)
    LIVE_JSON.write_text(json.dumps({"updated": new["timestamp_utc"].max().isoformat(),
                                     "readings": readings}))
    print(f"OK: {local_time} -> {cm:.1f} cm (astronomica {astro}). Righe totali: {len(new)}")


if __name__ == "__main__":
    main()