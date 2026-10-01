"""Pulizia dell'archivio storico CPSM (Punta Salute, Canal Grande, 2002-2025).

Input : data/raw/salute_canale/*.csv   (file orari, un layout diverso per anno)
Output: data/processed/hourly.csv          serie oraria unica (UTC, cm)
        data/processed/quality_by_year.csv report di qualità per anno
"""
import re
from pathlib import Path

import pandas as pd

RAW = Path("data/raw/salute_canale")
OUT_HOURLY = Path("data/processed/hourly.csv")
OUT_QUALITY = Path("data/processed/quality_by_year.csv")

MAX_GAP_H = 3          # buchi più lunghi di 3 ore NON vengono riempiti
MAX_ABS_CM = 300       # |livello| oltre 3 m = impossibile
MISSING_CODE_M = -900  # il Comune usa -999 per "dato non pervenuto"

# Solo i file ORARI. Gli altri (max-min, minmax, psaluteCG20XX) sono estremali.
HOURLY = re.compile(
    r"^(salutecg\d{4}|psalute\d{4}_1ora|ps\d{4}_orario|salutecanale\d{4})\.csv$", re.I)


def parse_dt(s):
    """Legge i 3 formati di data: ISO, dd/mm/yyyy e dd/mm/yy (+ ora)."""
    s = s.astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
    parts = []
    for pattern, fmt in [(r"^\d{4}-\d{2}-\d{2} ", "%Y-%m-%d %H:%M"),
                         (r"^\d{2}/\d{2}/\d{4} ", "%d/%m/%Y %H:%M"),
                         (r"^\d{2}/\d{2}/\d{2} ", "%d/%m/%y %H:%M")]:
        m = s.str.match(pattern)
        if m.any():
            parts.append(pd.to_datetime(s[m], format=fmt, errors="coerce"))
    if not parts:
        return pd.Series(pd.NaT, index=s.index)
    return pd.concat(parts).reindex(s.index)


def read_file(path):
    """Ritorna un DataFrame con due colonne: ts (testo) e m (livello in metri, testo)."""
    name = path.name.lower()
    if name.startswith("salutecg"):                      # 2002-2021: 2 righe di intestazione
        return pd.read_csv(path, sep=";", skiprows=2, header=None, usecols=[0, 1],
                           names=["ts", "m"], dtype=str, encoding="latin-1")
    sep = "," if name.startswith("psalute") else ";"     # 2022 usa la virgola
    df = pd.read_csv(path, sep=sep, dtype=str, encoding="latin-1")
    col = next(c for c in df.columns if "medio 1m" in c)  # livello medio a 1 minuto
    ts = df.iloc[:, 0].str.strip() + " " + df.iloc[:, 1].str.strip()   # GIORNO + ORA
    return pd.DataFrame({"ts": ts, "m": df[col]})


def main():
    files = sorted(p for p in RAW.rglob("*.csv") if HOURLY.match(p.name))
    if not files:
        raise SystemExit("Nessun file orario trovato: hai lanciato download.py?")
    print(f"File orari usati: {len(files)}")

    frames = []
    for p in files:
        df = read_file(p)
        df["ts"] = parse_dt(df["ts"])
        df["m"] = pd.to_numeric(df["m"].str.replace(",", ".").str.strip(), errors="coerce")
        bad = int(df["ts"].isna().sum())
        print(f"  {p.name:<24} righe {len(df):>6}   date non lette: {bad}")
        frames.append(df.dropna(subset=["ts"]))
    df = pd.concat(frames, ignore_index=True)
    n_read = len(df)

    # 1) valori non validi -> NaN
    df["cm"] = df["m"] * 100
    code = df["m"] <= MISSING_CODE_M
    impossible = df["cm"].abs() > MAX_ABS_CM          # include anche il codice -999
    n_code, n_imp = int(code.sum()), int((impossible & ~code).sum())
    df.loc[impossible, "cm"] = float("nan")

    # 2) duplicati (tieni la riga con un valore, se c'è)
    df = df.sort_values(["ts", "cm"])
    n_dup = int(df.duplicated("ts").sum())
    df = df.drop_duplicates("ts", keep="first")

    # 3) ora solare (UTC+1) -> UTC, griglia oraria regolare
    s = (df.set_index("ts")["cm"]
           .tz_localize("Etc/GMT-1").tz_convert("UTC")
           .resample("1h").mean())

    # 4) interpolazione solo dei buchi brevi (<= MAX_GAP_H ore, per intero)
    isna = s.isna()
    run_id = (isna != isna.shift()).cumsum()
    run_len = isna.groupby(run_id).transform("sum")
    interp = s.interpolate(limit_area="inside")
    filled = isna & (run_len <= MAX_GAP_H) & interp.notna()
    clean = s.where(~filled, interp)

    # 5) output
    OUT_HOURLY.parent.mkdir(parents=True, exist_ok=True)
    out = pd.DataFrame({"timestamp_utc": clean.index,
                        "livello_cm": clean.round(1).values,
                        "interpolata": filled.astype(int).values})
    out.dropna(subset=["livello_cm"]).to_csv(OUT_HOURLY, index=False)

    q = pd.DataFrame({"cm": clean, "misurata": ~isna, "interpolata": filled})
    g = q.groupby(q.index.year)
    rep = pd.DataFrame({
        "ore_totali": g.size(),
        "ore_misurate": g["misurata"].sum(),
        "ore_interpolate": g["interpolata"].sum(),
        "ore_mancanti": g["cm"].apply(lambda x: int(x.isna().sum())),
        "max_cm": g["cm"].max().round(0),
    })
    rep["copertura_pct"] = (100 * (rep["ore_totali"] - rep["ore_mancanti"])
                            / rep["ore_totali"]).round(1)
    rep.index.name = "anno"
    rep.to_csv(OUT_QUALITY)

    # 6) riepilogo a schermo
    print("\n--- RIEPILOGO ---")
    print(f"Righe lette: {n_read} | codice -999: {n_code} | valori impossibili: {n_imp} "
          f"| duplicati: {n_dup}")
    print(f"Ore interpolate: {int(filled.sum())} | ore ancora mancanti: {int(clean.isna().sum())}")
    print(f"Periodo: {clean.index.min()} -> {clean.index.max()}")
    print("\nCopertura per anno:")
    print(rep.to_string())
    mask = isna & (run_len > MAX_GAP_H)
    if mask.any():
        gaps = (s.index.to_series()[mask].groupby(run_id[mask])
                  .agg(["first", "last", "size"]).sort_values("size", ascending=False))
        print("\nBuchi più lunghi (non riempiti):")
        print(gaps.head(8).to_string(index=False))


if __name__ == "__main__":
    main()