from opsspec.specs import *

spec_2jromeq5u9lloh1s = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceId=1),
            field="Audience_Millions"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceId=2),
            field="Audience_Millions",
            include=["2010", "2011"]
        )
    ]
}

spec_13guplcbmfu1tjzu = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceId=1),
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
            meta=OpsMeta(nodeId="n1", inputs=[], senteceIndex=1),
            field="Year",
            include=["2009"]
        ),
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], senteceIndex=1),
            field="Year",
            include=["2010"]
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], senteceIndex=1),
            field="Year",
            include=["2011"]
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], senteceIndex=1),
            field="Year",
            include=["2012"]
        ),
        SumOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], senteceIndex=1),
            field="Year",
            include=["2013"]
        ),
        SumOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], senteceIndex=1),
            field="Year",
            include=["2014"]
        ),
        SumOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], senteceIndex=1),
            field="Year",
            include=["2015"]
        ),
        SumOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], senteceIndex=1),
            field="Year",
            include=["2016"]
        ),
        SumOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n15"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], senteceIndex=1),
            field="Year",
            include=["2017"]
        ),
        SumOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n17"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], senteceIndex=1),
            field="Year",
            include=["2018"]
        ),
        SumOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n19"], senteceIndex=1),
            field="Number of suicides"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], senteceIndex=1),
            field="Year",
            include=["2019"]
        ),
        SumOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n21"], senteceIndex=1),
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
            meta=OpsMeta(nodeId="n38", inputs=["n37"], sentenceInddex=3)
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
            filed="Operating_Profit_Margin",
            order=["asc"]
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
            order=["asc"]
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
            groupA=2010,
            groupB=2025
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

spec_2jki13q54zizc6i4 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["Jul 2008 - Jun 2009", "Jul 2009 - Jun 2010", "Jul 2010 - Jun 2011", "Jul 2011 - Jun 2012"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Number of trucks"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["Jul 2013 - Jun 2014", "Jul 2014 - Jun 2015", "Jul 2015 - Jun 2016", "Jul 2016 - Jun 2017"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Number of trucks"
        )
    ],
    "ops3": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Number of trucks",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

spec_0pzdf7hfbxgjghsa = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2016"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2017"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2018"]
        )
    ],
    "ops2": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n2"], sentenceIndex=2),
            field="Production in billion heads",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n3"], sentenceIndex=2),
            field="Production in billion heads",
            targetA="ref:n2",
            targetB="ref:n3"
        ),
    ],
    "ops3": [
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4", "n5"], sentenceIndex=3),
            field="Production in billion heads",
            targetA="ref:n4",
            targetB="ref:n5"
        )
    ]
}

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
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Media rights revenue in billion US dollars",
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Region",
            group="Latin America"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Media rights revenue in billion US dollars",
        ),
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Media rights revenue in billion US dollars",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# 확인
spec_0rdpculfpyw3bv5p = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Value in billion US dollars",
            by="",
            groupA="Lending",
            groupB="Investment"
        )
    ],
    "ops2": [

    ],
    "ops3": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=3),
            field="Value in billion US dollars",
            which="min"
        )
    ]
}

spec_10x2rgiqw97wdspi = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Revenue_Type",
            group="Broadcasting"
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Revenue_Million_Euros"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Revenue_Type",
            group="Commercial"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Revenue_Million_Euros"
        ),
    ],
    "ops2": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n2"], sentenceIndex=2),
            field="Revenue_Million_Euros",
            targetA="ref:n1",
            targetB="ref:n2",
            which="max"
        ),
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n4"], sentenceIndex=2),
            field="Revenue_Million_Euros",
            targetA="ref:n3",
            targetB="ref:n4",
            which="max"
        ),
    ],
    "ops3": [
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=3),
            field="Year",
            include=["2016/17", "2017/18", "2018/19"]
        )
    ]
}

