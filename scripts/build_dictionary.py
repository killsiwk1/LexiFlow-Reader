"""Build all ECDICT rows into indexed SQLite shards and a portable replacement pack."""
import argparse
import csv
import gzip
import hashlib
import json
import sqlite3
import struct
import tempfile
from pathlib import Path

SHARDS = 128
FIELDS = "word phonetic definition translation pos collins oxford tag bnc frq exchange detail audio".split()


def bucket(word):
    value = 0
    for ch in word.lower()[:3]:
        value = value * 31 + ord(ch)
    return value % SHARDS


def build(source, dest, pack, version):
    dest.mkdir(exist_ok=True, parents=True)
    license_text = (Path(__file__).resolve().parents[1] / "docs/ECDICT-LICENSE.txt").read_text()
    with tempfile.TemporaryDirectory() as temp:
        paths = [Path(temp) / f"{i}.sqlite" for i in range(SHARDS)]
        connections = [sqlite3.connect(p) for p in paths]
        for con in connections:
            con.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; "
                              "CREATE TABLE entries (" + ",".join(f + " TEXT" for f in FIELDS) +
                              "); CREATE TABLE forms(form TEXT, lemma TEXT);")
        count = 0
        insert = "INSERT INTO entries VALUES (" + ",".join("?" for _ in FIELDS) + ")"
        with source.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not set(FIELDS).issubset(reader.fieldnames):
                raise ValueError("Unexpected ECDICT columns")
            for row in reader:
                word = row["word"]
                connections[bucket(word)].execute(insert, [row[f] for f in FIELDS])
                count += 1
                for field in row["exchange"].split("/"):
                    code, sep, form = field.partition(":")
                    if sep and form and code in {"p", "d", "i", "3", "r", "t", "s"}:
                        connections[bucket(form)].execute("INSERT INTO forms VALUES (?,?)", (form, word))
        parts = []
        for i, (path, con) in enumerate(zip(paths, connections)):
            con.executescript("CREATE INDEX word_idx ON entries(word COLLATE NOCASE); "
                              "CREATE INDEX form_idx ON forms(form COLLATE NOCASE)")
            assert con.execute("PRAGMA quick_check").fetchone()[0] == "ok"
            con.close()
            data = gzip.compress(path.read_bytes(), compresslevel=6, mtime=0)
            (dest / f"{i}.bin").write_bytes(data)
            parts.append(dict(size=len(data), raw=path.stat().st_size, sha256=hashlib.sha256(data).hexdigest()))
        manifest = dict(format="LexiFlow-SQLite-1", name="ECDICT", version=version, count=count,
                        source="https://github.com/skywind3000/ECDICT", license=license_text,
                        csvSha256=hashlib.file_digest(source.open("rb"), "sha256").hexdigest(), parts=parts)
        header = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode()
        (dest / "manifest.json").write_bytes(header)
        with pack.open("wb") as output:
            output.write(b"LFD1" + struct.pack("<I", len(header)) + header)
            for i in range(SHARDS):
                output.write((dest / f"{i}.bin").read_bytes())
        print(count, "entries,", sum(p["raw"] for p in parts), "SQLite bytes,", pack.stat().st_size, "pack bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("dest", type=Path)
    parser.add_argument("pack", type=Path)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    build(args.csv, args.dest, args.pack, args.version)
