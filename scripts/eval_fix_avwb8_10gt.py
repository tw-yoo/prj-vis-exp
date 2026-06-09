#!/usr/bin/env python3
"""One-shot fixes requested by the user:
  (1) avwb8xstxx1lmfpk -> answer 2021 in EVERY system (B1, B2, B3 wrongly said 2020).
      The data shows 2021's year-average deviation (3.58) > 2020's (2.24) AND the
      per-point max deviation is May '21 -> 2021 is correct by both readings; the
      validation expert plan had an arithmetic slip ("2.24-below > 3.58-above").
  (2) 10gtgmmgh599jnr7 B2 -> conclude 0.02 (= 0.106 - 0.086, the distinct 2nd-largest,
      matching Ours' rank:3). It currently highlights the duplicate 0.109 pair and
      shows a doubly-wrong "0.109 - 0.086 = 0.019".
Every edit asserts its target is present so a transcription slip fails loudly.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVAL = os.path.join(ROOT, 'evaluation')
BI = os.path.join(EVAL, 'baselines/baseline_input.json')
B2 = os.path.join(EVAL, 'baselines/B2/baseline2_result.json')
B3M = os.path.join(EVAL, 'baselines/B3/baseline3_manifest.json')


def repl(s, old, new, n=1, ctx=''):
    c = s.count(old)
    if c == 0 and s.count(new) >= n:
        return s  # idempotent: already applied
    assert c == n, f"[{ctx}] expected {n}x {old!r}, found {c}"
    return s.replace(old, new)


def dump(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


# ---------------------------------------------------------------- (1a) B1 ----
bi = json.load(open(BI))
e = bi['avwb8xstxx1lmfpk']
e['explanation'] = repl(e['explanation'],
                        'largest deviation, which is 2020.',
                        'largest deviation, which is 2021.',
                        ctx='B1 avwb8')
dump(BI, bi)

# ---------------------------------------------------------------- (1b) B3 ----
m = json.load(open(B3M))
fn4 = m['avwb8xstxx1lmfpk']['steps'][3]
assert fn4['fn'] == 'function4', fn4
fn4['text'] = ("The 2021 average is farther above the overall average than the 2020 "
               "average is below it, so 2021 has the biggest deviation from the total average.")
dump(B3M, m)

# ---------------------------------------------------------------- B2 load ----
b2 = json.load(open(B2))

# ---------------------------------------------------------------- (1c) B2 avwb8 scene 4 swap winner 2020 -> 2021 ----
sc = b2['gpt-5.2']['avwb8xstxx1lmfpk'][4]
sc['text_chunk'] = sc['text_chunk'].replace('which is 2020.', 'which is 2021.')
svg = sc['svg_code']

# winner avg (orange #f97316, wide, opaque) currently on 2020 -> move to 2021;
# 2020 reverts to its own muted color (#1d4ed8 blue), 2021 becomes the winner.
pairs = []
# --- avg-2020 winner -> loser ---
pairs.append((
 '<line class="avg-seg avg-2020" x1="18" x2="302" y1="228.21428571428572" y2="228.21428571428572" stroke="#f97316" stroke-width="5" stroke-linecap="round" opacity="1">',
 '<line class="avg-seg avg-2020" x1="18" x2="302" y1="228.21428571428572" y2="228.21428571428572" stroke="#1d4ed8" stroke-width="4" stroke-linecap="round" opacity="0.35">'))
pairs.append((
 '<rect class="avg-label-bg avg-2020" x="104" y="236.21428571428572" width="72" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.95" stroke="#f97316" stroke-width="1.5">',
 '<rect class="avg-label-bg avg-2020" x="104" y="236.21428571428572" width="72" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.75" stroke="#1d4ed8" stroke-width="1">'))
pairs.append((
 '<text class="avg-label avg-2020" x="140" y="249.21428571428572" text-anchor="middle" font-size="12" font-weight="800" fill="#f97316">',
 '<text class="avg-label avg-2020" x="140" y="249.21428571428572" text-anchor="middle" font-size="12" font-weight="700" fill="#1d4ed8" opacity="0.45">'))
# --- avg-2021 loser -> winner ---
pairs.append((
 '<line class="avg-seg avg-2021" x1="338" x2="502" y1="104.57142857142858" y2="104.57142857142858" stroke="#047857" stroke-width="4" stroke-linecap="round" opacity="0.35">',
 '<line class="avg-seg avg-2021" x1="338" x2="502" y1="104.57142857142858" y2="104.57142857142858" stroke="#f97316" stroke-width="5" stroke-linecap="round" opacity="1">'))
pairs.append((
 '<rect class="avg-label-bg avg-2021" x="384" y="112.57142857142858" width="72" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.75" stroke="#047857" stroke-width="1">',
 '<rect class="avg-label-bg avg-2021" x="384" y="112.57142857142858" width="72" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.95" stroke="#f97316" stroke-width="1.5">'))
pairs.append((
 '<text class="avg-label avg-2021" x="420" y="125.57142857142858" text-anchor="middle" font-size="12" font-weight="700" fill="#047857" opacity="0.45">',
 '<text class="avg-label avg-2021" x="420" y="125.57142857142858" text-anchor="middle" font-size="12" font-weight="800" fill="#f97316" opacity="1">'))
# --- dev-2020 winner(red) -> loser(gray) : line + 2 caps ---
pairs.append((
 '<line class="dev-line dev-2020" x1="286" x2="286" y1="173.0769230769231" y2="228.21428571428572" stroke="#ef4444" stroke-width="3" opacity="1">',
 '<line class="dev-line dev-2020" x1="286" x2="286" y1="173.0769230769231" y2="228.21428571428572" stroke="#6b7280" stroke-width="2" opacity="0.25">'))
pairs.append((
 '<line class="dev-cap dev-2020" x1="280" x2="292" y1="173.0769230769231" y2="173.0769230769231" stroke="#ef4444" stroke-width="3" opacity="1">',
 '<line class="dev-cap dev-2020" x1="280" x2="292" y1="173.0769230769231" y2="173.0769230769231" stroke="#6b7280" stroke-width="2" opacity="0.25">'))
pairs.append((
 '<line class="dev-cap dev-2020" x1="280" x2="292" y1="228.21428571428572" y2="228.21428571428572" stroke="#ef4444" stroke-width="3" opacity="1">',
 '<line class="dev-cap dev-2020" x1="280" x2="292" y1="228.21428571428572" y2="228.21428571428572" stroke="#6b7280" stroke-width="2" opacity="0.25">'))
pairs.append((
 '<rect class="dev-label-bg dev-2020" x="214" y="190.6456043956044" width="96" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.95" stroke="#ef4444" stroke-width="1.5">',
 '<rect class="dev-label-bg dev-2020" x="214" y="190.6456043956044" width="96" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.6" stroke="#6b7280" stroke-width="1">'))
pairs.append((
 '<text class="dev-label dev-2020" x="262" y="203.6456043956044" text-anchor="middle" font-size="12" font-weight="800" fill="#ef4444">',
 '<text class="dev-label dev-2020" x="262" y="203.6456043956044" text-anchor="middle" font-size="12" font-weight="700" fill="#6b7280" opacity="0.35">'))
# --- dev-2021 loser(gray) -> winner(red) : line + 2 caps ---
pairs.append((
 '<line class="dev-line dev-2021" x1="354" x2="354" y1="104.57142857142858" y2="173.0769230769231" stroke="#6b7280" stroke-width="2" opacity="0.25">',
 '<line class="dev-line dev-2021" x1="354" x2="354" y1="104.57142857142858" y2="173.0769230769231" stroke="#ef4444" stroke-width="3" opacity="1">'))
pairs.append((
 '<line class="dev-cap dev-2021" x1="348" x2="360" y1="104.57142857142858" y2="104.57142857142858" stroke="#6b7280" stroke-width="2" opacity="0.25">',
 '<line class="dev-cap dev-2021" x1="348" x2="360" y1="104.57142857142858" y2="104.57142857142858" stroke="#ef4444" stroke-width="3" opacity="1">'))
pairs.append((
 '<line class="dev-cap dev-2021" x1="348" x2="360" y1="173.0769230769231" y2="173.0769230769231" stroke="#6b7280" stroke-width="2" opacity="0.25">',
 '<line class="dev-cap dev-2021" x1="348" x2="360" y1="173.0769230769231" y2="173.0769230769231" stroke="#ef4444" stroke-width="3" opacity="1">'))
pairs.append((
 '<rect class="dev-label-bg dev-2021" x="362" y="129.82417582417582" width="96" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.6" stroke="#6b7280" stroke-width="1" >',
 '<rect class="dev-label-bg dev-2021" x="362" y="129.82417582417582" width="96" height="18" rx="4" ry="4" fill="#ffffff" opacity="0.95" stroke="#ef4444" stroke-width="1.5" >'))
pairs.append((
 '<text class="dev-label dev-2021" x="410" y="142.82417582417582" text-anchor="middle" font-size="12" font-weight="700" fill="#6b7280" opacity="0.35">',
 '<text class="dev-label dev-2021" x="410" y="142.82417582417582" text-anchor="middle" font-size="12" font-weight="800" fill="#ef4444" opacity="1">'))
# --- callout-largest: shift the whole badge +250 in x (over 2021) + relabel ---
pairs.append((
 '<path d="M70,58 L92,58 L104,74 L92,90 L70,90 Z" fill="#fff7ed" stroke="#f97316" stroke-width="2" opacity="0.98">',
 '<path d="M320,58 L342,58 L354,74 L342,90 L320,90 Z" fill="#fff7ed" stroke="#f97316" stroke-width="2" opacity="0.98">'))
pairs.append((
 '<text x="81" y="76" text-anchor="middle" font-size="12" font-weight="800" fill="#9a3412">Largest</text>',
 '<text x="331" y="76" text-anchor="middle" font-size="12" font-weight="800" fill="#9a3412">Largest</text>'))
pairs.append((
 '<text x="81" y="90" text-anchor="middle" font-size="12" font-weight="800" fill="#9a3412">deviation</text>',
 '<text x="331" y="90" text-anchor="middle" font-size="12" font-weight="800" fill="#9a3412">deviation</text>'))
pairs.append((
 '<rect x="108" y="64" width="150" height="22" rx="6" ry="6" fill="#fff7ed" stroke="#f97316" stroke-width="2" opacity="0.98"></rect>',
 '<rect x="358" y="64" width="150" height="22" rx="6" ry="6" fill="#fff7ed" stroke="#f97316" stroke-width="2" opacity="0.98"></rect>'))
pairs.append((
 '<text x="183" y="79" text-anchor="middle" font-size="13" font-weight="900" fill="#9a3412">Largest deviation: 2020</text>',
 '<text x="433" y="79" text-anchor="middle" font-size="13" font-weight="900" fill="#9a3412">Largest deviation: 2021</text>'))

for i, (old, new) in enumerate(pairs):
    svg = repl(svg, old, new, ctx=f'avwb8 s4 #{i}')
sc['svg_code'] = svg

# ---------------------------------------------------------------- (2) B2 10gtgmmgh scenes 1 & 2 -> 0.02 ----
scenes = b2['gpt-5.2']['10gtgmmgh599jnr7']
GREEN = 'fill="#10b981" opacity="1" stroke="#065f46" stroke-width="2"'
for idx in (1, 2):
    s = scenes[idx]
    svg = s['svg_code']
    # the duplicate 0.109 pair reverts to ordinary in-range indigo (do this first,
    # while only the two 0.109 circles carry the GREEN highlight)
    svg = repl(svg, GREEN, 'fill="#4f46e5" opacity="0.85"', n=2, ctx=f'10gt s{idx} 0.109->indigo')
    # 0.106 (2006) becomes the green 2nd-largest highlight
    svg = repl(svg,
               'cx="169" cy="174.00000000000006" r="5" fill="#4f46e5" opacity="0.85"',
               'cx="169" cy="174.00000000000006" r="5" ' + GREEN,
               ctx=f'10gt s{idx} 0.106->green')
    # leader + label point at 0.106 (2006), not the 0.109 pair
    svg = repl(svg, 'd="M104,156 L150,120"', 'd="M169,170 L160,128"', ctx=f'10gt s{idx} leader')
    svg = repl(svg, '>2nd max: 0.109 (2003/2004)<', '>2nd max: 0.106 (2006)<', ctx=f'10gt s{idx} label')
    s['svg_code'] = svg

# scene-2-only: diff bracket top moves to the 0.106 level, formula + caption -> 0.02
s2 = scenes[2]
svg = s2['svg_code']
svg = repl(svg, 'x1="60" x2="60" y1="294" y2="156"', 'x1="60" x2="60" y1="294" y2="174"', ctx='10gt s2 vline')
svg = repl(svg, 'x1="52" x2="68" y1="156" y2="156"', 'x1="52" x2="68" y1="174" y2="174"', ctx='10gt s2 cap')
svg = repl(svg, '>0.109 − 0.086 = 0.019<', '>0.106 − 0.086 = 0.02<', ctx='10gt s2 formula')
s2['svg_code'] = svg
s2['text_chunk'] = s2['text_chunk'].replace('difference of 0.019.', 'difference of 0.02.')

dump(B2, b2)
print("OK: B1+B3 avwb8 -> 2021; B2 avwb8 scene4 winner swapped to 2021; B2 10gtgmmgh -> 0.02 (0.106-0.086).")