spec_0qz3v0bszsex7jjm = {
    "ops": [
        SumOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Expenditure in billion GBP"
        ),
        ScaleOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            target="ref:n1",
            scale=1 / 19
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["00/01"]
        ),
        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["01/02"]
        ),
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n2", "n6"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n6"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["02/03"]
        ),
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n2", "n7"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n7"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["02/03"]
        ),
        CompareOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n2", "n9"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n9"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["03/04"]
        ),
        CompareOp(
            id="n12",
            meta=OpsMeta(nodeId="n11", inputs=["n2", "n11"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n11"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["04/05"]
        ),
        CompareOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n2", "n13"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n13"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["05/06"]
        ),
        CompareOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n2", "n15"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n15"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["06/07"]
        ),
        CompareOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n2", "n17"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n17"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["07/08"]
        ),
        CompareOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n2", "n19"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n19"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["08/09"]
        ),
        CompareOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n2", "n21"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n21"
        ),
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["09/10"]
        ),
        CompareOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n2", "n23"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n23"
        ),
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["10/11"]
        ),
        CompareOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n2", "n25"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n25"
        ),
        FilterOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["11/12"]
        ),
        CompareOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=["n2", "n28"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n28"
        ),
        FilterOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["12/13"]
        ),
        CompareOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=["n2", "n29"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n29"
        ),
        FilterOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["14/15"]
        ),
        CompareOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=["n2", "n31"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n31"
        ),
        FilterOp(
            id="n33",
            meta=OpsMeta(nodeId="n33", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["15/16"]
        ),
        CompareOp(
            id="n34",
            meta=OpsMeta(nodeId="34", inputs=["n2", "n33"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n33"
        ),
        FilterOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["16/17"]
        ),
        CompareOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=["n2", "n35"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n35"
        ),
        FilterOp(
            id="n37",
            meta=OpsMeta(nodeId="n37", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["17/18"]
        ),
        CompareOp(
            id="n38",
            meta=OpsMeta(nodeId="n38", inputs=["n2", "n37"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n38"
        ),
        FilterOp(
            id="n39",
            meta=OpsMeta(nodeId="n39", inputs=[], sentenceIndex=2),
            field="Expenditure in billion GBP",
            operator="==",
            value=["18/19"]
        ),
        CompareOp(
            id="n40",
            meta=OpsMeta(nodeId="n40", inputs=["n2", "n39"], sentenceIndex=2),
            field="Expenditure in billion GBP",
            targetA="ref:n2",
            targetB="ref:n39"
        )
    ],
    "ops3": [
        FilterOp(
            id="n41",
            meta=OpsMeta(nodeId="n41", inputs=[], sentenceIndex=3),
            field="Expenditure in billion GBP",
            include=["14/15", "15/16", "16/17", "17/18", "18/19"],
        )
    ]
}

spec_23wg8zio5ahp40tg = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage",
            by="Year",
            groupA="Oppose",
            groupbB="Favor"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=1996
        )
    ]
}

spec_28bxxhd6omv2l2h1 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Life expectancy in years",
            by="Region",
            groupA="Canada",
            groupB="Newfoundland and Labrador"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            target=1996
        )
    ]
}

spec_29rxoltwhongoday = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage",
            by="Year",
            seriesField="Opinion",
            groupA="Dissatisfied",
            groupB="Satisfied"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2002
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2017
        )
    ]
}

spec_2eiyyw562tcvjypp = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Favorable View (%)",
            by="Year",
            seriesField="Country",
            groupA="US",
            groupB="Russia",
            absolute=True
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Country",
            operator="<"
        )
    ],
    "ops3": [
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
        )
    ]
}

spec_221xwpab655f7g8x = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Revenue_Million_Euros",
            group="0–14 years"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2019"]
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Share of total population",
            group="65 years and older"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Share of total population",
            targetA="ref:n4",
            targetB="ref:n2"
        )
    ]
}

