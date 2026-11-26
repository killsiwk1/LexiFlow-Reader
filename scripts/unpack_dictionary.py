"""Restore the pinned, SHA-256 verified ECDICT shards from the release file."""
import hashlib
import json
from pathlib import Path
import sys

target = Path(__file__).resolve().parents[1] / "public" / "dictionary"
manifest = json.loads((target / "manifest.json").read_bytes())
with Path(sys.argv[1]).open("rb") as stream:
    if stream.read(4) != b"LFD1":
        raise ValueError("Invalid LexiFlow dictionary")
    length = int.from_bytes(stream.read(4), "little")
    if length > 100000 or json.loads(stream.read(length)) != manifest:
        raise ValueError("Dictionary version mismatch")
    for i, part in enumerate(manifest["parts"]):
        data = stream.read(part["size"])
        if hashlib.sha256(data).hexdigest() != part["sha256"]:
            raise ValueError(f"Corrupt shard {i}")
        (target / f"{i}.bin").write_bytes(data)
    if stream.read(1):
        raise ValueError("Unexpected trailing data")
print("Verified and restored all dictionary shards.")
