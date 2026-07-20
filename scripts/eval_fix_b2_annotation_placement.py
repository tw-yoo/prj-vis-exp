#!/usr/bin/env python3
"""Fix mis-placed B2 (LLM-generated) annotations for two evaluation charts.

Both defects are pure placement bugs in the stored `svg_code` snapshots; no
annotation is added, removed, or re-valued.

1. 0wflwm4jebx7n12y (simple bar) — the `annotation-layer` group is a *sibling*
   of `chart-skeleton` at the SVG root, but its coordinates were authored in
   plot space. Everything therefore renders shifted left/up by the plot margin
   (the max leader line starts off-chart, the diff arrow lands left of the
   y-axis, over the tick labels). Fix: give the layer the same
   translate(marginLeft, marginTop) the skeleton has, then re-center the diff
   arrow on the 2000 bar and lift its label into the empty space beside it.

2. 2bhsybiilde28j87 (stacked bar) — the layer is correctly nested, but the
   average callout box sits at plot x=560 w=330, which runs straight through
   the color legend (abs x>=668.8) and past the right edge of the viewBox.
   Fix: narrow the box and drop it below the legend, re-aiming the connectors.

Idempotent: re-running detects the already-patched markup and reports "skip".
"""

import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULT = os.path.join(ROOT, "evaluation/baselines/B2/baseline2_result.json")

BAR_CENTER = "19.259259259259252"  # x of the 2000 band center == the max bar


def fix_simple_bar(svg: str) -> str | None:
    m = re.search(r'<svg[^>]*data-m-left="([\d.]+)"[^>]*data-m-top="([\d.]+)"', svg)
    if not m:
        raise SystemExit("missing margin attributes")
    m_left, m_top = m.group(1), m.group(2)

    layer = '<g class="annotation-layer operation-next-annotation-layer">'
    if layer not in svg:
        return None  # already carries a transform
    svg = svg.replace(
        layer,
        f'<g class="annotation-layer operation-next-annotation-layer" '
        f'transform="translate({m_left},{m_top})">',
    )

    # Re-center the diff arrow (was x=44, i.e. the gap after the 2000 bar) on
    # the max bar itself, and move its label out of the bar tops.
    svg = svg.replace('<line x1="44" y1=', f'<line x1="{BAR_CENTER}" y1=')
    svg = svg.replace('x2="44" y2=', f'x2="{BAR_CENTER}" y2=')
    svg = svg.replace('<line x1="36" y1=', '<line x1="11.26" y1=')
    svg = svg.replace('x2="52" y2=', 'x2="27.26" y2=')
    svg = svg.replace('<rect x="58" y="34" width="184"', '<rect x="40" y="24" width="184"')
    svg = svg.replace('<text x="150" y="52" text-anchor="middle"', '<text x="132" y="42" text-anchor="middle"')
    return svg


def fix_stacked_bar(svg: str) -> str | None:
    if '<g transform="translate(560,92)">' not in svg:
        return None
    # Box: below the legend (legend bottom is abs y~208 == plot y~168), narrowed
    # so its right edge stays inside the viewBox.
    svg = svg.replace('<g transform="translate(560,92)">', '<g transform="translate(528,176)">')
    svg = svg.replace('<rect x="0" y="0" width="330" height="96"', '<rect x="0" y="0" width="296" height="92"')
    svg = svg.replace('<text x="14" y="18" font-size="16"', '<text x="12" y="18" font-size="14"')
    for y_old, y_new, size in (("44", "42", "15"), ("68", "64", "15"), ("88", "84", "15")):
        svg = svg.replace(f'<text x="14" y="{y_old}" font-size="{size}"', f'<text x="12" y="{y_new}" font-size="14"')
    # Re-aim the three connectors at the box's left edge instead of its old spot.
    svg = svg.replace("C 250,160 420,150 560,140", "C 250,180 420,200 526,208")
    svg = svg.replace("C 300,165 430,155 560,140", "C 300,185 430,200 526,210")
    svg = svg.replace("C 480,165 520,155 560,140", "C 480,180 505,195 526,212")
    return svg


def fix_line_extremum(svg: str) -> str | None:
    """95yhyqjyeu4fohbj (simple line) — same root-level layer / plot-space coords
    bug as 0wflwm4jebx7n12y: the min/max rings and the avg + 2010 reference lines
    all land a margin-width left and up of the points they mark. Coordinates are
    internally consistent, so the translate alone fixes them. Scene 3's
    conclusion box then lands on the max ring and the max label, so it also
    moves up into the empty top margin."""
    out = translate_layer(svg)
    if out is None:
        return None
    out = out.replace('<rect x="330" y="8" width="184"', '<rect x="300" y="-36" width="184"')
    out = out.replace('<text x="338" y="28" font-size="14"', '<text x="308" y="-16" font-size="14"')
    return out


def fix_stacked_filter(svg: str) -> str | None:
    """77xb5ug5lhfmkb74 (stacked bar) — the untransformed layer mixes coordinate
    spaces: the blue "Before 2015" band is plot-space (so it renders over the
    y-axis and above the plot), while the yellow legend highlight was authored in
    absolute space. Translate the layer, then re-express the two legend-space
    elements in plot space and size the box to the four Europe rows, with its
    caption moved clear of the "Rest of Europe" label it was sitting on."""
    m = re.search(r'data-m-left="([\d.]+)"', svg)
    m_left = float(m.group(1))
    out = translate_layer(svg)
    if out is None:
        return None
    # abs -> plot for the legend highlight; box now spans rows 1-4 (abs y 68..180)
    # and the caption drops below the legend (abs y 256) instead of overprinting row 4.
    out = out.replace(
        f'<rect x="{m_left + 576.0}" y="70" width="270" height="98"',
        '<rect x="576" y="28" width="270" height="112"',
    )
    out = out.replace(f'<text x="{m_left + 584.0}" y="176"', '<text x="584" y="216"')
    return out


def translate_layer(svg: str) -> str | None:
    """Give a root-level annotation layer the skeleton's margin transform."""
    m = re.search(r'<svg[^>]*data-m-left="([\d.]+)"[^>]*data-m-top="([\d.]+)"', svg)
    if not m:
        raise SystemExit("missing margin attributes")
    layer = '<g class="annotation-layer operation-next-annotation-layer">'
    if layer not in svg:
        return None
    return svg.replace(
        layer,
        f'<g class="annotation-layer operation-next-annotation-layer" '
        f'transform="translate({m.group(1)},{m.group(2)})">',
    )


def main() -> None:
    with open(RESULT, encoding="utf-8") as fh:
        payload = json.load(fh)
    charts = payload["gpt-5.2"]

    changed = 0
    fixers = (
        ("0wflwm4jebx7n12y", fix_simple_bar),
        ("2bhsybiilde28j87", fix_stacked_bar),
        ("95yhyqjyeu4fohbj", fix_line_extremum),
        ("77xb5ug5lhfmkb74", fix_stacked_filter),
    )
    for cid, fixer in fixers:
        for scene in charts[cid]:
            fixed = fixer(scene["svg_code"])
            if fixed is None or fixed == scene["svg_code"]:
                print(f"skip  {cid} scene {scene['scene_number']} (already patched)")
                continue
            scene["svg_code"] = fixed
            changed += 1
            print(f"fixed {cid} scene {scene['scene_number']}")

    if changed:
        with open(RESULT, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"OK: {changed} scene(s) rewritten")


if __name__ == "__main__":
    main()