spec_23an1hozb7myw4e2 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share_of_Revenue",
            group="Men's apparel"
        ),
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2013
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2014
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2015
        ),
        RetrieveValueOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1"], sentenceIndex=2),
            field="Year",
            target=2016
        ),
    ],
    "ops3": [
        RetrieveValueOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1"], sentenceIndex=3),
            field="year",
            target=2017
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n5", "n6"], sentenceIndex=3),
            field="Share_of_Revenue",
            groupA="ref:n5",
            groupB="ref:n6"
        )
    ]
}

spec_4wqpl5jrdmc75go3 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2025"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2026", "2027"]
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2026", "2027", "2028", "2029"]
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD",
            group="Direct contribution"
        ),
        AverageOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD",
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD",
            group="Total contribution"
        ),
        AverageOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD",
        ),
    ],
    "ops3": [

    ]
}

spec_74p313e1n8rzkfzp = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents",
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share of respondents",
            which="max"
        )
    ]
}

spec_7mgydgux0ay0flv4 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2003", "2004", "2005"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2004", "2005", "2006"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2005", "2006", "2007"]
        ),
        AverageOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2006", "2007", "2008"]
        ),
        AverageOp(
            id="n8",
            meta=OpsMeta(nodeId="n7", inputs=["n7"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2007", "2008", "2009"]
        ),
        AverageOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009", "2010", "2011"]
        ),
        AverageOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2010", "2011", "2012"]
        ),
        AverageOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2011", "2012", "2013"]
        ),
        AverageOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n15"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2013", "2014", "2015"]
        ),
        AverageOp(
            id="n18",
            meta=OpsMeta(nodeId="n16", inputs=["n17"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2015", "2016", "2017"]
        ),
        AverageOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n19"], sentenceIndex=1),
            field="Number of units sold"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2017", "2018", "2019"]
        ),
        AverageOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n21"], sentenceIndex=1),
            field="Number of units sold"
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n2", "n4", "n6", "n8", "n10", "n12", "n14", "n16", "n18", "n20", "n22"],
                         sentenceIndex=2),
            field="Number of units sold",
            which="max"
        )
    ],
    "ops3": [
        FilterOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n23"], sentenceIndex=3),
            field="Year",
            include=["2015", "2016", "2017"]
        )
    ]
}

spec_4pi1e6ev8e0zobww = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Gender",
            group="Male"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Year",
            include=["2009", "2010", "2011"]
        ),
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            field="Population"
        )
    ],
    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Gender",
            group="Female"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2018", "2019", "2020"]
        ),
        AverageOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            field="Population"
        )
    ],
    "ops3": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=2),
            field="Population",
            targetA="ref:n3",
            targetB="ref:n6"
        ),
    ],
}

spec_1gb8sqnptdsdvagz = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Age Group",
            group="Under 30s"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of respondents",
            operator="<",
            value=0.10
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Hair Removal Type",
            target="Hollywood"
        )
    ]
}

spec_4vcdm7lwwlgdd0h1 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Median_Wealth_Million_USD",
            by="Year",
            groupA="Senate",
            groupB="House"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Median_Wealth_Million_USD",
            which="min"
        )
    ]
}

spec_1hm2mi3o0ejxp7tn = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            filed="Group",
            operator="==",
            value="Hypertensive untreated"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Gender",
            group="Men"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Gender",
            group="Women"
        )
    ],
    "ops3": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=3),
            field="Share of respondents",
            targetA="ref:n3",
            targetB="ref:n2"
        )
    ]
}

spec_240rurpp2arislnt = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Age Group",
            include=["18–29"]
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Share of respondents",
            which="min"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Age Group",
            include=["65+"]
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Share of respondents",
            which="max"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], setenceIndex=3),
            field="Share of respondents",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

