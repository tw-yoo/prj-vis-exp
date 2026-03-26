from opsspec.specs import *

# considered explanation as answer
# answer => ops

spec_13guplcbmfu1tjzu = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            value=[]
        ),
    ],
    "ops2": [
        PairDiffOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage",
            by="Factor",
            groupA="Germany – exports",
            groupB="Italy – exports",
        )
    ],
}

spec_0q8vqyb35mbq0efx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Age Group",
            include=["0–19 years"]
        ),
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Age Group",
            include=["20–39 years"]
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Age Group",
            include=["40–64 years"]
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Age Group",
            include=["65 years and older"]
        ),
        SumOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=1),
            field="Number of suicides"
        ),
    ],

    "ops2": [
        FindExtremumOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n2", "n4", "n6", "n8"], sentenceIndex=2),
            group="Year",
            field="Number of suicides",
            which="min"
        )
    ]
}

spec_2o3fyauxv32p571i = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            order=["asc"],
            orderField="year",
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Operating_Profit_Margin",
            which="min",
            rank=2
        )
    ]
}

spec_0s6zi9dyw22qo4rp = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            filed="Month/Year",
            operator="in",
            value=["Sep 1896", "Oct 1896", "Nov 1896", "Dec 1896"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Fatality rate among plague cases"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            filed="Month/Year",
            value=["Jan 1897", "Feb 1897", "Mar 1897", "Apr 1897", "May 1897"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Fatality rate among plague cases"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=2),
            field="Fatality rate among plague cases",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# 방법 1
spec_2ebtadc07b7bo277 = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average price in US dollars",
            order=["asc"],
            orderField="Average price in US dollars"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Average price in US dollars",
            which=["min"],
            rank=2
        )

    ]
}

# 방법 2
"""
spec_2ebtadc07b7bo277={ 
  NthOp(
      id="n2",
      meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
      filed="Average price in US dollars",
      order=["asc"],
      orderField="",
      n:2
    )
  }
"""

spec_0rfuaawgi58ajpsv = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Region",
            group="North America"
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Media rights revenue in billion US dollars"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Region",
            group="North America"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Media rights revenue in billion US dollars"
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Media rights revenue in billion US dollars",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

spec_0rdpculfpyw3bv5p = {
    "ops": [
        DiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Value in billion US dollars",
            group="Type",
            by="Year",
            groupA="Lending",
            groupB="Investment"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            group="Type",
            field="Value in billion US dollars",
            which=["min"],
            rank=1
        )
    ]
}

spec_10x2rgiqw97wdspi = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Revenue_Million_Euros",
            group="Commercial"
        ),
        AverageOp(
            id="n2",
            meat=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Revenue_Million_Euros",
            group="Commercial"
        )
    ],

    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Revenue_Million_Euros",
            group="Broadcasting"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Revenue_Million_Euros",
            group="Broadcasting"
        )
    ],
    "ops3": [
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Revenue_Million_Euros",
            operator=">",
            value=["ref:n2", "ref:n4"]
        )
    ]
}

