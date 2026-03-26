from opsspec.specs import *

# simple bar
spec_0o12tngadmjjux2n = { # chatgpt 정답 통과
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
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Production in million units",
            operator=">",
            value="ref:n1"
        )
    ]
}
spec_0pzdf7hfbxgjghsa = {
    "ops":[
        RetrieveValueOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            target="2016"
        ),
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            target="2017"
        ),
    ],
    "ops2": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            target="2017"
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Year",
            target="2018"
        ),
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n2"], sentenceIndex=3),
            targetA="ref:n1",
            targetB="ref:n2",
        ),
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n4"], sentenceIndex=3),
            targetA="ref:n3",
            targetB="ref:n4",
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n5", "n6"], sentenceIndex=3),
            targetA="ref:n5",
            targetB="ref:n6",
        )
    ]
}
spec_0k7bm9iqewnrzj47 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2008", "2019", "2020"]
        ),
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Production in million liters",
        ),
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Year",
            include=["1995", "2000", "2005"]
        ),
    ],
    "ops4": [
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=4),
            field="Production in million liters",
        ),
    ],
    "ops5": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=5),
            which="min",
            targetA="ref:n2",
            targetB="ref:n4",
        ),
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=5),
            target="ref:n5", factor=2.0
        )
    ],
    "ops6": [
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n2", "n4"], sentenceIndex=6),
            which="max",
            targetA="ref:n2",
            targetB="ref:n4",
        ),
        CompareBoolOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n6", "n7"], sentenceIndex=6),
            operator=">",
            targetA="ref:n6",
            targetB="ref:n7",
        ),
    ],
}
spec_0w88bu7qm4ilsqmh = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["1995", "1999"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Installed base in million units",
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            include=["2010", "2013", "2017"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Installed base in million units",
        ),
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Installed base in million units",
            targetA="ref:n2",
            targetB="ref:n4",
        ),
    ],
}