spec_2a8mliwolqqo6s5u = {
    "ops": [
        # 2013
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2013"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2014
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2014"]
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2015
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2015"]
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n8"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2016
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2016"]
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n10"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2017
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2017"]
        ),
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n14"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2018
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2018"]
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n16"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n17"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2019
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2019"]
        ),
        FilterOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n19"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=["n20"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2020
        FilterOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2020"]
        ),
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n22"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n23"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
        # 2021
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2021"]
        ),
        FilterOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n25"], sentenceIndex=1),
            field="Region",
            exclude=["Asia Pacific"]
        ),
        SumOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=["n26"], sentenceIndex=1),
            field="Market_Size_Billion_USD"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=[], sentenceIndex=2),
            field="Region",
            group="Asia Pacific"
        ),
        FilterOp(
            id="n29",
            meta=OpsMeta(nodeId="n1", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2013"]
        ),
        FilterOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2014"]
        ),
        FilterOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2015"]
        ),
        FilterOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2016"]
        ),
        FilterOp(
            id="n33",
            meta=OpsMeta(nodeId="n33", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2017"]
        ),
        FilterOp(
            id="n34",
            meta=OpsMeta(nodeId="n34", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2018"]
        ),
        FilterOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2019"]
        ),
        FilterOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2020"]
        ),
        FilterOp(
            id="n37",
            meta=OpsMeta(nodeId="n37", inputs=["n28"], sentenceIndex=2),
            field="Year",
            include=["2021"]
        ),
        DiffOp(
            id="n38",
            meta=OpsMeta(nodeId="n38", inputs=["n3", "n29"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n3",
            targetB="ref:n29"
        ),
        DiffOp(
            id="n39",
            meta=OpsMeta(nodeId="n39", inputs=["n6", "n30"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n6",
            targetB="ref:n30"
        ),
        DiffOp(
            id="n40",
            meta=OpsMeta(nodeId="n38", inputs=["n9", "n31"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n9",
            targetB="ref:n31"
        ),
        DiffOp(
            id="41",
            meta=OpsMeta(nodeId="n41", inputs=["n12", "n32"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n12",
            targetB="ref:n32"
        ),
        DiffOp(
            id="n42",
            meta=OpsMeta(nodeId="n42", inputs=["n15", "n33"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n15",
            targetB="ref:n33"
        ),
        DiffOp(
            id="n43",
            meta=OpsMeta(nodeId="n43", inputs=["n18", "n34"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n18",
            targetB="ref:n34"
        ),
        DiffOp(
            id="n44",
            meta=OpsMeta(nodeId="n38", inputs=["n21", "n35"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n21",
            targetB="ref:n35"
        ),
        DiffOp(
            id="n45",
            meta=OpsMeta(nodeId="n45", inputs=["n24", "n36"], sentenceIndex=2),
            field="Market_Size_Billion_USD",
            targetA="ref:n24",
            targetB="ref:n30"
        ),
    ],
    "ops3": [
        FindExtremumOp(
            id="n46",
            meta=OpsMeta(nodeId="n46", inputs=["n39", "n40", "n41", "n42", "n43", "n44", "n45"], sentenceIndex=3),
            field="Market_Size_Billion_USD",
            which="min"
        )
    ]
}

# 확인
spec_1a6pxfig1xf4oeu3 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Franchise value in million US dollars",
            operator="<=",
            value=200
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2006", "2012"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            operator="==",
            value="2013"
        ),
    ]
}

spec_1ashoniy42n3n5jr = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Operating revenue in m million NOK"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            exclude=["2020"]
        ),
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Operating revenue in m million NOK"
        )
    ],
    "ops3": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n3"], sentenceIndex=3),
            field="Operating revenue in m million NOK",
            targetA="ref:n3",
            targetB="ref:n1",
            signed=True
        )
    ]
}

spec_4twwx65oath7vrkt = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Trade_Type",
            group="Imports"
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Value_Trillion_USD",
            which="min"
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            field="Value_Trillion_USD",
            value=1.15
        )
    ],
    "ops2": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            filed="Trade_Type",
            group="Exports"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2000"]
        ),
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n5",
            targetB=1.15
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2001"]
        ),
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n7",
            targetB=1.15
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2002"]
        ),
        CompareOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n9",
            targetB=1.15
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2003"]
        ),
        CompareOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n11",
            targetB=1.15
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2004"]
        ),
        CompareOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n13",
            targetB=1.15
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2005"]
        ),
        CompareOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n15"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n15",
            targetB=1.15
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2006"]
        ),
        CompareOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n17"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n17",
            targetB=1.15
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2007"]
        ),
        CompareOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n19"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n19",
            targetB=1.15
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2008"]
        ),
        CompareOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n21"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n21",
            targetB=1.15
        ),
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n22"], sentenceIndex=2),
            field="Year",
            include=["2009"]
        ),
        CompareOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n23"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n23",
            targetB=1.15
        ),
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=["n4"], sentenceIndex=2),
            filed="Year",
            include=["2010"]
        ),
        CompareOp(
            id="n26",
            meta=OpsMeta(nodeId="n14", inputs=["n25"], sentenceIndex=2),
            field="Value_Trillion_USD",
            operator="<",
            targetA="ref:n25",
            targetB=1.15
        ),
        FilterOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=["n4"], sentenceIndex=2),
            field="Year",
            include=["2011"]
        ),
    ],
    "ops3": [
        RetrieveValueOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=[], sentenceIndex=3),
            field="Year",
            target=2008
        ),
        RetrieveValueOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=[], sentenceIndex=3),
            field="Year",
            target=2010
        ),
        RetrieveValueOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=[], sentenceIndex=3),
            field="Year",
            target=2011
        ),
    ]
}

