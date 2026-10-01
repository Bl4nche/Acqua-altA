import zipfile
from pathlib import Path

import requests

BASE = "https://dati.venezia.it/sites/default/files/dataset/opendata_archivio/"
ARCHIVES = {"salute_canale": "salute_canale.zip"}
RAW = Path("data/raw")


def download(fname):
    dest = RAW / fname
    if dest.exists():
        print(f"{fname} già scaricato, lo riuso.")
        return dest
    print(f"Scarico {fname} ...")
    with requests.get(BASE + fname, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return dest


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    for folder, fname in ARCHIVES.items():
        zip_path = download(fname)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(RAW / folder)
        for f in sorted((RAW / folder).rglob("*")):
            if f.is_file():
                print(f"\n=== {f.name} ({f.stat().st_size / 1e6:.1f} MB) ===")
                print(f.read_bytes()[:800].decode("latin-1", errors="replace"))


if __name__ == "__main__":
    main()