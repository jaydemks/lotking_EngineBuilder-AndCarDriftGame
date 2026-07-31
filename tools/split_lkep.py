#!/usr/bin/env python3
"""Split one portable LKEP JSON into a GitHub-safe pointer + project folder."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


CHUNK_CHAR_LIMIT = 8_000_000
POINTER_FORMAT = "LKEP_SPLIT_POINTER"
MANIFEST_FORMAT = "LKEP_SPLIT_MANIFEST"
VERSION = 1


def utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def atomic_write(path: Path, data: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(data, encoding="utf-8", newline="")
    temporary.replace(path)


def split_lkep(source: Path, base_name: str | None = None) -> dict[str, object]:
    text = source.read_text(encoding="utf-8")
    project = json.loads(text)
    if not isinstance(project, dict) or project.get("format") != "LKEP":
        raise ValueError(f"{source} is not an LKEP project")

    default_base = source.name
    if default_base.endswith(".lkep.json"):
        default_base = default_base[: -len(".lkep.json")]
    else:
        default_base = source.stem
    base = (base_name or default_base).strip()
    if not base or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for char in base):
        raise ValueError("base name may contain only letters, numbers, '-' and '_'")

    project_dir = source.parent / base
    chunks_dir = project_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)
    manifest_chunks: list[dict[str, object]] = []
    emitted: list[Path] = []
    offset = 0
    index = 1
    while offset < len(text):
        part = text[offset : offset + CHUNK_CHAR_LIMIT]
        relative = f"chunks/project-{index:04d}.lkep-part"
        target = project_dir / relative
        encoded = part.encode("utf-8")
        atomic_write(target, part)
        emitted.append(target)
        manifest_chunks.append(
            {
                "file": relative,
                "chars": utf16_length(part),
                "bytes": len(encoded),
                "sha256": hashlib.sha256(encoded).hexdigest(),
            }
        )
        offset += len(part)
        index += 1
    if not manifest_chunks:
        target = chunks_dir / "project-0001.lkep-part"
        atomic_write(target, "")
        emitted.append(target)
        manifest_chunks.append(
            {
                "file": "chunks/project-0001.lkep-part",
                "chars": 0,
                "bytes": 0,
                "sha256": hashlib.sha256(b"").hexdigest(),
            }
        )

    reconstructed = "".join(path.read_text(encoding="utf-8") for path in emitted)
    if reconstructed != text:
        raise RuntimeError("split verification failed; source was not replaced")

    for stale in chunks_dir.glob("project-*.lkep-part"):
        if stale not in emitted:
            stale.unlink()

    manifest = {
        "format": MANIFEST_FORMAT,
        "version": VERSION,
        "encoding": "utf-8-json-text-chunks",
        "project": {
            "name": project.get("meta", {}).get("projectName")
            or project.get("meta", {}).get("trackName")
            or base,
            "savedAt": project.get("savedAt"),
            "format": project.get("format", "LKEP"),
        },
        "totalChars": utf16_length(text),
        "totalBytes": len(text.encode("utf-8")),
        "chunkCharLimit": CHUNK_CHAR_LIMIT,
        "chunks": manifest_chunks,
    }
    pointer = {
        "format": POINTER_FORMAT,
        "version": VERSION,
        "manifest": f"{base}/manifest.json",
    }

    # Metadata is published only after every part has been written and checked.
    atomic_write(project_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    atomic_write(source, json.dumps(pointer, ensure_ascii=False, indent=2) + "\n")
    return {
        "pointer": str(source),
        "folder": str(project_dir),
        "chunks": len(manifest_chunks),
        "totalBytes": manifest["totalBytes"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path, help="portable .lkep.json file")
    parser.add_argument("--base-name", help="pointer folder basename (default: input filename)")
    args = parser.parse_args()
    report = split_lkep(args.project.resolve(), args.base_name)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
