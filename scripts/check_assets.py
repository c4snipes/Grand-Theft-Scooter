#!/usr/bin/env python3
"""
Verify that the external game assets expected by the project are present.

The loader in src/core/assets.js references a mix of individual GLTF/texture files
and folders containing multiple character variants. This script performs explicit
checks for each requirement so that developers get actionable feedback instead of
generic "404" errors at runtime.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence


@dataclass(frozen=True)
class Requirement:
    """Represents a single asset dependency."""

    kind: str  # "file" or "directory"
    rel_path: str
    label: str
    members: Sequence[str] = field(default_factory=tuple)  # only used for directory checks


REPO_ROOT = Path(__file__).resolve().parents[1]

REQUIREMENTS: tuple[Requirement, ...] = (
    Requirement("file", "public/assets/mall_kiosk.gltf", "Mall kiosk model"),
    Requirement("file", "public/assets/mall_column.gltf", "Mall column model"),
    Requirement("file", "public/assets/mall_banner.gltf", "Mall banner structure"),
    Requirement("file", "public/assets/mall_banner.png", "Mall banner texture"),
    Requirement("file", "public/assets/shopping_mall/scene.gltf", "Shopping mall scene"),
    Requirement(
        "file",
        "public/assets/mobility_scooter_animated/scene.gltf",
        "Mobility scooter model",
    ),
    Requirement("file", "public/assets/evil_old_lady/scene.gltf", "Evil old lady rider"),
    Requirement("file", "public/assets/Character Base.gltf", "Base NPC rig"),
    Requirement(
        "directory",
        "public/assets/Animated Men Pack-glb",
        "Animated men NPC pack",
        members=(
            "Man.gltf",
            "Man in Suit.gltf",
            "Man in Long Sleeves.gltf",
            "Man-fjHyMd5Wxw.gltf",
        ),
    ),
    Requirement(
        "directory",
        "public/assets/Ultimate Modular Women Pack-glb",
        "Animated women NPC pack",
        members=(
            "Animated Woman.gltf",
            "Animated Woman-nIItLV9nxS.gltf",
            "Adventurer.gltf",
            "Medieval.gltf",
            "Punk.gltf",
            "Sci Fi Character.gltf",
            "Soldier.gltf",
            "Suit.gltf",
            "Witch.gltf",
            "Worker.gltf",
        ),
    ),
)


def load_requirements(selected: Sequence[str] | None) -> Iterable[Requirement]:
    if not selected:
        yield from REQUIREMENTS
        return

    labels = {req.label.lower(): req for req in REQUIREMENTS}
    paths = {req.rel_path: req for req in REQUIREMENTS}

    for item in selected:
        key = item.lower()
        if key in labels:
            yield labels[key]
        elif item in paths:
            yield paths[item]
        else:
            raise ValueError(f"Unknown requirement '{item}'. Use --list to see options.")


def check_file(root: Path, requirement: Requirement) -> tuple[bool, str]:
    target = root / requirement.rel_path
    if target.is_file():
        return True, f"{requirement.label}: found at {requirement.rel_path}"
    if target.exists():
        return False, f"{requirement.label}: expected a file but found something else at {requirement.rel_path}"
    return False, f"{requirement.label}: missing ({requirement.rel_path})"


def check_directory(root: Path, requirement: Requirement) -> tuple[bool, str]:
    target = root / requirement.rel_path
    if not target.is_dir():
        if target.exists():
            return False, f"{requirement.label}: expected a directory but found a file at {requirement.rel_path}"
        return False, f"{requirement.label}: directory missing ({requirement.rel_path})"

    missing_members = [
        member for member in requirement.members if not (target / member).is_file()
    ]
    if missing_members:
        formatted = ", ".join(sorted(missing_members))
        return (
            False,
            f"{requirement.label}: directory present but missing {len(missing_members)} file(s): {formatted}",
        )
    return True, f"{requirement.label}: all {len(requirement.members)} files present"


def run_checks(root: Path, requirements: Iterable[Requirement]) -> int:
    print("Verifying required public assets...\n")
    failures = 0

    for requirement in requirements:
        if requirement.kind == "file":
            ok, message = check_file(root, requirement)
        elif requirement.kind == "directory":
            ok, message = check_directory(root, requirement)
        else:
            raise ValueError(f"Unsupported requirement kind: {requirement.kind}")

        symbol = "✓" if ok else "✗"
        print(f"  {symbol} {message}")
        if not ok:
            failures += 1

    if failures:
        print(
            f"\n{failures} requirement(s) were missing or incomplete. "
            "Download the assets listed above and place them under public/assets/."
        )
        return 1

    print("\nAll required assets are present.")
    return 0


def list_requirements() -> None:
    print("Known asset requirements:\n")
    for requirement in REQUIREMENTS:
        print(f"- {requirement.label} -> {requirement.rel_path}")
        if requirement.kind == "directory":
            for member in requirement.members:
                print(f"    • {member}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate that the external assets needed by the game are available."
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=REPO_ROOT,
        help="Project root (defaults to the repository root).",
    )
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="NAME",
        help="Restrict the check to specific assets (match by label or relative path).",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List the known requirements and exit without performing checks.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.list:
        list_requirements()
        return 0

    try:
        requirements = tuple(load_requirements(args.only))
    except ValueError as error:
        parser.error(str(error))

    return run_checks(args.root, requirements)


if __name__ == "__main__":
    raise SystemExit(main())
