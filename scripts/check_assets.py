#!/usr/bin/env python3
"""
Models-only asset checker for public/assets

What it does:
- Verifies the assets root exists and is not empty
- Scans each immediate subfolder under public/assets (recursively)
- For each subfolder, checks:
	* At least one 3D model file exists (.glb or .gltf)
- Prints a concise report and exits non-zero if any folder has no models

Usage:
	python3 scripts/check_assets.py [--root public/assets]

Notes:
- This is a lightweight validation using only Python stdlib. It does not
	parse or validate GLB/GLTF contents.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from typing import List, Tuple


MODEL_EXTS = {".glb", ".gltf"}

def _classify_extension(ext: str) -> str:
	"""Classify a file extension as 'model' or 'other'."""
	if ext in MODEL_EXTS:
		return "model"
	return "other"


@dataclass
class AssetReport:
	folder: str
	# Use typed default factories to satisfy static type checkers
	model_files: List[str] = field(default_factory=lambda: [])
	other_files: List[str] = field(default_factory=lambda: [])


	@property
	def model_count(self) -> int:
		return len(self.model_files)

	@property
	def texture_count(self) -> int:
		# Not used in models-only mode
		return 0

	@property
	def has_models(self) -> bool:
		return self.model_count > 0

	@property
	def has_errors(self) -> bool:
		return (not self.has_models)


def scan_folder(folder_path: str) -> AssetReport:
	report = AssetReport(folder=os.path.basename(folder_path))

	try:
		# Recursive walk to catch nested models
		for _root, _dirs, files in os.walk(folder_path):
			for name in files:
				lower = name.lower()
				_, ext = os.path.splitext(lower)

				# Classify by extension
				kind = _classify_extension(ext)
				if kind == "model":
					report.model_files.append(name)
				else:
					report.other_files.append(name)
	except FileNotFoundError:
		# If the folder itself doesn't exist, surface as error upstream
		return report

	return report


def scan_assets_root(root: str) -> Tuple[List[AssetReport], List[str]]:
	errors: List[str] = []

	if not os.path.exists(root):
		errors.append(f"Assets root not found: {root}")
		return [], errors

	if not os.path.isdir(root):
		errors.append(f"Assets root is not a directory: {root}")
		return [], errors

	# Only immediate subdirectories are considered asset packs
	subdirs = [e for e in os.scandir(root) if e.is_dir() and not e.name.startswith('.')]

	if not subdirs:
		errors.append(f"No asset subfolders found under {root}")
		return [], errors

	reports: List[AssetReport] = []
	for sd in sorted(subdirs, key=lambda e: e.name.lower()):
		reports.append(scan_folder(sd.path))

	return reports, errors


def print_report(reports: List[AssetReport], require_license: bool) -> Tuple[int, int, int]:
	total = len(reports)
	ok = 0
	warn = 0
	err = 0

	def status_line(r: AssetReport) -> str:
		status_msgs: List[str] = []
		if r.has_errors:
			status_msgs.append("ERROR")
		if not status_msgs:
			status_msgs.append("OK")
		return ",".join(status_msgs)

	print("\nAsset Check Report")
	print("=" * 72)
	for r in reports:
		status = status_line(r)
		if "ERROR" in status:
			err += 1
		elif "NO-LICENSE" in status:
			warn += 1
		else:
			ok += 1

		print(f"- {r.folder}: {status}")
		print(f"  models={r.model_count} other={len(r.other_files)}")

	print("-" * 72)
	print(f"Summary: total={total} ok={ok} warn={warn} err={err}")
	return ok, warn, err


def main(argv: List[str]) -> int:
	parser = argparse.ArgumentParser(description="Validate that each asset folder contains a 3D model (.glb/.gltf)")
	parser.add_argument(
		"--root",
		default=os.path.join("public", "assets"),
		help="Assets root directory (default: public/assets)",
	)
	args = parser.parse_args(argv)

	reports, early_errors = scan_assets_root(args.root)
	if early_errors:
		for e in early_errors:
			print(f"ERROR: {e}")
		return 1

	_, _, err = print_report(reports, require_license=False)

	# Exit code policy:
	# - Any folder missing model files or containing zero-byte files => error (exit 1)
	# - Missing license is a warning only unless stricter policy is desired
	return 0 if err == 0 else 1


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))

