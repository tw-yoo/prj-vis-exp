#!/usr/bin/env python3
"""
Recursively remove PNG files whose names contain whitespace characters.

Run the script, then paste the folder path when prompted.
"""

import os
import sys
from pathlib import Path


def remove_pngs_with_space(root: Path) -> int:
  removed = 0
  for dirpath, _, filenames in os.walk(root):
    for name in filenames:
      if " " not in name:
        continue
      if not name.lower().endswith(".png"):
        continue
      file_path = Path(dirpath) / name
      try:
        file_path.unlink()
        removed += 1
      except OSError as exc:
        print(f"Failed to remove {file_path}: {exc}", file=sys.stderr)
  return removed


def main() -> None:
  root_input = input("Enter the directory to scan for PNGs with spaces: ").strip()
  if not root_input:
    print("No directory provided.", file=sys.stderr)
    sys.exit(1)

  root_path = Path(root_input)
  if not root_path.is_dir():
    print(f"Not a directory: {root_path}", file=sys.stderr)
    sys.exit(1)

  count = remove_pngs_with_space(root_path)
  print(f"Removed {count} PNG file(s) with spaces in the name under {root_path}")


if __name__ == "__main__":
  main()