spec_1ar60b8rke2d8e64 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Retention rate",
            by="Time Period",
            groupA="Average",
            groupB="Messaging apps"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Time Period",
            taget="1st month"
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Time Period",
            taget="2nd month"
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Time Period",
            taget="3rd month"
        ),
        RetrieveValueOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Time Period",
            taget="6th month"
        ),
        RetrieveValueOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Time Period",
            taget="12th month"
        ),
    ],
    "ops3": [
        FindExtremumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentneceIndex=3),
            field="Retention rate",
            which="min"
        )
    ]
}

spec_7w9v4fsbg5ydxsr2 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009", "2011", "2013", "2015", "2017"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            filed="Year",
            exclude=["2009", "2011", "2013", "2015", "2017"]
        )
    ],
    "ops2": [
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], setnenceIndex=2),
            field="Percentage of gross domestic product",
        ),
        ScaleOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Percentage of gross domestic product",
            factor=1 / 5
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2"], setnenceIndex=2),
            field="Percentage of gross domestic product",
        ),
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=2),
            field="Percentage of gross domestic product",
            factor=1 / 5
        )
    ],
    "ops3": [
        AverageOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n1"], senteceIndex=3),
            field="Percentage of gross domestic product"
        ),
        AverageOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n2"], senteceIndex=3),
            field="Percentage of gross domestic product"
        ),
    ],
    "ops4": [
        DiffOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n7", "n8"], sentenceIndex=4),
            field="Percentage of gross domestic product",
            targetA="ref:n8",
            targetB="ref:n8"
        )
    ]
}

spec_1a09xqtrj8zms716 = {
    "ops": [
        FindExtremumOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="US dollars per square foot",
            which="max",
            rank=1
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="US dollars per square foot",
            which="max",
            rank=2
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="US dollars per square foot",
            which="max",
            rank=3
        ),
    ],
    "ops2": [
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n2", "n3"], sentenceIndex=2),
            field="US dollars per square foot"
        ),
        ScaleOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="US dollars per square foot",
            factor=1 / 3
        )
    ]
}

spec_1bbe64wpvq06sknm = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number of days in thousands"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2010/11"]
        ),
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n2",
            signed=True
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2011/12"]
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n4"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n4",
            signed=True
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2013/14"]
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n1", "n7"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n7",
            signed=True
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2014/15"]
        ),
        DiffOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n1", "n8"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n8",
            signed=True
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2015/16"]
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n1", "n10"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n10",
            signed=True
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2016/17"]
        ),
        DiffOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n1", "n12"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n12",
            signed=True
        ),
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2016/17"]
        ),
        DiffOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n1", "n14"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n14",
            signed=True
        ),
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2017/18"]
        ),
        DiffOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n1", "n16"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n16",
            signed=True
        ),
        FilterOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2018/19"]
        ),
        DiffOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n1", "n19"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n19",
            signed=True
        ),
    ],
    "ops3": [
        FilterOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n3", "n5", "n7", "n9", "n11", "n13", "n15", "n17", "n19"],
                         sentenceIndex=3),
            field="Number of days in thousands",
            operator="<",
            value=0
        )
    ]
}