spec_0qz3v0bszsex7jjm = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Expenditure in billion GBP",
            group="Fiscal Year"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["00/01"]
        ),
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["01/02"]
        ),
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n4"
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["02/03"]
        ),
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n6"
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["02/03"]
        ),
        CompareOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n8"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n8"
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["03/04"]
        ),
        CompareOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n10"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n10"
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["04/05"]
        ),
        CompareOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n12"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n12"
        ),
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["05/06"]
        ),
        CompareOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n14"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n14"
        ),
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["06/07"]
        ),
        CompareOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n16"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n16"
        ),
        FilterOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["07/08"]
        ),
        CompareOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n18"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n18"
        ),
        FilterOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["08/09"]
        ),
        CompareOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=["n20"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n20"
        ),
        FilterOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["09/10"]
        ),
        CompareOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n22"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n22"
        ),
        FilterOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["10/11"]
        ),
        CompareOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=["n24"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n24"
        ),
        FilterOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["11/12"]
        ),
        CompareOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=["n26"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n26"
        ),
        FilterOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["12/13"]
        ),
        CompareOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=["n28"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n28"
        ),
        FilterOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["14/15"]
        ),
        CompareOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=["n30"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n30"
        ),
        FilterOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["15/16"]
        ),
        CompareOp(
            id="n33",
            meta=OpsMeta(nodeId="33", inputs=["n32"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n32"
        ),
        FilterOp(
            id="n34",
            meta=OpsMeta(nodeId="n34", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["16/17"]
        ),
        CompareOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=["n34"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n34"
        ),
        FilterOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["17/18"]
        ),
        CompareOp(
            id="n37",
            meta=OpsMeta(nodeId="n21", inputs=["n37"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n36"
        ),
        FilterOp(
            id="n38",
            meta=OpsMeta(nodeId="n38", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["18/19"]
        ),
        CompareOp(
            id="n39",
            meta=OpsMeta(nodeId="n39", inputs=["n38"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n38"
        ),
    ],
    "ops3": [
        FilterOp(
            id="n40",
            meta=OpsMeta(nodeId="n40",
                         inputs=["n3", "n5", "n7", "n9", "n11", "n13", "n15", "n17", "n19", "n21", "n23", "n25", "n27",
                                 "n29", "n31", "n33", "n35", "n37", "n39"], sentenceIndex=3),
            field="Expenditure in billion GBP",
            operator="<",
            by="Country",
            value="ref:n1"
        )
    ]
}

spec_28bxxhd6omv2l2h1 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            seriesField="Year",
            field="Life expectancy in years",
            groupA="Canada",
            groupB="Newfoundland and Labrador"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], senteceId=2),
            field="Life expectancy in years",
            which="max"
        )
    ]
}

spec_29rxoltwhongoday = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceId=1),
            filed="Percentage",
            by="Opinion",
            groupA="Dissatisfied",
            groupB="Satisfied"
        ),

    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceId=2),
            filed="Year",
            which="max"
        )
    ]
}

spec_2eiyyw562tcvjypp = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceId=1),
            field="Favorable_View_Percentage",
            by="Country",
            groupA="Russia",
            groupB="US",
            signed=True,
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceId=2),
            field="Year",
            operator="<",
            value=0,
        ),
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2)
        )
    ]
}

spec_1h4rj9i2jtzq589y = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Favorable_View_Percentage",
            operator="between",
            value=["30", "95"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["51", "61"],
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=3),
            group="Country_group",
            value="EU 5-country median",
        )
    ]
}

spec_0gf8ugj84bs1ko2k = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=2),
            group=["Data Centers"],
            field="Revenue_Million_USD",
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="",
            which="max"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            group=["Data Centers"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            group=["Cloud"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            group=["BPO"]
        ),
    ],
    "ops3": [
        AverageOp(
            id="n5",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Revenue_Million_USD",
            group="Service_Area"
        )
    ],
}

spec_14jt6jor7iknkjkl = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2009", "2011"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            group="Favorable view of US"
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Percentage",
            which="min"
        )
    ],
    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            group="Confidence in US president"
        ),
    ],
    "ops3": [
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=3),
            field="Percentage",
        )
    ]
}

spec_0dglnk2wbf5ll15t = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Poor"
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_Respondents"
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            group="Good"
        )
    ],
    "ops4": [
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=4),
            field="Share_of_Respondents"
        )
    ],
    "ops5": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=5),
            field="Share_of_Respondents",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# 다시
spec_0ix8hz9qvakto18g = {
    "ops": [

    ]
}

# op2, op3 AverageOp로 가능함
spec_0egdxqun1m2n9k4z = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            filed="Year",
            operator="between",
            value=["2006", "2011"]
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Revenue multiple",
        )
    ],
    "ops3": [
        ScaleOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            target="ref:n2",
            factor=1 / 6,
        )
    ]
}

# ?
spec_0gvrmm8qbn6o1vya = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            filed="Average ticket price in US dollars",
            include=["60"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Season"
        )
    ],
    "ops3": [
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n2", inputs=["n2"], sentenceIndex=3),
            field="Average ticket price in US dollars"
        )
    ]
}

# 차이값이 음수인 경우에 대한 빈도 계산?
# Q1 2019
# Q1 2020
# Q2 2019
# Q2 2020
# Q3 2019
# Q3 2020
# Q4 2019
# Q4 2020
# 다시
spec_0roec4s0drcyiuz4 = {
    "ops": [
        DiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=2),
            field="Unemployment rate (%)",
            targetA="Q1 2019",
            targetB="Q1 2020",
            signed=True,
        ),
        DiffOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Unemployment rate (%)",
            targetA="Q1 2020",
            targetB="Q2 2019",
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            operator="<",
            value=0
        ),
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1)
        )
    ],

    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),

        )
    ]
}

