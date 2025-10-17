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
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence, Tuple, Dict, List, Optional


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
    Requirement("file", "public/assets/mall_floor_tile.gltf", "Mall floor tile model"),
    Requirement("file", "public/assets/mall_floor.png", "Mall floor texture"),
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


# --- GLTF structure validation helpers -------------------------------------------------

CriticalRiderBones: tuple[str, ...] = (
    "CC_Base_Hip_02",
    "CC_Base_Spine01_034",
    "CC_Base_Head_038",
)

OptionalRiderBones: tuple[str, ...] = (
    "CC_Base_L_Thigh_04",
    "CC_Base_L_Calf_05",
    "CC_Base_L_Foot_06",
    "CC_Base_R_Thigh_018",
    "CC_Base_R_Calf_019",
    "CC_Base_R_Foot_021",
    "CC_Base_L_Upperarm_050",
    "CC_Base_L_Forearm_051",
    "CC_Base_L_Hand_055",
    "CC_Base_R_Upperarm_078",
    "CC_Base_R_Forearm_079",
    "CC_Base_R_Hand_083",
)


def _load_gltf_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover
        return {"__error__": str(exc)}


def _build_parent_map(nodes: list[dict]) -> dict[int, int | None]:
    parent_of: dict[int, int | None] = {}
    for idx, node in enumerate(nodes):
        for child in node.get("children", []) or []:
            parent_of[int(child)] = idx
        if idx not in parent_of:
            parent_of[idx] = None
    return parent_of


def _top_level_nodes(gltf: dict) -> set[int]:
    tops: set[int] = set()
    for scene in gltf.get("scenes", []) or []:
        for n in scene.get("nodes", []) or []:
            tops.add(int(n))
    return tops


ValidationResult = tuple[bool, str, bool]  # (ok, message, is_warning)


def validate_rider_asset(path: Path) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    gltf = _load_gltf_json(path)
    nodes: list[dict] = gltf.get("nodes", []) or []
    name_to_index: dict[str, int] = {
        str(n.get("name")): i for i, n in enumerate(nodes) if "name" in n
    }

    missing_crit = [n for n in CriticalRiderBones if n not in name_to_index]
    if missing_crit:
        results.append(
            (False, f"Rider: missing critical bones: {', '.join(missing_crit)}", False)
        )
    else:
        results.append((True, "Rider: all critical bones present", False))

    missing_opt = [n for n in OptionalRiderBones if n not in name_to_index]
    if missing_opt:
        # Optional: warn only
        results.append(
            (True, f"Rider: optional bones missing: {', '.join(missing_opt)}", True)
        )

    # Connectivity check: ensure each critical bone reaches a scene root via parents
    parent_map = _build_parent_map(nodes)
    tops = _top_level_nodes(gltf)
    not_connected: list[str] = []
    for bone in CriticalRiderBones:
        idx = name_to_index.get(bone)
        if idx is None:
            continue
        seen: set[int] = set()
        cur = idx
        connected = False
        while cur is not None and cur not in seen:
            seen.add(cur)
            if cur in tops:
                connected = True
                break
            cur = parent_map.get(cur)
        if not connected:
            not_connected.append(bone)
    if not_connected:
        results.append(
            (
                True,
                "Rider: bones not connected to a scene root (warning): "
                + ", ".join(not_connected),
                True,
            )
        )
    else:
        results.append((True, "Rider: critical bones are connected to scene root", False))

    return results


def validate_scooter_asset(path: Path) -> list[ValidationResult]:
    results: list[ValidationResult] = []
    gltf = _load_gltf_json(path)
    nodes: list[dict] = gltf.get("nodes", []) or []
    names = [str(n.get("name", "")).lower() for n in nodes]

    wheel_count = sum(1 for nm in names if "wheel" in nm)
    has_handle = any("handle" in nm for nm in names) or any("handlebar" in nm for nm in names)
    has_fork_or_steer = any("fork" in nm for nm in names) or any("steer" in nm for nm in names)

    if wheel_count == 0:
        # Naming helps our visual wheel animation — mark as warning if absent
        results.append((True, "Scooter: no nodes named like 'wheel' (naming warning)", True))
    else:
        results.append((True, f"Scooter: found {wheel_count} wheel-like node(s)", False))

    if not has_handle:
        results.append((True, "Scooter: no 'handle/handlebar' node found (warning)", True))
    if not has_fork_or_steer:
        results.append((True, "Scooter: no 'fork/steer' node found (warning)", True))

    # Basic scene presence
    if not gltf.get("scenes"):
        results.append((False, "Scooter: GLTF has no scenes array", False))

    return results


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
            continue

        # Deep validation for specific GLTFs (naming + hierarchy)
        if requirement.rel_path.endswith("evil_old_lady/scene.gltf"):
            for ok2, msg, is_warn in validate_rider_asset(root / requirement.rel_path):
                if is_warn:
                    print(f"    ! {msg}")
                else:
                    print(f"    {'✓' if ok2 else '✗'} {msg}")
                if (not ok2) and (not is_warn):
                    failures += 1
        elif requirement.rel_path.endswith("mobility_scooter_animated/scene.gltf"):
            for ok2, msg, is_warn in validate_scooter_asset(root / requirement.rel_path):
                if is_warn:
                    print(f"    ! {msg}")
                else:
                    print(f"    {'✓' if ok2 else '✗'} {msg}")
                if (not ok2) and (not is_warn):
                    failures += 1

    if failures:
        print(
            f"\n{failures} problem(s) found. "
            "Fix the issues above and re-run this script."
        )
        return 1

    print("\nAll required assets are present and pass structural checks.")
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