spec_16fif5hdi8yzml00 = {
    "ops": [
        CompareOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Payment_Million_USD",
            groupA="Maximum",
            groupB="Minimum",
            which="max"
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Payment_Million_USD"
        )
    ],
    "ops2": [
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Payment_Million_USD",
            groupA="Maximum",
            groupB="Minimum",
            which="min"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Payment_Million_USD"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Payment_Million_USD",
            targetA="ref:n4",
            targetB="ref:n2"
        )
    ]
}

spec_827lhm2w7n652knp = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number of immigrants in millions",
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["1997", "2007"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2007", "2008"]
        )
    ],
    "ops3": [

    ],
    "ops4": [
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=4),
            field="Year",
            value=2007
        )
    ]
}

spec_12sdcc2xjltg7qj2 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Value_Million_USD",
            by="Year",
            seriesField="Category"
        )
    ],
    "ops2": [

    ]
}

spec_72yqb8jwj9a6g4nx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2005", "2006", "2007", "2008", "2009", "2010"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inpupts=["n1"], sentenceIndex=1),
            field="Percentage of internet users"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2011", "2012", "2013", "2014", "2015"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Percentage of internet users"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Percentage of internet users",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

spec_6al86e9qyokma74i = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Number of renunciations"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n2",
            which="min"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2009"]
        ),
        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n3"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n3",
            which="min"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2010"]
        ),
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1", "n5"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n5",
            which="min"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2011"]
        ),
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n1", "n7"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n7",
            which="min"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2012"]
        ),
        CompareOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n1", "n9"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n9",
            which="min"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2013"]
        ),
        CompareOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n1", "n11"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n11",
            which="min"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2014"]
        ),
        CompareOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n1", "n13"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n13",
            which="min"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2015"]
        ),
        CompareOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n1", "n15"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n15",
            which="min"
        ),
    ],
    "ops": [
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndx=3),
            field="Year",
            include=["2008", "2009", "2010", "2012"]
        ),
        CountOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n17"], sentenceIndex=3),
            field="Year",
        )
    ]
}