spec_0eq4w2wsl864mhcj = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Sales volume in million units",
            operator=">",
            value="60"
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Sales volume in million units"
        )
    ]
}

# 다시 체크
spec_0g0xma0b0k29lk5j = {
    "ops": [
        NthOp(
            id="n1",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Share_of_Total_Population",
            group="65 years and older",
            order=["asc"],
            n=2
        )
    ],
    "ops2": [
        NthOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_Total_Population",
            group="15–64 years",
            order=["desc"],
            n=2
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Share_of_Total_Population",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=3),
            field="Share_of_Total_Population",
            operator="==",
            value="ref:n3"
        )
    ]
}

spec_0fhm43s0j7glca29 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="2018"
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Revenue in billion US dollars"
        ),
        ScaleOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            target="ref:n2",
            factor=1 / 4,
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            group="2020"
        )
    ],
    "ops4": [
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=4),
            field="Revenue in billion US dollars"
        ),
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=4),
            target="ref:n5",
            factor=1 / 4,
        )
    ],
    "ops5": [
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n5"], sentenceIndex=5),
            targetA="ref:n3",
            targetB="ref:n5",
            which="max"
        )
    ]
}

spec_0gacqohbzj07n25s = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Country",
            include=["France", "Germany", "Italy"],
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number of procedures"
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Country",
            include=["India", "Japan", "Russia"],
        )
    ],
    "ops4": [
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=4),
            field="Number of procedures"
        )
    ],
    "ops5": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "m4"], senteceIndex=5),
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# 다시
spec_1c80b6i7wdu3m1ir = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year on yaer percentage change (%)"
        ),

    ]
}

spec_1k8qhmg9rui7gtzh = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2010", "2015"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Favorable_View_Percentage",
            group="Germany"
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            fiedl="Favorable_View_Percentage",
            which="max"
        )
    ],
    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2010", "2015"]
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Favorable_View_Percentage",
            group="US"
        ),
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Favorable_View_Percentage",
            which="min"
        )
    ],
    "ops3": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=3),
            field="Favorable_View_Percentage",
            targetA="ref:n3",
            targetB="ref:n6"
        )
    ]
}

# 체크: Retrieve
spec_0ihx2vzdsej883sq = {
    "obs": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of employees",
            group="Female"
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Share of employees",
            which="min",
            rank=2
        )
    ],
    "obs2": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Share of employees",
            group="Male"
        )
    ]
}

spec_0fh0emp095qhq3ag = {
    "obs": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number of victims",
            operator="between",
            value=["2010", "2019"]
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Number of victims",
            which="max"
        )
    ],
    "obs2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Number of victims",
            operator="between",
            value=["2010", "2019"]
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Number of victims",
            which="min"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            targetA="ref:n4",
            targetB="ref:n2"
        )
    ]
}

# 다시
# "ops":[
#   PairDiffOp(
#     id="n1",
#     meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
#     field="Average age at marriage",
#     by="Year",
#     groupA="Male",
#     groupB="Female"
#   )
# ]