# stacked bar
spec_10t8o5vhethzeod1 = {
    "ops":[
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Agriculture"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_GDP",
            which="max"
        )
    ]
}
spec_0aj7na7tkqb7iomu = {
    "ops": [
        RetrieveValueOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            target="2017",
            group="Tablets"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Year",
            target="2022",
            group="Mobile PCs"
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Installed_Base_Millions",
            which="max",
        )
    ],
    "ops4": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n2"], sentenceIndex=4),
            field="Installed_Base_Millions",
            targetA="ref:n1",
            targetB="ref:n2",
        )
    ]
}
spec_0gzowodb2py0d1s9 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group=["Philippines", "Thailand"]
        )
    ],
    "ops2": [
        PairDiffOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            by="Country_Region",
            field="Revenue_Million_USD",
            groupA="Thailand",
            groupB="Philippines",

        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Revenue_Million_USD",
            operator=">",
            value=0,
        ),
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=3),
            field="Revenue_Million_USD",
        )
    ]
}
spec_004fhteah0l9kud2 = {
    "ops": [
        SumOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Revenue_Million_Euros",
            group="Commercial",
        ),
    ],
    "ops2": [
        ScaleOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            target="ref:n1",
            factor=1/6,
        )
    ],
    "ops3": [
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Revenue_Million_Euros",
            group="Matchday",
        )
    ],
    "ops4": [
        ScaleOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=4),
            target="ref:n3",
            factor=1/6,
        )
    ],
    "ops5": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=5),
            targetA="ref:n2",
            targetB="ref:n4",
            signed=True,
            field="Revenue_Million_Euros",
        )
    ],
}
spec_11e148qcs7x70t8v = {
    "ops": [
        PairDiffOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            by="Race/Ethnicity",
            field="Share_of_Import_Value",
            groupA="South Korea",
            groupB="France",
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Share_of_Import_Value",
            operator=">",
            value=0,
        ),
    ]
}
#
# grouped bar
spec_0prhtod4tli879nh = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            by="City",
            seriesField="Population in millions",
            field="Year",
            groupA="2010",
            groupB="2025",
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
spec_0egzejn5mejtnfdm = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="Scotland"
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="SharePercentage",
            which="max"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            group="England & Wales"
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="SharePercentage",
            which="min"
        ),
    ],
    "ops3": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            targetA="ref:n2",
            targetB="ref:n4",
            which="max"
        ),
    ],
    "ops4": [
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n2", "n4"], sentenceIndex=4),
            field="SharePercentage",
            targetA="ref:n2",
            targetB="ref:n4",
        )
    ]
}
spec_0opt5fjw2xphdgp2 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Frequency",
            include=["Occasionally (less than once a month)",]
        ),
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of respondents"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Frequency",
            include=["Infrequently (once a year or less)",]
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Share of respondents"
        ),
    ],
    "ops2": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=2),
            field="Frequency",
            targetA="ref:n2",
            targetB="ref:n4",
            which="max"
        )
    ]

}
spec_0vw6ydim9cff8ji6 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Industry Sector",
            include=["Construction",],
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of SMEs",
            which="max"
        )
    ]
}
#
# # simple line
spec_10gtgmmgh599jnr7 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2000", "2009"]
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Percentage_of_Population",
            which="max",
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2000", "2009"],
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Percentage_of_Population",
            which="max",
            rank=2
        ),
    ],
    "ops3": [
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=3),
            field="Year",
            operator="between",
            value=["2000", "2009"],
        ),
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=3),
            field="Percentage_of_Population",
            which="min",
        ),
    ],
    "ops4": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n4", "n6"], sentenceIndex=4),
            field="Percentage_of_Population",
            targetA="ref:n4",
            targetB="ref:n6",
        )
    ]
}
spec_1sf5c8wqw1192q6b = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Growth rate of HICP (%)"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Growth rate of HICP (%)",
            operator="<",
            value="ref:n1"
        ),
    ],
    "ops3": [
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
        )
    ]
}
spec_66va2s35es5t86l3 = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="In millions"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="In millions",
            which="max"
        )
    ]
}
spec_7272hodb02i6e09q = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2009", "2013"],

        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Population growth compared to previous year",
            which="max"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2014", "2019"]
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Population growth compared to previous year",
            which="max"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Population growth compared to previous year",
            targetA="ref:n2",
            targetB="ref:n4",
        )
    ]
}

# # multi line
spec_23wg8zio5ahp40tg = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            by="Year",
            groupA="Favor",
            groupB="Oppose",
            field="Percentage",
            signed=True
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Percentage",
            which="max"
        ),
    ]
}
spec_16aphfabldrpgcmd = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average weight in metric grams",
            operator=">",
            value=3670,
            group="Boys"
        ),
        CountOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Average weight in metric grams"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Average weight in metric grams",
            operator=">",
            value=3550,
            group="Girls"
        ),
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Average weight in metric grams"
        )
    ],
    "ops3": [
        AddOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Average weight in metric grams",
            targetA="ref:n2",
            targetB="ref:n4",
        )
    ]
}
spec_2kmpy10btl65kr2j = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2015", "2017"],
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Percentage_of_Respondents"
        )
    ]
}
spec_3z678inbp0t89ahu = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage_of_Respondents",
            group="Dissatisfied",
        ),
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Percentage_of_Respondents",
            group="Satisfied",
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Percentage_of_Respondents",
            targetA="ref:n1",
            targetB="ref:n2",
        ),
    ],
    "ops4": [
        PairDiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=4),
            by="Opinion",
            field="Percentage_of_Respondents",
            seriesField="Opinion",
            groupA="Dissatisfied",
            groupB="Satisfied",
        )
    ],
    "ops5": [
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3", "n4"], sentenceIndex=5),
            field="Percentage_of_Respondents",
            operator="<",
            value="ref:n3"
        )
    ]
}
