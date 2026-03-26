from opsspec.specs import *

spec_2jromeq5u9lloh1s = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Audience_Millions"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Audience_Millions",
            include=["2010", "2011"]
        )
    ]
}

spec_13guplcbmfu1tjzu = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Factor",
            include=["Germany – exports", "Italy – exports"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Country",
            include=["Czechia"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Factor",
            include=["Germany – exports", "Italy – exports"]
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Factor",
            include=["Hungary"]
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            field="Factor",
            include=["Germany – exports", "Italy – exports"]
        ),
        SumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage"
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Factor",
            include=["Romania"]
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n8"], sentenceIndex=2),
            field="Factor",
            include=["Germany – exports", "Italy – exports"]
        ),
        SumOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=2),
            field="Factor",
            include=["Poland"]
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=2),
            field="Factor",
            include=["Germany – exports", "Italy – exports"]
        ),
        SumOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n12"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage"
        ),
    ],
    "ops3": [
        FindExtremumOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n4", "n7", "n10", "n13"]),
            field="Decrease_in_GDP_Percentage",
            which="max"
        )
    ]
}

spec_0q8vqyb35mbq0efx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009"]
        ),
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2010"]
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2011"]
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2012"]
        ),
        SumOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2013"]
        ),
        SumOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2014"]
        ),
        SumOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2015"]
        ),
        SumOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2016"]
        ),
        SumOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n15"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2017"]
        ),
        SumOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n17"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2018"]
        ),
        SumOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n19"], sentenceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2019"]
        ),
        SumOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n21"], sentenceIndex=1),
            field="Number of suicides"
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n2", "n4", "n6", "n8", "n10", "n12", "n14", "n16", "n18", "n20", "n22"],
                         sentenceIndex=2),
            field="Number of suicides",
            which="min"
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=[], sentenceIndex=3),
            field="Year",
            target=2019
        )
    ]
}

spec_0o12tngadmjjux2n = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Production in million units"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            include=["1999"]
        ),
        CompareBoolOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n2",
            operator="<"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2000"]
        ),
        CompareBoolOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n4"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n4",
            operator="<"
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2001"]
        ),
        CompareBoolOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n1", "n6"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n6",
            operator="<"
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2002"]
        ),
        CompareBoolOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n1", "n8"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n8",
            operator="<"
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2003"]
        ),
        CompareBoolOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n1", "n10"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n10",
            operator="<"
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2004"]
        ),
        CompareBoolOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n1", "n12"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n12",
            operator="<"
        ),
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2005"]
        ),
        CompareBoolOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n1", "n15"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n15",
            operator="<"
        ),
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2006"]
        ),
        CompareBoolOp(
            id="n17",
            meta=OpsMeta(nodeId="n13", inputs=["n1", "n16"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n16",
            operator="<"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2007"]
        ),
        CompareBoolOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n1", "n17"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n17",
            operator="<"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        CompareBoolOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n1", "n19"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n19",
            operator="<"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        CompareBoolOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n1", "n19"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n19",
            operator="<"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        CompareBoolOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n1", "n21"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n21",
            operator="<"
        ),
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2009"]
        ),
        CompareBoolOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n1", "n23"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n23",
            operator="<"
        ),
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2010"]
        ),
        CompareBoolOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n1", "n25"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n25",
            operator="<"
        ),
        FilterOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2011"]
        ),
        CompareBoolOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=["n1", "n27"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n27",
            operator="<"
        ),
        FilterOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2012"]
        ),
        CompareBoolOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=["n1", "n30"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n30",
            operator="<"
        ),
        FilterOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2012"]
        ),
        CompareBoolOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=["n1", "n31"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n31",
            operator="<"
        ),
        FilterOp(
            id="n33",
            meta=OpsMeta(nodeId="n33", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2013"]
        ),
        CompareBoolOp(
            id="n34",
            meta=OpsMeta(nodeId="n34", inputs=["n1", "n33"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n33",
            operator="<"
        ),
        FilterOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2014"]
        ),
        CompareBoolOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=["n1", "n35"], sentenceIndex=2),
            field="Production in million units",
            targetA="ref:n1",
            targetB="ref:n35",
            operator="<"
        )
    ],
    "ops3": [
        FilterOp(
            id="n37",
            meta=OpsMeta(nodeId="n37", inputs=[], sentenceIndex=3),
            field="Year",
            include=["2004", "2006", "2007", "2010", "2011", "2002", "2003"]
        ),
        CountOp(
            id="n38",
            meta=OpsMeta(nodeId="n38", inputs=["n37"], sentenceIndex=3)
        )
    ]
}

spec_10t8o5vhethzeod1 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Sector",
            group="Agriculture"
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share_of_GDP",
            which="max"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Year",
            target="2011"
        )
    ]
}

spec_2o3fyauxv32p571i = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Operating_Profit_Margin",
            order="asc"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            target="2016"
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field=""
        )
    ]
}

spec_11e148qcs7x70t8v = {
    "ops": [
        CompareOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Country",
            groupA="South Korea",
            groupB="France"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2014", "2015"]
        ),
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Year",
            include=["2016", "2017", "2018", "Jan-Oct 2019"]
        )
    ]
}

spec_0s6zi9dyw22qo4rp = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Month/Year",
            include=["Sep 1896", "Oct 1896", "Nov 1896", "Dec 1896"]
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
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Month/Year",
            include=["Jan 1897", "Feb 1897", "Mar 1897", "Apr 1897", "May 1897"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Fatality rate among plague cases"
        )
    ],
    "ops3": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Fatality rate among plague cases",
            targetA="ref:n2",
            targetB="ref:n4",
            which="max"
        )
    ]
}

spec_2ebtadc07b7bo277 = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average price in US dollars",
            order="asc"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            target="2010"
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            target="2016"
        )
    ]
}

spec_0prhtod4tli879nh = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Population in millions",
            seriesField="City",
            by="Year",
            groupA="2010",
            groupB="2025"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Population in millions",
            operator=">",
            value=0
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="City",
            target="Dhaka"
        )
    ]
}