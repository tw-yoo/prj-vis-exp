# FINAL AUDIT - ground-truth operation_spec for human_explanation.csv

Pipeline: `scripts/he_specs.py` merges the hand-authored GOLD dict + `data/review/authored/*.json` into `data/review/human_explanation_filled.csv`; validated by `scripts/he_validate.py`; executed by the real nlp_server executor via `scripts/he_execute.py`.

## Totals
- Total: 240 = **197 filled specs + 43 GAP-null** (operation_spec empty). 0 rows left as `todo`.
- (Correction after this audit first ran: `7w9v4fsbg5ydxsr2` and `ahxo354yj7g4m6h1` — listed with blank reasons in the GAP table below — were subsequently authored and verified, so they are NOT gaps. True gap count = 43.)
- Re-verified: validate hard-errors = 0; real-executor ran_ok = 197, failed = 0, NaN/empty = 0.
- By chart type: bar_grouped 48, bar_simple 48, bar_stacked 48, line_multiple 48, line_simple 48.

## Validation gate
- Hard errors: 0 (error_codes: {}).
- Accepted warnings (non-blocking): `FIELD_NOT_COLUMN`=30, `SUM_ON_NONBAR`=5, `GROUP_NOT_SERIES_VAL`=2, `LAGDIFF_NONLINE`=2.

## Execution (real nlp_server executor)
- ran_ok: 195; failed: 0; GAP-null skipped (empty spec): 45.
- Unexpected empty/NaN among executed rows: 0.

## Op-usage tally (filled specs)

| op | count |
|---|---|
| filter | 169 |
| findExtremum | 99 |
| average | 79 |
| diff | 59 |
| retrieveValue | 54 |
| pairDiff | 44 |
| count | 29 |
| sum | 27 |
| add | 26 |
| compareBool | 24 |
| nth | 19 |
| sort | 15 |
| scale | 13 |
| lagDiff | 12 |
| monotonicRun | 6 |
| diffByValue | 3 |
| rollingWindow | 3 |
| range | 2 |

## GAP-null charts (45)