spec_0k75gqf8ckjikdym = {
    "ops": [
        # Male
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], senteceIndex=1),
            field="Average age at marriage",
            group="Male"
        ),

        # Female
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], senteceIndex=1),
            field="Average age at marriage",
            group="Female"
        ),

        # 2010 Male
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2010"]
        ),

        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1", "n5"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n5"
        ),

        # 2011 Male
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2011"]
        ),

        DiffOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n1", "n7"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n7"
        ),

        # 2012 Male
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2012"]
        ),

        DiffOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n1", "n10"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n10"
        ),

        # 2013 Male
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2013"]
        ),

        DiffOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n1", "n12"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n12"
        ),

        # 2014 Male
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2014"]
        ),

        DiffOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n1", "n13"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n13"
        ),

        # 2015 Male
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2015"]
        ),

        DiffOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n1", "n15"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n15"
        ),

        # 2016 Male
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2016"]
        ),

        DiffOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n1", "n16"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n17"
        ),

        # 2017 Male
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2017"]
        ),

        DiffOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n1", "n19"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n19"
        ),

        # 2018 Male
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2018"]
        ),

        DiffOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n1", "n21"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n21"
        ),

        # 2019 Male
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2019"]
        ),

        DiffOp(
            id="n24",
            meta=OpsMeta(nodeId="n22", inputs=["n1", "n23"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n23"
        ),

        # 2020 Male
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=["n3"], senteceIndex=1),
            field="Year",
            include=["2020"]
        ),

        DiffOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n1", "n25"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n1",
            targetB="ref:n25"
        ),

        # 2010 Female
        FilterOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2010"]
        ),

        DiffOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=["n2", "n27"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n27"
        ),

        # 2011 Male
        FilterOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2011"]
        ),

        DiffOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=["n2", "n29"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n29"
        ),

        # 2012 Male
        FilterOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2012"]
        ),

        DiffOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=["n2", "n31"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n31"
        ),

        # 2013 Male
        FilterOp(
            id="n33",
            meta=OpsMeta(nodeId="n33", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2013"]
        ),

        DiffOp(
            id="n34",
            meta=OpsMeta(nodeId="n34", inputs=["n2", "n33"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n33"
        ),

        # 2014 Male
        FilterOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2014"]
        ),

        DiffOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=["n2", "n35"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n35"
        ),

        # 2015 Male
        FilterOp(
            id="n37",
            meta=OpsMeta(nodeId="n37", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2015"]
        ),

        DiffOp(
            id="n38",
            meta=OpsMeta(nodeId="n38", inputs=["n2", "n37"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n37"
        ),

        # 2016 Male
        FilterOp(
            id="n39",
            meta=OpsMeta(nodeId="n39", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2016"]
        ),

        DiffOp(
            id="n40",
            meta=OpsMeta(nodeId="n40", inputs=["n2", "n39"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n39"
        ),

        # 2017 Male
        FilterOp(
            id="n41",
            meta=OpsMeta(nodeId="n41", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2017"]
        ),

        DiffOp(
            id="n42",
            meta=OpsMeta(nodeId="n42", inputs=["n2", "n41"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n41"
        ),

        # 2018 Male
        FilterOp(
            id="n43",
            meta=OpsMeta(nodeId="n43", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2018"]
        ),

        DiffOp(
            id="n44",
            meta=OpsMeta(nodeId="n44", inputs=["n2", "n43"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n43"
        ),

        # 2019 Male
        FilterOp(
            id="n45",
            meta=OpsMeta(nodeId="n45", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2019"]
        ),

        DiffOp(
            id="n46",
            meta=OpsMeta(nodeId="n46", inputs=["n2", "n45"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n45"
        ),

        # 2020 Female
        FilterOp(
            id="n47",
            meta=OpsMeta(nodeId="n47", inputs=["n4"], senteceIndex=1),
            field="Year",
            include=["2020"]
        ),

        DiffOp(
            id="n48",
            meta=OpsMeta(nodeId="n48", inputs=["n2", "n47"], sentenceIndex=1),
            field="Average age at marriage",
            targetA="ref:n2",
            targetB="ref:n47"
        ),
    ],
    "ops2": [
        CompareOp(
            id="n50",
            meta=OpsMeta(nodeId="", inputs=[], sentenceIndex=2),
            field="",
            group=""
        )
    ]
}

# change?
spec_1p4nnba4568wza9n = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage",
            operator=">",
            value=50
        )
    ]
}

spec_0nmj7sdej4cipma7 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2019"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2020"]
        )
    ],

    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="North America",
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="North America",
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3", "n4"], sentenceIndex=2),
            field="Net sales in million US dollars",
            targetA="ref:n3",
            targetB="ref:n4"
        ),

        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="International",
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n2"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="International",
        ),
        DiffOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n2", "n4"], sentenceIndex=2),
            field="Net sales in million US dollars",
            targetA="ref:n6",
            targetB="ref:n7"
        ),

        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n1"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="Retail",
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n2"], sentenceIndex=2),
            field="Net sales in million US dollars",
            group="Retail",
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n2", "n4"], sentenceIndex=2),
            field="Net sales in million US dollars",
            targetA="ref:n9",
            targetB="ref:n10"
        ),
    ],
    "ops3": [
        CompareOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n5", "n8"], sentenceIndex=3),
            field="Net sales in million US dollars",
            targetA="ref:n5",
            targetB="ref:n8",
            which="max"
        ),
        CompareOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n11", "n12"], sentenceIndex=3),
            field="Net sales in million US dollars",
            targetA="ref:n11",
            targetB="ref:n12",
            which="max"
        ),
        RetrieveValueOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=3),
            field="Segment"
        )
    ]
}