spec_724mfnyk34kp97le = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Cinema visits in millions"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2001"]
        ),
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n2",
            which="min"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2002"]
        ),
        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n3"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n3",
            which="min"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2003"]
        ),
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1", "n5"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n5",
            which="min"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2004"]
        ),
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n1", "n7"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n7",
            which="min"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2005"]
        ),
        CompareOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n1", "n9"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n9",
            which="min"
        ),
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2006"]
        ),
        CompareOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n1", "n11"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n11",
            which="min"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2007"]
        ),
        CompareOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n1", "n13"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n13",
            which="min"
        ),
        FilterOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        CompareOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n1", "n15"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n15",
            which="min"
        ),
        FilterOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2009"]
        ),
        CompareOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n1", "n17"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n17",
            which="min"
        ),
        FilterOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2010"]
        ),
        CompareOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n1", "n19"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n19",
            which="min"
        ),
        FilterOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2011"]
        ),
        CompareOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n1", "n21"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n21",
            which="min"
        ),
        FilterOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2012"]
        ),
        CompareOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n1", "n23"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n23",
            which="min"
        ),
        FilterOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2013"]
        ),
        CompareOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n1", "n25"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n25",
            which="min"
        ),
        FilterOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2014"]
        ),
        CompareOp(
            id="n28",
            meta=OpsMeta(nodeId="n28", inputs=["n1", "n27"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n27",
            which="min"
        ),
        FilterOp(
            id="n29",
            meta=OpsMeta(nodeId="n29", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2015"]
        ),
        CompareOp(
            id="n30",
            meta=OpsMeta(nodeId="n30", inputs=["n1", "n29"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n29",
            which="min"
        ),
        FilterOp(
            id="n31",
            meta=OpsMeta(nodeId="n31", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2017"]
        ),
        CompareOp(
            id="n32",
            meta=OpsMeta(nodeId="n32", inputs=["n1", "n31"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n31",
            which="min"
        ),
        FilterOp(
            id="n33",
            meta=OpsMeta(nodeId="n33", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2018"]
        ),
        CompareOp(
            id="n34",
            meta=OpsMeta(nodeId="n34", inputs=["n1", "n33"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n33",
            which="min"
        ),
        FilterOp(
            id="n35",
            meta=OpsMeta(nodeId="n35", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2019"]
        ),
        CompareOp(
            id="n36",
            meta=OpsMeta(nodeId="n36", inputs=["n1", "n35"], sentenceIndex=2),
            targetA="ref:n1",
            targetB="ref:n31",
            which="min"
        ),
    ],
    "ops3": [
        FilterOp(
            id="n37",
            meta=OpsMeta(nodeId="n37", inputs=["n1"], sentenceIndex=3),
            field="Cinema visits in millions",
            opertor="<",
            value="ref:n1"
        ),
        CountOp(
            id="38",
            meta=OpsMeta(nodeId="n38", inputs=["n37"], sentenceIndex=3),
            field="Year"
        )
    ]
}

spec_1q3mzgt77lwo172f = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="0 – 500 million US dollars"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            group="Over 10,001 million U.S. dollars"
        )
    ],
    "ops2": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            field="Market share",
            targetA="ref:n1",
            targetB="ref:n2"
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=3),
            field="Market share",
            which="max"
        )
    ]
}

spec_0xo3r87obscjsktm = {
    "ops": [
        RetrieveValueOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Country",
            target="El Salvador"
        ),
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Country",
            target="Ukraine"
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Country",
            target="Denmark"
        ),
    ],
    "ops2": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n2"], sentenceIndex=2),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n3"], sentenceIndex=2),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n1",
            targetB="ref:n3"
        )
    ],
    "ops3": [
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1", "n2"], sentenceIndex=3),
            target="ref:n1",
            value="ref:n2"
        )
    ]
}

spec_0ykydh8vao50ceou = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Channel",
            include=["Agents"]
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=1),
            field="Share of total gross premiums written",
            targetA="ref:n2",
            targetB="ref:n3"
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Channel",
            include=["Bancassurance"]
        ),
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n5"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),
        DiffOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n6", "n7"], sentenceIndex=1),
            field="Share of total gross premiums written",
            targetA="ref:n6",
            targetB="ref:n7"
        ),
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=1),
            field="Channel",
            include=["Brokers"]
        ),
        FindExtremumOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n9"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),
        DiffOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n10", "n11"], sentenceIndex=1),
            field="Share of total gross premiums written",
            targetA="ref:n10",
            targetB="ref:n11"
        ),
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=[], sentenceIndex=1),
            field="Channel",
            include=["Direct writing"]
        ),
        FindExtremumOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n13"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n13"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),
        DiffOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n14", "n15"], sentenceIndex=1),
            field="Share of total gross premiums written",
            targetA="ref:n14",
            targetB="ref:n15"
        ),
    ],
    "ops2": [
        SortOp(
            id="n17",
            meta=OpsMeta(nodeId="n16", inputs=["n4"], sentenceIndex=2),
            field="Share of total gross premiums written",
            order=["asc"]
        ),
        SortOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n8"], sentenceIndex=2),
            field="Share of total gross premiums written"
        ),
        SortOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n12"], sentenceIndex=2),
            field="Share of total gross premiums written"
        ),
        SortOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n16"], sentenceIndex=2),
            field="Share of total gross premiums written"
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=[], sentenceIndex=3),
            field="Channel",
            target="Direct writing"
        )
    ]
}

spec_4p1m4tsmzmtvsrys = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Obama"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            group="Romney"
        ),
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=1),
        )
    ]
}