| chart_id | type | reason |
|---|---|---|
| `13guplcbmfu1tjzu` | bar_stacked | GAP: needs per-Country sum of two series (Germany+Italy) then max over countries (group-by-aggregate-then-extremum); not expressible in the 18-op grammar. |
| `0q8vqyb35mbq0efx` | bar_grouped | GAP: needs per-Year sum across Age Group series then min over years (group-by-aggregate-then-extremum); not expressible as one chain in the 18-op grammar. |
| `10x2rgiqw97wdspi` | bar_stacked | GAP: needs the season satisfying TWO separate per-series conditions (Commercial>its avg AND Broadcasting>its avg) = intersection of two key-sets; chaining filter(group=Commercial) then filter(group=Broadcasting) yields an empty set (no Broadcasting rows survive the first filter). No set-intersection-across-two-series op in the grammar. |
| `0gf8ugj84bs1ko2k` | bar_stacked | GAP: average across all series (the whole stack) within a single year that is itself selected by a sub-query (year of max Data Centers). Per-key aggregate across the stack + dynamic key selection; findExtremum returns one row so a following average just echoes that value, and a selected x-label cannot be fed back as a filter value. |
| `14jt6jor7iknkjkl` | line_multiple | GAP: explanation selects a multi-year region (2009-2011) where 'Favorable view of US' is lowest, then sums the *other* series ('Confidence in US president') over those years. findExtremum min yields a single x, and there is no op to carry an x-set from one series to sum another series. |
| `0ix8hz9qvakto18g` | line_simple | GAP: final step adds two x-axis YEAR labels (year of 2nd-largest score + year of 2nd-smallest score); add operates on measure values, not x labels — not expressible. |
| `1p4nnba4568wza9n` | line_multiple | GAP: counting how many times the dominant (>50%) opinion flips between Good and Bad year-over-year; no op counts changes-of-dominance / sign-flips of a per-year comparison. |
| `0opt5fjw2xphdgp2` | bar_grouped | GAP: per-group (Race/Ethnicity) sum of two selected x-categories (Occasionally + Infrequently) then max over groups -> per-key aggregate over a selected subset of categories then select; no group-by-aggregate op in the 18-op grammar. (Not a Total series.) |
| `05qg5ubxklojfze7` | bar_stacked | GAP: per-x (per-problem) sum of two series (Major+Minor) then max over problems — group-by-key-aggregate-then-extremum; not expressible (sum collapses across all keys). |
| `14jud3ymyoonba4e` | bar_stacked | GAP: per-series total across all years then max over series (which series sums highest) — group-by-series-aggregate-then-extremum; not expressible in the 18-op grammar. |
| `2hjkdo5w242alvjd` | line_multiple | GAP: compares the fixed window 2006-2011 length against the count of satisfied-dominant years; the final boolean hinges on an external constant ('greater than 3') not derived from the data. |
| `0w5jptak9peti0mj` | bar_grouped | GAP: count years where APAC is the lowest of the three regions -> per-year min (group-by Year, min over Region) then membership test (is it APAC?) then count. No group-by-extremum nor per-key argmin op in the 18-op grammar. |
| `19xwo5oscmgpcdyl` | bar_stacked | GAP: select years where one series exceeds a threshold, then average a DIFFERENT series over those years (cross-series conditional aggregate). After filter(group=A,>v) the working set has only series-A rows, so series-B cannot be averaged over the selected years. (Q/E also use field names not present in this chart's series: Coal/Gas/Oil.) |
| `19msoowya2szdynd` | bar_stacked | GAP: per-year cross-series comparison (Gas > Oil/3) to select years, then sum a third series (Coal) over them; per-key cross-series condition + aggregate-of-other-series; not expressible. |
| `3tc31k5k2o6wmvyp` | line_multiple | GAP: needs the per-date SUM of the two series (Dem+Rep) then count dates where that total < 70. pairDiff yields differences not sums, and there is no per-row cross-series sum op. |
| `0xo3r87obscjsktm` | bar_simple | GAP: final step divides the larger diff by the smaller diff (ratio of two differences). No divide/ratio-of-two-node-results op (scale needs a constant factor, not a ref). Not expressible. |
| `0ykydh8vao50ceou` | bar_grouped | GAP: per-channel range (max-min over years for each Channel) then select the channel with the largest range -> per-key range then argmax over keys; no group-by-aggregate op. (range op aggregates over the whole field, not per channel; channel is the x dimension here.) |
| `0zjxkqy20iibpdvo` | bar_grouped | GAP: avg of Female on platforms where Male>Female minus avg of Male on platforms where Female>Male. Requires per-platform cross-series comparison to select platform subsets, then average the OTHER series over those subsets -> conditional per-key membership plus cross-group aggregation, not expressible in the 18-op grammar (pairDiff yields the diff, but selecting the opposite series' values by that sign for a separate average is not supported). |
| `3un2wyjae3ebkncl` | line_multiple | GAP: keep years where Internet value is above Radio AND below Newspaper that same year, then average Internet. This is a per-row comparison across three series; filter only compares a column to a constant/series-value, not another series at the same x. |
| `1y6itl6f2ho959ec` | bar_stacked | GAP: count of countries satisfying TWO per-series conditions simultaneously (Disapproves>Chile AND No answer>Chile). Chaining filter(group=Disapproves) then filter(group='No answer') gives an empty intersection; no cross-series AND-filter in the grammar. |
| `2a8mliwolqqo6s5u` | bar_stacked | GAP: per-year diff between one series and the SUM of the other three series, then min over years; per-key aggregate across multiple series + per-key selection; not expressible. |
| `1a6pxfig1xf4oeu3` | bar_simple | GAP: answer is a PERIOD (first & last year with franchise value <=200M), i.e. a [startX,endX] span of x labels, not a measure aggregate. No op returns a period span. |
| `7w9v4fsbg5ydxsr2` | line_simple |  |
| `2mi8b2r0oalayl6g` | bar_stacked | GAP: per-year sum of two series (Footjoy golf wear + Titleist golf gear) then min over years; group-by-key-aggregate-then-extremum. |
| `1bywaj7stsb3060c` | bar_simple | GAP: filter predicate is on a property of the x label string ('5 or fewer letters in name') — string-length test on category labels, not a measure filter or positional slice. Not expressible. |
| `1fngt6cb1d60a2ow` | bar_simple | GAP: requires compareBool of a single summed value against the constant 50000. compareBool needs two node refs (targetA/targetB both 'ref:nN'); there is no op producing the scalar 50000 to compare against (no literal-injection op). filter(exclude=['Metro Total'])+sum is expressible but the final constant comparison is not. (Also 'Metro Total' is likely a precomputed total bar, making the sum double-count.) |
| `1e56qqj7moat9gqa` | bar_simple | GAP: explanation 'find the same value for Spending and add the corresponding values' is underspecified/garbled (no clear selection criterion). Not deterministically mappable. |
| `1esx2fbduhqn7knk` | bar_simple | GAP: average after removing the single max row and single min row (trimmed mean). Dropping the argmax/argmin rows is not expressible (filter is by value/position thresholds, not 'remove the extremum row'; with duplicate values a value-filter would over-remove). No trimmed-mean op. |
| `9douccar3m9ruah4` | line_simple | GAP: data/question mismatch - chart data is Year/E-commerce-share but the question asks about survey responses (Men/Women/All Results 'Not at all') absent from this chart's data. |
| `9u3xwiltv2hlcqq1` | line_multiple | GAP: qualitative trend/inverse-correlation reasoning with inflection points; no correlation/trend-relationship op in the grammar. |
| `aoycx517slbw0ifa` | bar_stacked | GAP: per-series sum over a year range (2015-2018) then max over divisions; group-by-series-aggregate-then-extremum. (Also asks a second quantity, the winner's total.) |
| `amn6abwhwmc7ksaz` | line_simple | GAP: explanation defines a year's change as the sum of its 4 quarterly changes, then max year — per-year aggregate of quarterly deltas (no Year column; group-by-aggregate) not expressible. |
| `ay58pwlf97q0osw6` | bar_stacked | GAP: per-series range (max-min over seasons) then max over the series; range applies to one slice and there is no per-series range-then-extremum chain. |
| `bfi0ia7zx8pjb5g8` | bar_stacked | GAP: per-year sum of two series then count years above a threshold; sum(group=[A,B]) collapses to one total across all years, so per-year granularity is lost and years cannot be counted. |
| `ahxo354yj7g4m6h1` | line_simple |  |
| `apsxmes1emdu9vtk` | bar_stacked | GAP: 'most steady' = the series with the smallest range over years (per-series range then min over series), then read that series' 2018 value; per-series-aggregate-then-select not expressible. |
| `2a7luy1tzrplr2as` | bar_grouped | GAP: count fiscal years where the per-year TOTAL rice export (Basmati + Non-basmati) exceeds 6B -> per-key (Fiscal Year) sum across the two series then threshold-count. No group-by-aggregate op; bare sum would total all rows, not per year. (No Total series.) |
| `2ecy6apyrdfpoqbo` | bar_grouped | GAP: count fiscal years where Beer < (Soft drink + Hot dog) -> per-year sum of two series compared against a third series per year, then count -> per-key conditional comparison across series; not expressible (pairDiff handles two series, not 'sum of two vs a third'). |
| `87b7sitfbe4ttuns` | bar_stacked | GAP: per-restaurant-type sum of two 'active' series and two 'inactive' series, their per-key difference, then count keys with /diff/<1.0; per-key aggregate across series then count; not expressible (sums collapse across keys). |
| `20lb7iojghs85r21` | bar_grouped | GAP: per-year pick the two smallest of the three grades, diff them, then select the year with the biggest such diff -> per-key bottom-2 selection then diff then argmax over keys; no group-by-aggregate / per-key rank op in the 18-op grammar. |
| `7iy5s09teyeaybzy` | line_multiple | GAP: needs the per-year SUM of female+male life expectancy, the average of those sums, then the year closest to it. No op forms a per-row cross-series sum to aggregate over. |
| `21klhgimadx4zsi9` | bar_grouped | GAP: year with the most revenue across all sectors -> per-year sum over Sector series then argmax over years; group-by-aggregate-then-extremum, not expressible in the 18-op grammar. (No Total sector.) |
| `a7byilpdrc3cbjr4` | bar_stacked | GAP: per-country argmax/2nd-argmax across the three opinion series (Keep the same = rank1, Decrease = rank2), then count such countries; per-key ranking-across-series condition not expressible (pairDiff>0 would only check Keep>Decrease, not the full ordering). |
| `7mw5410egrxfi2oy` | line_multiple | GAP: drop the two years that are the per-series maxima (argmax Favorable year and argmax Unfavorable year), then average the remaining gaps. filter/exclude take literal x labels; the years to exclude are computed argmaxima that cannot be fed back into exclude. |
| `90tonvacpe7zniv9` | bar_stacked | GAP: requires a gender attribute (not a column in this chart) to subset figures, then a per-series argmax across that subset; neither the gender filter nor per-key argmax-over-series is expressible. |

## Stratified spot-check sample (~3 per chart type)

| chart_id | type | question | final | answer |
|---|---|---|---|---|
| `2jromeq5u9lloh1s` | line_simple | Which years has the biggest jump? | scalar | 12.1 |
| `0o12tngadmjjux2n` | bar_simple | How many years are above the average? | rows | 9 rows: [{'t': '2002', 'v': 2.89}, {'t': '2003', 'v': 2.93}, {'t': '2004', 'v': 3.0}, {'t': '2005', 'v': 2.98}, {'t': '2006', 'v': 2.96}] |
| `10t8o5vhethzeod1` | bar_stacked | In which year was the agriculture sector the highest | scalar | 0.3498 |
| `2o3fyauxv32p571i` | line_simple | Which year had the second-lowest value? | scalar | 0.14 |
| `11e148qcs7x70t8v` | bar_stacked | in which years does south korea have a bigger value than france? | rows | 4 rows: [{'t': '2016', 'v': 0.036}, {'t': '2017', 'v': 0.078}, {'t': '2018', 'v': 0.111}, {'t': 'Jan-Oct 2019', 'v': 0.065}] |
| `0s6zi9dyw22qo4rp` | bar_simple | What is the difference between the average of September 1896 until December 1896 and the average of January 1897 until April 1897? | scalar | 0.0735 |
| `2ebtadc07b7bo277` | line_simple | Which year had the second lowest value? | scalar | 3.74 |
| `0prhtod4tli879nh` | bar_grouped | Which city had the biggest jump in population from 2010 to 2025? | scalar | 6.4 |
| `0pzdf7hfbxgjghsa` | bar_simple | How big was the change from 2016 to 2017 compared to the change from 2017 to 2018? | scalar | 1.17 |
| `0rfuaawgi58ajpsv` | bar_grouped | What is the difference in the average between North America and Latin America? | scalar | 8.422 |
| `0rdpculfpyw3bv5p` | bar_grouped | Which year shows the lowest gap between lending and investment? | scalar | 0.41 |
| `23wg8zio5ahp40tg` | line_multiple | Which year had the biggest gap between favor and oppose? | scalar | 38.0 |
| `28bxxhd6omv2l2h1` | line_multiple | What is the difference between the maximum and minimum gap between the two groups? | scalar | 0.8 |
| `29rxoltwhongoday` | line_multiple | In 2002 and 2017, which year shows the highest gap between two opinion? | scalar | 72.0 |
| `0dglnk2wbf5ll15t` | bar_stacked | What is the difference between the average of values corresponding to Poor and the average of values corresponding to Good? | scalar | 48.25 |