spec_0i9bxppwocx0tyop = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number of employees",
            include=["2008", "2009", "2010", "2011"]
        ),
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number of employees",
        )
    ],
    "ops3": [
        ScaleOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            target="ref:n2",
            factor=1 / 4
        )
    ]
}

spec_0lua5jsw92d3enb4 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents",
            operator=">",
            value=0.03
        ),

        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            group="2018"
        ),

        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            group="2019"
        )
    ],
    "ops2": [
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=2),
            field="Diet Type"
        ),
        CountOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3"], sentenceIndex=2),
            field="Diet Type"
        )
    ],
    "ops3": [
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4", "n5"], sentenceIndex=3),
            field="Diet Type",  # 이 부분을 어떻게..?
            targetA="ref:n4",
            targetB="ref:n5"
        )
    ]
}

spec_0iv07908ph6y6ifj = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            operator="between",
            value=["Mar '16", "Mar '19"]
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Active users in millions"
        )
    ]
}

spec_1jabqwjz9pmd7qwz = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2010", "2019"]
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number of facilities",
            order=["asc"]
        ),
        NthOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Number of facilities",
            order=["asc"],
            n=5
        )
    ]
}

spec_1vh62ks9wweck6m2 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            groupA="men",
            groupB="women"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Level_of_Stress",
            which="min"
        )
    ]
}

spec_0jbrb1dcbliiampz = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2011", "2014"]
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Investments in Billion Euros",
            operator=">",
            value=22
        )
    ],
    "ops3": [
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Year"
        )
    ]
}

spec_0ufvwi9xv37e597q = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            groupA="Matchday",
            groupB="Broadcasting"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            which="max"
        )
    ]
}

spec_0oinwvo88bvvs25b = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Men"
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of women and men",
            which="max"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            group="Women"
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Share of women and men",
            which="max"
        )
    ],
    "ops3": [
        DiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Share of women and men",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]

}

spec_1vni31fp2ii7wz68 = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number in millions",
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number in millions",
            which="min"
        )
    ]
}

spec_20gpvz4ylu4olrm7 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Women"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n1", inputs=["n1"], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2000", "2004"]
        ),
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            field="Percentage"
        )
    ],
    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            group="Men"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2000"]
        ),
        AverageOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            field="Percentage"
        )
    ],
    "ops3": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=3),
            field="Percentage",
            targetA="ref:n3",
            targetB="ref:n6"
        )
    ]
}

sepc_0vfqjaxeiv96ww7g = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(node="n1", inputs=[], sentenceIndex=1),
            group="Almost all of the time"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(node="n2", inputs=["n2"], sentenceIndex=1),
            field="Race",
            value="White"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            group="Most of the time"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(node="n4", inputs=["n3"], sentenceIndex=1),
            field="Race",
            value="white"
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=1),
            field="Percentage",
        )
    ],
    "ops2": [
        FilterOp(
            id="n6",
            meta=OpsMeta(node="n6", inputs=[], sentenceIndex=2),
            group="Almost all of the time"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(node="n7", inputs=["n6"], sentenceIndex=2),
            field="Race",
            value="Black"
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            group="Most of the time"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(node="n9", inputs=["n8"], sentenceIndex=2),
            field="Race",
            value="Black"
        ),
        SumOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n7", "n9"], sentenceIndex=2),
            field="Percentage",
        )
    ],
    "ops3": [
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n5", "n10"], sentenceIndex=3),
            field="Percentage",
            targetA="ref:n5",
            targetB="ref:10"
        )
    ]
}

spec_25gpdzxh8nu0c0vf = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number_of_Fatalities"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Number_of_Fatalities",
            which="max",
            rank=11
        ),

    ],
    "ops3": [
        # 여기 결과가 참이면? 거짓이면?  targetA, targetB를 어떻게 가져오느냐
        CompareBoolOp(
            id="n3",
            meta=OpsMeta(nodeId="n2", inputs=["n1", "n2"], sentenceIndex=3),
            field="Number_of_Fatalities",
            targetA="ref:n1",
            targetB="ref:n2"
        )
    ]
}

spec_20qa83ih1gn6toqt = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Has a great impact",
            by="Metric",
            groupA="Convenience",
            groupB="Price"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["ops"], sentenceIndex=2),
            field="Has a great impact",
            which="min"
        )
    ]
}

