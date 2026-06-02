#!/usr/bin/env python3
"""Hand-authored ground-truth operation specs for human_explanation.csv.

GOLD[chart_id] = (spec | None, author_note)
  - spec  = {"ops":[...], "ops2":[...], ...}  (None = intentionally empty/unmappable)
  - mk() fills id/meta(nodeId,inputs,sentenceIndex) so id == nodeId always.

Run this module to (re)generate data/review/human_explanation_filled.csv from GOLD
+ the source CSV. Resumable & deterministic: GOLD is the source of truth.

Refs: scalar cross-node values are the string "ref:nN"; list them in inputs=[...]
(integers -> "nN"). Op contract = nlp_server/opsspec/runtime/op_registry.py (18 ops).
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "review" / "human_explanation.csv"
OUT = ROOT / "data" / "review" / "human_explanation_filled.csv"
COLS = ["#", "chart_type", "chart_id", "all_id", "question", "explanation",
        "operation_spec", "status", "author_note", "updated_at"]


def mk(op, nid, inputs=(), sent=1, **fields):
    d = {"op": op, "id": f"n{nid}",
         "meta": {"nodeId": f"n{nid}", "inputs": [f"n{j}" for j in inputs], "sentenceIndex": sent}}
    d.update(fields)
    return d


# ── Calibration batch (15 charts: 5 chart types × 3) ───────────────────────────
GOLD: dict[str, tuple] = {}

# line_simple ------------------------------------------------------------------
GOLD["2jromeq5u9lloh1s"] = (  # "Which years has the biggest jump?"
    {"ops": [mk("lagDiff", 1, sent=1, field="Audience_Millions")],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]},
    "")
GOLD["6al86e9qyokma74i"] = (  # "How many years are below average?"
    {"ops": [mk("average", 1, sent=1, field="Number of renunciations")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Number of renunciations", operator="<", value="ref:n1"),
              mk("count", 3, [2], sent=2)]},
    "")
GOLD["avwb8xstxx1lmfpk"] = (  # "Year with the biggest deviation from the total average?"
    {"ops": [mk("average", 1, sent=1, field="Consumer Price Index (100 = 1982-1984)")],
     "ops2": [mk("diffByValue", 2, [1], sent=2, targetValue="ref:n1", signed=False,
                 field="Consumer Price Index (100 = 1982-1984)")],
     "ops3": [mk("findExtremum", 3, [2], sent=3, which="max")]},
    "Explanation says 'standard deviation' but means per-point deviation from the mean; "
    "mapped to diffByValue(|x-mean|) then max (true std-dev not in grammar).")

# bar_simple -------------------------------------------------------------------
GOLD["0o12tngadmjjux2n"] = (  # "How many years are above the average?"
    {"ops": [mk("average", 1, sent=1, field="Production in million units")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Production in million units",
                 operator=">", value="ref:n1")]},
    "Explanation has 2 steps (average, filter); final count left implicit per the text.")
GOLD["0pzdf7hfbxgjghsa"] = (  # "change 2016->2017 vs change 2017->2018"
    {"ops": [mk("retrieveValue", 1, sent=1, target="2016"),
             mk("retrieveValue", 2, sent=1, target="2017"),
             mk("diff", 3, [1, 2], sent=1, targetA="ref:n1", targetB="ref:n2", signed=False)],
     "ops2": [mk("retrieveValue", 4, sent=2, target="2017"),
              mk("retrieveValue", 5, sent=2, target="2018"),
              mk("diff", 6, [4, 5], sent=2, targetA="ref:n4", targetB="ref:n5", signed=False)],
     "ops3": [mk("diff", 7, [3, 6], sent=3, targetA="ref:n3", targetB="ref:n6", signed=False)]},
    "")
GOLD["0baf5ch9y4z8914p"] = (  # "average of the three lowest rate values"
    {"ops": [mk("findExtremum", 1, sent=1, which="min", rank=1, field="Monetary policy rate (%)"),
             mk("findExtremum", 2, sent=1, which="min", rank=2, field="Monetary policy rate (%)"),
             mk("findExtremum", 3, sent=1, which="min", rank=3, field="Monetary policy rate (%)")],
     "ops2": [mk("add", 4, [1, 2], sent=2, targetA="ref:n1", targetB="ref:n2"),
              mk("add", 5, [4, 3], sent=2, targetA="ref:n4", targetB="ref:n3")],
     "ops3": [mk("scale", 6, [5], sent=3, target="ref:n5", factor=0.3333333333333333)]},
    "avg of 3 lowest via findExtremum(min, rank 1..3) + add + scale(1/3); executes exactly "
    "(the executor's nth-list returns only the first rank, so rank-based is used instead).")

# bar_grouped ------------------------------------------------------------------
GOLD["0q8vqyb35mbq0efx"] = (  # "Which year had the lowest suicides of all ages combined?"
    None,
    "GAP: needs per-Year sum across Age Group series then min over years "
    "(group-by-aggregate-then-extremum); not expressible as one chain in the 18-op grammar.")
GOLD["0k75gqf8ckjikdym"] = (  # "year with lowest difference between men & women age"
    {"ops": [mk("pairDiff", 1, sent=1, by="Year", groupA="Male", groupB="Female",
                seriesField="Gender", field="Average age at marriage", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="min")]},
    "")
GOLD["23bplnbw291p6nil"] = (  # "how much less women's vs men's earning in 50-59"
    # Inverse-orientation grouped bar (primary_dimension == series_field == Gender):
    # retrieveValue(target,group) yields NaN. Filter the Age_Group cell, then pairDiff
    # Male-Female. Executes to 8427 (Male 36983 - Female 28556); the explanation's "4000"
    # is the human's eyeball estimate.
    {"ops": [mk("filter", 1, field="Age_Group", include=["50 to 59"])],
     "ops2": [mk("pairDiff", 2, [1], sent=2, by="Age_Group", seriesField="Gender",
                 groupA="Male", groupB="Female", field="Median_Annual_Pay_GBP", signed=True)]},
    "")

# bar_stacked ------------------------------------------------------------------
GOLD["13guplcbmfu1tjzu"] = (  # "country with highest european factor (Germany+Italy sum)"
    None,
    "GAP: needs per-Country sum of two series (Germany+Italy) then max over countries "
    "(group-by-aggregate-then-extremum); not expressible in the 18-op grammar.")
GOLD["10t8o5vhethzeod1"] = (  # "which year was agriculture sector the highest"
    {"ops": [mk("filter", 1, sent=1, group="Agriculture")],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max", field="Share_of_GDP")]},
    "")
GOLD["001dao0mq0pplbzj"] = (  # "year with biggest diff between commercial and matchday"
    {"ops": [mk("pairDiff", 1, sent=1, by="Year", groupA="Commercial", groupB="Matchday",
                seriesField="Revenue_Type", field="Revenue_Million_USD", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]},
    "")

# line_multiple ----------------------------------------------------------------
GOLD["23wg8zio5ahp40tg"] = (  # "year with biggest gap between favor and oppose"
    {"ops": [mk("pairDiff", 1, sent=1, by="Year", groupA="Favor", groupB="Oppose",
                seriesField="Opinion", field="Percentage", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]},
    "")
GOLD["1vh62ks9wweck6m2"] = (  # "year men & women most similar stress"
    {"ops": [mk("pairDiff", 1, sent=1, by="Year", groupA="Men", groupB="Women",
                seriesField="Gender", field="Level_of_Stress", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="min")]},
    "")
GOLD["9u3xwiltv2hlcqq1"] = (  # garbled "inverse relationship ... generalize"
    None,
    "GAP: qualitative trend/inverse-correlation reasoning with inflection points; "
    "no correlation/trend-relationship op in the grammar.")


# ── line_simple batch (rows 6-125) ───────────────────────────────────────────
GOLD["2o3fyauxv32p571i"] = (  # second-lowest value
    {"ops": [mk("sort", 1, field="Operating_Profit_Margin", order="asc")],
     "ops2": [mk("nth", 2, [1], sent=2, n=2)]}, "")
GOLD["2ebtadc07b7bo277"] = (  # second lowest value
    {"ops": [mk("sort", 1, field="Average price in US dollars", order="asc")],
     "ops2": [mk("nth", 2, [1], sent=2, n=2)]}, "")
GOLD["2jki13q54zizc6i4"] = (  # compare avg of two periods, which higher
    {"ops": [mk("filter", 1, field="Period", operator="between",
                value=["Jul 2008 - Jun 2009", "Jul 2011 - Jun 2012"]),
             mk("average", 2, [1], field="Number of trucks")],
     "ops2": [mk("filter", 3, sent=2, field="Period", operator="between",
                 value=["Jul 2013 - Jun 2014", "Jul 2016 - Jun 2017"]),
              mk("average", 4, [3], sent=2, field="Number of trucks")],
     "ops3": [mk("compareBool", 5, [2, 4], sent=3, operator=">", targetA="ref:n2", targetB="ref:n4")]},
    "compare+find-extremum answered by compareBool(avg1 > avg2).")
GOLD["10gtgmmgh599jnr7"] = (  # diff(2nd largest, smallest) in 2000-2009
    {"ops": [mk("filter", 1, field="Year", operator="between", value=["2000", "2009"]),
             mk("findExtremum", 2, [1], which="max", field="Percentage_of_Population")],
     "ops2": [mk("filter", 3, sent=2, field="Year", operator="between", value=["2000", "2009"]),
              mk("findExtremum", 4, [3], sent=2, which="max", rank=2, field="Percentage_of_Population")],
     "ops3": [mk("filter", 5, sent=3, field="Year", operator="between", value=["2000", "2009"]),
              mk("findExtremum", 6, [5], sent=3, which="min", field="Percentage_of_Population")],
     "ops4": [mk("diff", 7, [4, 6], sent=4, targetA="ref:n4", targetB="ref:n6", signed=False)]},
    "Explanation scopes 2000-2009 (Q says 2008) — followed the explanation. Step1 'largest' is "
    "scaffolding; answer = 2nd largest - smallest.")
GOLD["0ix8hz9qvakto18g"] = (  # sum of two YEAR labels
    None,
    "GAP: final step adds two x-axis YEAR labels (year of 2nd-largest score + year of 2nd-smallest "
    "score); add operates on measure values, not x labels — not expressible.")
GOLD["0roec4s0drcyiuz4"] = (  # avg over longest decreasing run
    {"ops": [mk("monotonicRun", 1, direction="decreasing", minLength=3,
                field="Unemployment rate (%)", orderField="Quarter")],
     "ops2": [mk("average", 2, [1], sent=2, field="Unemployment rate (%)")]},
    "'falls for more than two years' -> longest decreasing run, then average.")
GOLD["1c80b6i7wdu3m1ir"] = (  # sum y-values over sharpest increasing run
    {"ops": [mk("monotonicRun", 1, direction="increasing", minLength=2,
                field="Year on yaer percentage change (%)", orderField="Year")],
     "ops2": [mk("sum", 2, [1], sent=2, field="Year on yaer percentage change (%)")]},
    "'increased most sharply for 2+ years' approximated by the longest increasing run; then sum.")
GOLD["1jabqwjz9pmd7qwz"] = (  # median of 10 filtered values (even n)
    {"ops": [mk("filter", 1, field="Year", operator="between", value=["2010", "2019"])],
     "ops2": [mk("sort", 2, [1], sent=2, field="Number of facilities", order="asc"),
              mk("nth", 3, [2], sent=2, n=5),
              mk("nth", 4, [2], sent=2, n=6),
              mk("add", 5, [3, 4], sent=2, targetA="ref:n3", targetB="ref:n4"),
              mk("scale", 6, [5], sent=2, target="ref:n5", factor=0.5)]},
    "median of 10 filtered values = mean of 5th & 6th ascending.")
GOLD["1sf5c8wqw1192q6b"] = (  # how many dates below average
    {"ops": [mk("average", 1, field="Growth rate of HICP (%)")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Growth rate of HICP (%)", operator="<", value="ref:n1")],
     "ops3": [mk("count", 3, [2], sent=3)]}, "")
GOLD["1vni31fp2ii7wz68"] = (  # highest drop
    {"ops": [mk("lagDiff", 1, field="Number in millions")],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="min")]},
    "highest drop = most negative year-over-year change.")
GOLD["25gpdzxh8nu0c0vf"] = (  # avg vs median, which bigger (odd n=21)
    {"ops": [mk("average", 1, field="Number_of_Fatalities")],
     "ops2": [mk("sort", 2, sent=2, field="Number_of_Fatalities", order="asc"),
              mk("nth", 3, [2], sent=2, n=11)],
     "ops3": [mk("compareBool", 4, [1, 3], sent=3, operator=">", targetA="ref:n1", targetB="ref:n3")]},
    "median of 21 (odd) = 11th ascending value; compareBool(avg > median).")
GOLD["04xwv56n37ybj8zr"] = (  # diff(3rd highest, 5th highest)
    {"ops": [mk("sort", 1, field="Index_Score", order="desc")],
     "ops2": [mk("nth", 2, [1], sent=2, n=3), mk("nth", 3, [1], sent=2, n=5)],
     "ops3": [mk("diff", 4, [2, 3], sent=3, targetA="ref:n2", targetB="ref:n3", signed=False)]}, "")
GOLD["0cymcilknp8krjwz"] = (  # diff(sum>4.0, sum<2.5)
    {"ops": [mk("filter", 1, field="Average price in US dollars", operator=">", value=4.0),
             mk("sum", 2, [1], field="Average price in US dollars")],
     "ops2": [mk("filter", 3, sent=2, field="Average price in US dollars", operator="<", value=2.5),
              mk("sum", 4, [3], sent=2, field="Average price in US dollars")],
     "ops3": [mk("diff", 5, [2, 4], sent=3, targetA="ref:n2", targetB="ref:n4", signed=False)]}, "")
GOLD["0gr1c2jcthc8h9f6"] = (  # diff(year w/ score 5.8-6.2, year w/ score<4.8)
    {"ops": [mk("filter", 1, field="Risk index score", operator=">=", value=5.8),
             mk("filter", 2, [1], field="Risk index score", operator="<=", value=6.2),
             mk("findExtremum", 3, [2], which="max", field="Risk index score")],
     "ops2": [mk("filter", 4, sent=2, field="Risk index score", operator="<", value=4.8),
              mk("findExtremum", 5, [4], sent=2, which="max", field="Risk index score")],
     "ops3": [mk("diff", 6, [3, 5], sent=3, targetA="ref:n3", targetB="ref:n5", signed=False)]}, "")
GOLD["08x3crju85yix5ab"] = (  # how many years score below 80
    {"ops": [mk("filter", 1, field="CPI_Score", operator="<", value=80)],
     "ops2": [mk("count", 2, [1], sent=2)]}, "")
GOLD["5lhrulhnl0io2r81"] = (  # how many months PPI < 210
    {"ops": [mk("filter", 1, field="Producer Price Index (100=2009)", operator="<", value=210)],
     "ops2": [mk("count", 2, [1], sent=2)]}, "")
GOLD["5po479f2ju9lqv16"] = (  # total 2011-2017
    {"ops": [mk("filter", 1, field="Year", operator="between", value=["2011", "2017"])],
     "ops2": [mk("sum", 2, [1], sent=2, field="Inhabitants in billions")]}, "")
GOLD["651x1l1swysyy6vp"] = (  # date of 5th highest percentage
    {"ops": [mk("sort", 1, field="Share of respondents who are worried", order="desc")],
     "ops2": [mk("nth", 2, [1], sent=2, n=5)]}, "")
GOLD["66va2s35es5t86l3"] = (  # year with largest increase vs previous
    {"ops": [mk("lagDiff", 1, field="In millions")],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]}, "")
GOLD["72yqb8jwj9a6g4nx"] = (  # diff(avg 2011+, avg <=2010)
    {"ops": [mk("filter", 1, field="Year", operator="<=", value="2010"),
             mk("average", 2, [1], field="Percentage of internet users")],
     "ops2": [mk("filter", 3, sent=2, field="Year", operator=">=", value="2011"),
              mk("average", 4, [3], sent=2, field="Percentage of internet users")],
     "ops3": [mk("diff", 5, [4, 2], sent=3, targetA="ref:n4", targetB="ref:n2", signed=False)]}, "")
GOLD["724mfnyk34kp97le"] = (  # how many years below average
    {"ops": [mk("average", 1, field="Cinema visits in millions")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Cinema visits in millions", operator="<", value="ref:n1")],
     "ops3": [mk("count", 3, [2], sent=3)]}, "")
GOLD["7272hodb02i6e09q"] = (  # diff(max before 2014, max after 2014)
    {"ops": [mk("filter", 1, field="Year", operator="<", value="2014"),
             mk("findExtremum", 2, [1], which="max", field="Population growth compared to previous year")],
     "ops2": [mk("filter", 3, sent=2, field="Year", operator=">", value="2014"),
              mk("findExtremum", 4, [3], sent=2, which="max", field="Population growth compared to previous year")],
     "ops3": [mk("diff", 5, [2, 4], sent=3, targetA="ref:n2", targetB="ref:n4", signed=False)]}, "")
GOLD["74p313e1n8rzkfzp"] = (  # adjacent age-group pair with largest diff
    {"ops": [mk("lagDiff", 1, field="Share of respondents", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]},
    "largest difference between adjacent age groups -> |lagDiff| then max.")
GOLD["7mgydgux0ay0flv4"] = (  # highest 3-year average sales
    {"ops": [mk("rollingWindow", 1, window=3, aggregate="avg", field="Number of units sold")],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]}, "")


GOLD["8e9wp443ff1i6snq"] = (  # year with biggest |diff| from following year
    {"ops": [mk("lagDiff", 1, field="Number of enterprises", absolute=True)],
     "ops2": [mk("findExtremum", 2, [1], sent=2, which="max")]}, "")
GOLD["82aqt0k0jnbj3irf"] = (  # "year of the fifth value" (explanation's median proxy)
    {"ops": [mk("sort", 1, field="Number of enterprises", order="asc")],
     "ops2": [mk("nth", 2, [1], sent=2, n=5)]},
    "Explanation defines the median as the 5th ascending value; followed it literally.")
GOLD["8chfa8n079zpfigi"] = (  # how many years value in 20..30
    {"ops": [mk("filter", 1, field="Number of enterprises", operator=">=", value=20),
             mk("filter", 2, [1], field="Number of enterprises", operator="<=", value=30)],
     "ops2": [mk("count", 3, [2], sent=2)]},
    "'between 20 and 30' = measure value range -> two comparison filters (AND).")
GOLD["827lhm2w7n652knp"] = (  # count year-over-year declines
    {"ops": [mk("lagDiff", 1, field="Number of enterprises")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Number of enterprises", operator="<", value=0),
              mk("count", 3, [2], sent=2)]},
    "increasing->decreasing turn counted as negative year-over-year differences.")
GOLD["8hiwwys6qkrbtapb"] = (  # diff(avg before 2010, avg since 2010)
    # Year labels are fiscal-year strings ("2002/03".."2019/20"), so operator "<"/">="
    # crashes float("2002/03"). Use positional between row-slices instead:
    # before = 2002/03..2009/10, since = 2010/11..2019/20. Executes to 12.6.
    {"ops": [mk("filter", 1, field="Year", operator="between", value=["2002/03", "2009/10"]),
             mk("average", 2, [1], field="Crime rate")],
     "ops2": [mk("filter", 3, sent=2, field="Year", operator="between", value=["2010/11", "2019/20"]),
              mk("average", 4, [3], sent=2, field="Crime rate")],
     "ops3": [mk("diff", 5, [2, 4], sent=3, targetA="ref:n2", targetB="ref:n4", signed=False)]}, "")
GOLD["95wcyze391ifhegp"] = (  # average of highest and lowest
    {"ops": [mk("findExtremum", 1, which="max", field="Value"),
             mk("findExtremum", 2, which="min", field="Value")],
     "ops2": [mk("add", 3, [1, 2], sent=2, targetA="ref:n1", targetB="ref:n2"),
              mk("scale", 4, [3], sent=2, target="ref:n3", factor=0.5)]}, "")


GOLD["9douccar3m9ruah4"] = (  # avg(Men,Women) > All Results?
    # GAP: data/question mismatch. This chart's actual data is Year / "E-commerce sales
    # share" (single-series line), but the question + explanation are about a survey
    # ("Men/Women/All Results - Not at all"). No "Response" column or those entities exist
    # in this chart's data, so the question is unanswerable against it (prior spec ran empty).
    None,
    "GAP: data/question mismatch - chart data is Year/E-commerce-share but the question asks "
    "about survey responses (Men/Women/All Results 'Not at all') absent from this chart's data.")
GOLD["9mlpjn6pddrbthj8"] = (  # 3rd ascending value > avg(2011,2012)?
    {"ops": [mk("sort", 1, field="Value", order="asc"), mk("nth", 2, [1], n=3)],
     "ops2": [mk("filter", 3, sent=2, field="Year", operator="between", value=["2011", "2012"]),
              mk("average", 4, [3], sent=2, field="Value")],
     "ops3": [mk("compareBool", 5, [2, 4], sent=3, operator=">", targetA="ref:n2", targetB="ref:n4")]}, "")
GOLD["9r7co7yl1osn3zg4"] = (  # how many years export > avg
    {"ops": [mk("average", 1, field="Export value in billions")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Export value in billions", operator=">", value="ref:n1")],
     "ops3": [mk("count", 3, [2], sent=3)]}, "")
GOLD["a6gnu78mgn3xmqhu"] = (  # how many years index < avg
    {"ops": [mk("average", 1, field="Index score")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Index score", operator="<", value="ref:n1"),
              mk("count", 3, [2], sent=2)]}, "")
GOLD["ae2xp7bacbbs0kmx"] = (  # how many months index < avg
    {"ops": [mk("average", 1, field="Index")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Index", operator="<", value="ref:n1"),
              mk("count", 3, [2], sent=2)]}, "")
GOLD["9r3kyy2jo2o66msh"] = (  # month with biggest increase vs prev, except April
    {"ops": [mk("lagDiff", 1, field="Number of femicides")],
     "ops2": [mk("filter", 2, [1], sent=2, exclude=["April"]),
              mk("findExtremum", 3, [2], sent=2, which="max")]},
    "biggest positive month-over-month increase, excluding April. (Month order is lexical in the executor.)")


GOLD["albgfrf44bz6134k"] = (  # average annual increase
    {"ops": [mk("lagDiff", 1, field="Number of inhabitants"),
             mk("average", 2, [1], field="Number of inhabitants")]},
    "computes the average annual increase (avg of year-over-year deltas); the 'same as any "
    "increase' (steady-slope) part is a qualitative observation, not expressible.")
GOLD["aqowly2mmavof3f1"] = (  # longest continuous decrease
    {"ops": [mk("monotonicRun", 1, direction="decreasing", field="Unemployment rate", orderField="Year")]}, "")
GOLD["amn6abwhwmc7ksaz"] = (  # year with greatest total change across its 4 quarters
    None,
    "GAP: explanation defines a year's change as the sum of its 4 quarterly changes, then max "
    "year — per-year aggregate of quarterly deltas (no Year column; group-by-aggregate) not expressible.")
GOLD["b8um9hhxelrqowd9"] = (  # is 2010 value > average
    {"ops": [mk("average", 1, field="Value")],
     "ops2": [mk("retrieveValue", 2, sent=2, field="Year", target="2010"),
              mk("compareBool", 3, [2, 1], sent=2, operator=">", targetA="ref:n2", targetB="ref:n1")]}, "")
GOLD["awg12vb36ndo75tq"] = (  # does poverty rise faster in last 6 vs first 6 years
    {"ops": [mk("filter", 1, field="Year", operator="between", value=["2008", "2013"]),
             mk("lagDiff", 2, [1], field="Poverty rate"),
             mk("average", 3, [2], field="Poverty rate")],
     "ops2": [mk("filter", 4, sent=2, field="Year", operator="between", value=["2015", "2020"]),
              mk("lagDiff", 5, [4], sent=2, field="Poverty rate"),
              mk("average", 6, [5], sent=2, field="Poverty rate")],
     "ops3": [mk("compareBool", 7, [6, 3], sent=3, operator=">", targetA="ref:n6", targetB="ref:n3")]},
    "avg year-over-year delta in last 6 years vs first 6 years.")


GOLD["9sdl1j9l1fbhwq09"] = (  # how many years life expectancy > avg
    {"ops": [mk("average", 1, field="Life expectancy")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Life expectancy", operator=">", value="ref:n1"),
              mk("count", 3, [2], sent=2)]}, "")
GOLD["b4o9bh8f969q6kqa"] = (  # how many years index < avg
    {"ops": [mk("average", 1, field="Index score")],
     "ops2": [mk("filter", 2, [1], sent=2, field="Index score", operator="<", value="ref:n1"),
              mk("count", 3, [2], sent=2)]}, "")


GOLD["95yhyqjyeu4fohbj"] = (  # is avg(min,max) > value in 2010
    {"ops": [mk("findExtremum", 1, which="min", field="Value"),
             mk("findExtremum", 2, which="max", field="Value"),
             mk("add", 3, [1, 2], targetA="ref:n1", targetB="ref:n2")],
     "ops2": [mk("scale", 4, [3], sent=2, target="ref:n3", factor=0.5)],
     "ops3": [mk("retrieveValue", 5, sent=3, field="Year", target="2010"),
              mk("compareBool", 6, [4, 5], sent=3, operator=">", targetA="ref:n4", targetB="ref:n5")]},
    "midpoint of (min,max) compared against the 2010 value.")


GOLD["7w9v4fsbg5ydxsr2"] = (  # diff between avg of even years and avg of odd years
    {"ops": [mk("filter", 1, field="Year", include=["2010", "2012", "2014", "2016", "2018"]),
             mk("average", 2, [1], field="Percentage of gross domestic product")],
     "ops2": [mk("filter", 3, sent=2, field="Year", include=["2009", "2011", "2013", "2015", "2017"]),
              mk("average", 4, [3], sent=2, field="Percentage of gross domestic product")],
     "ops3": [mk("diff", 5, [2, 4], sent=3, targetA="ref:n2", targetB="ref:n4", signed=False)]}, "")
GOLD["ahxo354yj7g4m6h1"] = (  # average annual % increase 2000->2010
    {"ops": [mk("retrieveValue", 1, sent=1, target="2000"),
             mk("retrieveValue", 2, sent=1, target="2010"),
             mk("diff", 3, [1, 2], sent=1, targetA="ref:n2", targetB="ref:n1", signed=True)],
     "ops2": [mk("scale", 4, [3], sent=2, target="ref:n3", factor=0.1)]},
    "Question's '2 billion' framing is external; spec computes the average annual percentage-point "
    "increase = (value@2010 - value@2000) / 10 years.")


def load_authored() -> dict:
    """Merge subagent-authored specs from data/review/authored/*.json.
    Each file: {chart_id: {"spec": {ops..}|null, "note": "..."}}. GOLD wins on conflict.
    """
    out: dict = {}
    d = ROOT / "data" / "review" / "authored"
    if d.exists():
        for p in sorted(d.glob("*.json")):
            try:
                obj = json.loads(p.read_text())
            except Exception:
                continue
            for cid, entry in (obj or {}).items():
                if isinstance(entry, dict):
                    out[cid] = (entry.get("spec"), entry.get("note", "") or "")
    return out


def main() -> int:
    with SRC.open(newline="") as f:
        rows = list(csv.DictReader(f))
    merged = load_authored()
    merged.update(GOLD)  # hand-authored GOLD takes precedence
    filled = empty = todo = 0
    out_rows = []
    for r in rows:
        cid = r["chart_id"]
        spec_note = merged.get(cid)
        if spec_note is None:
            op_json, status, note = "", "todo", ""
            todo += 1
        else:
            spec, note = spec_note
            if spec is None:
                op_json, status = "", "empty"
                empty += 1
            else:
                op_json = json.dumps(spec, ensure_ascii=False, separators=(",", ":"))
                status = "pending"
                filled += 1
        out_rows.append({
            "#": r["#"], "chart_type": r["chart_type"], "chart_id": cid,
            "all_id": r["all_id"], "question": r["question"], "explanation": r["explanation"],
            "operation_spec": op_json, "status": status, "author_note": note, "updated_at": "",
        })
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(out_rows)
    print(json.dumps({"filled": filled, "empty": empty, "todo": todo, "total": len(rows),
                      "out": str(OUT.relative_to(ROOT))}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
