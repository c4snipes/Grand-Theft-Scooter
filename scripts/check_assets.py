#!/usr/bin/env python3
import os
import sys

PATHS = [
    "public/assets/mall_kiosk.gltf",
    "public/assets/mall_floor_tile.gltf",
    "public/assets/mall_floor.png",
    "public/assets/mall_column.gltf",
    "public/assets/mall_banner.gltf",
    "public/assets/mall_banner.png",
    "public/assets/mobility_scooter_animated/scene.gltf",
    "public/assets/evil_old_lady/scene.gltf",
    "public/assets/shopping_mall/scene.gltf",
    "public/assets/Character Base.gltf",
    "public/assets/Animated Men Pack-glb",
    "public/assets/Ultimate Modular Women Pack-glb",
]


def main() -> int:
    print("Verifying required public assets...")
    missing = False

    for path in PATHS:
        if not os.path.exists(path):
            print(f"  ✗ {path} (missing)")
            missing = True
        else:
            print(f"  ✓ {path}")

    if missing:
        print(
            "\nOne or more assets are missing. Please copy the files/directories "
            "listed above into public/assets/."
        )
        return 1

    print("\nAll required assets are present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