spec_0baf5ch9y4z8914p = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Monetary policy rate (%)",
            order=["asc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Monetary policy rate (%)",
            which="min"
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Monetary policy rate (%)",
            which="min",
            rank=2
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=2),
            field="Monetary policy rate (%)",
            which="min",
            rank=3
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n3", "n4"], sentenceIndex=2),
            field="Monetary policy rate (%)",
        )
    ],
    "ops3": [
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            target="ref:n5",
            factor=1 / 3
        )
    ]
}

spec_01h0jkno5l7jola8 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents",
            by="Artist",
            groupA="Men",
            groupB="Women"
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share of respondents"
        )
    ],
    "ops3": [
        ScaleOp(
            id="n3",
            meta=OpsMeta(nodeId="n2", inputs=["n2"], sentenceIndex=3),
            target="ref:n2",
            factor=1 / 5
        )
    ]
}

# 확인하기
spec_0cjk67q39ee6dhzj = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage of people negative on China",
            by="Year",
            groupA="Republicans",
            groupB="Democats"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Percentage of people negative on China",
            order=["desc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Percentage of people negative on China",
            which="max"
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Percentage of people negative on China",
            which="min"
        )
    ],
    "ops4": [
        DiffOp(
            nodeId="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=4),
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

spec_01mksjs373fhcl4q = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average length of lease in years",
            by="Sector",
            groupA="2003",
            groupB="mid-2013"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Average length of lease in years",
            order=["desc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Average length of lease in years",
            which="max"
        )
    ]
}

spec_04xwv56n37ybj8zr = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            order=["desc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Index_Score",
            which="max",
            rank=3
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Index_Score",
            which="max",
            rank=5
        )
    ],
    "ops3": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=3),
            field="Index_Score",
            targetA="ref:n3",
            targetB="ref:n4"
        )
    ]
}

spec_0cymcilknp8krjwz = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average Price (USD)",
            operator="==",
            value=4.0
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Average Price (USD)",
            operator=">",
            value=4.0
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Average Price (USD)"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Average Price (USD)",
            operator="==",
            value=2.5
        )
    ],
    "ops4": [
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=4),
            field="Average Price (USD)",
            operator="<",
            value=2.5
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=4),
            field="Average Price (USD)"
        )
    ],
    "ops5": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=5),
            field="Average Price (USD)",
            targetA="ref:n3",
            targetB="ref:n6"
        )
    ]
}

spec_0abj8blv663ussbr = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            includ=["2010"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            includ=["2020"]
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Market size in billion US dollars",
        )
    ]
}

spec_0cad2xfrwdgvo9zk = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            order=["desc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number of fatalities",
            which="max",
            rank=5
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Number of fatalities",
            which="max",
            rank=6
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=2),
            field="Number of fatalities",
            which="max",
            rank=7
        )
    ],
    "ops3": [
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n3", "n4"], sentenceIndex=3),
            field="Number of fatalities",
        )
    ]
}

spec_0gr1c2jcthc8h9f6 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Risk index score",
            operator="between",
            value=["6.2", "5.8"]
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Risk index score",
            operator="<",
            value=4.8
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Risk index score",
            targetA="ref:n1",
            targetB="ref:n2"
        )
    ]
}

# 확인
spec_001dao0mq0pplbzj = {
    "ops": [
        PairDiffOp(
            nodeId="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Revenue_Million_USD",
            by="Year",
            groupA="Commercial",
            groupB="Matchday"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Revenue_Million_USD",
            which="max"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Year",
            operator="==",
            value="ref:n2",
        )
    ]
}

spec_0a5npu4o61dz4r5f = {
    "ops": [
        FindExtremumOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Damage (in billion US dollars)",
            which="max"
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Damage (in billion US dollars)",
            which="min"
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Damage (in billion US dollars)",
            targetA="ref:n1",
            targetB="ref:n2"
        )
    ]
}

spec_07lo3vvwztz32ifq = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Net_Sales_Percentage",
            by="Year",
            groupA="2009",
            groupB="2010"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meat=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Net_Sales_Percentage",
            order=["desc"]
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Net_Sales_Percentage",
            which="min"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n4"], sentenceIndex=3),
            field="Net_Sales_Percentage",
            which="max"
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3", "n4"], sentenceIndex=3),
            field="Net_Sales_Percentage",
        )
    ]

}