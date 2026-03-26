from opsspec.specs import *

spec_08x3crju85yix5ab = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="CPI_Score",
            operator="==",
            value=80
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="CPI_Score",
            operator="<",
            value="ref:n1"
        )
    ],
    "ops3": [
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="CPI_Score",
        )
    ]
}

spec_0bunvsqd54e3qahz = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2010"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Life expectancy at birth in years",
            group="Female"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2016"]
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Life expectancy at birth in years",
            group="Male"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Life expectancy at birth in years",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# 확인
# field가 json 파일의 field 값을 가져오는 것인가?
spec_0bgcjlbz7nv5vnjc = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="SharePercentage",
            by="Age Group",
            groupA="5–10 years",
            groupB="11–15 years"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="SharePercentage",
            order=["desc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="SharePercentage",
            which="max",
            rank=1
        ),
        FindExtremumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=3),
            field="SharePercentage",
            which="max",
            rank=2
        ),
        FindExtremumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2"], sentenceIndex=3),
            field="SharePercentage",
            which="max",
            rank=3
        )
    ],
    "ops4": [
        ScaleOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3"], sentenceIndex=4),
            field="SharePercentage",
            factor=1 / 3
        ),
        ScaleOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n4"], sentenceIndex=4),
            field="SharePercentage",
            factor=1 / 3
        ),
        ScaleOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n5"], sentenceIndex=4),
            field="SharePercentage",
            factor=1 / 3
        ),
    ]
}

spec_08iur64i01boakg5 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage of 25 to 29 year olds",
            by="Gender",
            groupA="Male",
            groupB="Female"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Percentage of 25 to 29 year olds",
            order=["desc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Percentage of 25 to 29 year olds",
            which="max"
        )
    ]
}

spec_05qg5ubxklojfze7 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Severity",
            group="Major problem"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Severity",
            group="Minor problem"
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=3),
            field="Share_of_Respondents",
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=4),
            field="Share_of_Respondents"
        )
    ],
    "ops2": [
        CompareOp(
            id="n5",
            meta=OpsMeta(nodeId="n4", inputs=["n3", "n4"], sentenceIndex=5),
            field="Share_of_Respondents",
            which="max",
            targetA="ref:n3",
            targetB="ref:n4"
        )
    ]
}

spec_0b9o2vahkw2a1bxy = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Opinion",
            group="No"
        ),
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of respondents",
            order=["desc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Share of respondents",
            which="max"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Opinion",
            group="Yes"
        ),
        SortOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=3),
            field="Share of respondents",
            order=["desc"]
        )
    ],
    "ops4": [
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=4),
            field="Share of respondents",
            which="max",
            rank=3
        )
    ],
    "ops5": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=5),
            field="Share of respondents",
            targetA="ref:n3",
            targetB="ref:n6"
        )
    ]
}

# 확인
spec_0v0l4wdbx7orkqz1 = {
    "ops": [
        # FilterOp(
        #   id="n1",
        #   meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
        #   field="Suicides per 100,000 population",
        #   operator="<",
        #   value=30
        # ),
        # FilterOp(
        #   id="n2",
        #   meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
        #   field="Suicides per 100,000 population",
        #   operator=">",
        #   value=70
        # )
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Age group",
            include=["15–19", "20–24", "25–29"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Age group",
            include=["70–74", "75–79", "80–84", "85–89", "90+"]
        )
    ],
    "ops2": [
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Suicides per 100,000 population"
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=2),
            field="Suicides per 100,000 population"
        )
    ],
    "ops3": [
        CompareBoolOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3", "n4"], sentenceIndex=3),
            targetA="ref:n3",
            targetB="ref:n4"
        )
    ]
}

spec_14jud3ymyoonba4e = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Sector",
            group="Global Performance Nutrition"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Sector",
            group="Global Nutritionals"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Sector",
            group="Joint Ventures & Associates"
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=1),
            field="Revenue_Million_Euros"
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2"], sentenceIndex=1),
            field="Revenue_Million_Euros"
        ),
        SumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3"], sentenceIndex=1),
            field="Revenue_Million_Euros"
        )
    ],
    "ops2": [
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n4", "n5"], sentenceIndex=2),
            field="Revenue_Million_Euros",
            targetA="ref:n4",
            targetB="ref:n5",
            which="max"
        ),
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n6", "n7"], sentenceIndex=2),
            field="Revenue_Million_Euros",
            targetA="ref:n6",
            targetB="ref:n7",
            which="max"
        )
    ]
}

spec_5lhrulhnl0io2r81 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Producer Price Index (100=2009)",
            operator="<",
            value=210
        )
    ],
    "ops2": [
        CountOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Producer Price Index (100=2009)"
        )
    ]
}

spec_2hjkdo5w242alvjd = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2006", "2011"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Opinion",
            group="Satisfied"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Percentage_of_Respondents",
            operator=">",
            value=50
        ),
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Year"
        )
    ],
    "ops3": [
        CompareBoolOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage_of_Respondents",
            operator=">",
            targetA="ref:n4",
            targetB=3
        )
    ]
}

spec_0vmvmj77j3p6vcy7 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2010", "2015"]
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Net income in USD"
        )
    ]
}

# 다시
# 확인
spec_174uq759pluu079w = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2017", "2018"]
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Shipments_Million_Units",
            order=["asc"]
        )
    ]
}

# 확인
spec_0w5jptak9peti0mj = {
    "ops": [
        # 2015
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2015"]
        ),
        NthOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),

        # 2016
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2016"]
        ),
        NthOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),

        # 2017
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2017"]
        ),
        NthOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),

        # 2018
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2018"]
        ),
        NthOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),

        # 2019
        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2019"]
        ),
        NthOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n9"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),

        # 2020
        FilterOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2020"]
        ),
        NthOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n11"], sentenceIndex=1),
            field="Annual revenue in million USD",
            order=["asc"],
            orderField="Region",
            n=1
        ),
    ],

    "ops2": [
        FilterOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n2", "n4", "n6", "n8", "n10", "n12"], sentenceIndex=1),
            field="Region",
            operator="==",
            value="APAC"
        )
    ]
}

spec_5po479f2ju9lqv16 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2011", "2017"]
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Inhabitants in billions",
        )
    ]
}

spec_0vqxnzu0mpbz12ch = {
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
            include=["2018"]
        ),
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=1),
            field="Share of population with a smartphone",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2025"]
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2023"]
        ),
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n1", "n2"], sentenceIndex=1),
            field="Share of population with a smartphone",
            targetA="ref:n4",
            targetB="ref:n5"
        )
    ],
    "ops2": [
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=2),
            field="Share of population with a smartphone",
            targetA="ref:n3",
            targetB="ref:n6",
            which="max"
        )
    ]
}

spec_19xwo5oscmgpcdyl = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Energy_Type",
            group="Oil"
        ),
        ScaleOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            target="ref:n1",
            field="Subsidies_Billion_USD",
            factor=1 / 3
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Energy_Type",
            group="Gas"
        ),
        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=1),
            field="Subsidies_Billion_USD",
            which="max",
            targetA="ref:n2",
            targetB="ref:n3"
        )
    ],
    "ops2": [
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4"], sentenceIndex=2),
            field="Energy_Type",
            group="Coal"
        ),
        SumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=2),
            field="Subsidies_Billion_USD"
        )
    ]
}

spec_0wgqpso2vnilpym6 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Region",
            include=["Alaska"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Production in million barrels per day",
            group="2000"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            field="Production in million barrels per day",
            group="2020"
        ),
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=1),
            field="Production in million barrels per day",
            targetA="ref:n2",
            targetB="ref:n3"
        )
    ],
    "ops2": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=2),
            field="Production in million barrels per day",
            group="2000"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Production in million barrels per day",
            group="2020"
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Production in million barrels per day",
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=2),
            field="Production in million barrels per day",
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3", "n4"], sentenceIndex=2),
            field="Production in million barrels per day",
            targetA="ref:n3",
            targetB="ref:n4"
        )
    ]
}

spec_651x1l1swysyy6vp = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents who are worried",
            order=["asc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Share of respondents who are worried",
            whick="max",
            rank=5
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Date"
        )
    ]
}

spec_2s65jcap9pn289qx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2016", "2020"]
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Population_Million_Inhabitants",
            group="Male"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Population_Million_Inhabitants",
            group="Female"
        ),
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=2),
            field="Population_Million_Inhabitants",
            targetA="ref:n2",
            targetB="ref:n3"
        )
    ],
    "ops3": [
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=3),
            field="Population_Million_Inhabitants"
        )
    ]
}

spec0vvz9mdgdiazke5o = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2012", "2015"]
        )
    ],
    "ops2": [
        SumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Gross payment volume in billion USD",
        )
    ]
}

spec_19msoowya2szdynd = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share_of_GDP",
            operator=">",
            value=0.2
        )
    ],
    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_GDP",
        )
    ]
}

spec_0xc7sx6ll8fl5rgh = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Candidate",
            group="Bernie Sanders"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Candidate",
            group="Hillary Clinton"
        ),
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=1),
            field="Percentage of votes",
            operator="<",
            targetA="ref:n2",
            targetB="ref:n1"
        )
    ],
    "ops2": [
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Percentage of votes"
        )
    ]
}

spec_3tc31k5k2o6wmvyp = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Candidate_Support",
            group="Support Rep candidate"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Percent_Do_Not_Want_Reelected",
            group="Support Dem candidate"
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            field="Percent_Do_Not_Want_Reelected"
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=1),
            field="Percent_Do_Not_Want_Reelected"
        ),
        FilterOp(

        )
    ],
    "ops2": [
        CountOp(
            id="",
            meta=OpsMeta(nodeId="", inputs=[], sentenceIndex=2)
        )
    ]
}

# 중복
# spec_12sdcc2xjltg7qj2={
#   "ops":[
#     PairDiffOp(
#       id="n1",
#       meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
#       field="Value_Million_USD",
#       groupA="Total contributions to presidential candidates",
#       groupB="Total spending by presidential candidates"
#     )
#   ],
#   "ops2":[
#     FindExtremumOp(
#       id="n2",
#       meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
#       field="Value_Million_USD",
#       which="max"
#     ),
#     FindExtremumOp(
#       id="n3",
#       meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
#       field="Value_Million_USD",
#       which="min"
#     ),
#     DiffOp(
#       id="n4",
#       meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=2),
#       field="Value_Million_USD",
#       targetA="ref:n2",
#       targetB="ref:n3"
#     )
#   ],
#   "ops3":[
#     ScaleOp(

#     )
#   ]
# }

spec_72yqb8jwj9a6g4nx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2011", "2015"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Percentage of internet users"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2005", "2010"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n2", inputs=["n3"], sentenceIndex=2),
            field="Percentage of internet users"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n3", inputs=["n2", "n4"], sentenceIndex=3),
            field="Percentage of internet users"
        )
    ]
}

spec_6al86e9qyokma74i = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputer=[], sentenceIndex=1),
            field="Number of renunciations"
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Number of renunciations",
            operator="<",
            value="ref:n1"
        ),
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Year"
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
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            filed="Cinema visits in millions",
            operator="<",
            value="ref:n1"
        )
    ],
    "ops3": [
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"]),
            field="Year"
        )
    ]
}

# 확인
# Year만 가져오기?
# Retrieve
spec_1q3mzgt77lwo172f = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Asset Size",
            targetA="0 – 500 million US dollars",
            targetB="2,001 – 10,000 million US dollars"
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
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
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            target="El Salvador"
        )
    ],
    "ops2": [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            target="Ukraine"
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n1",
            targetB="ref:n2"
        )
    ],
    "ops4": [
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            target="Denmark"
        )
    ],
    "ops5": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n4"], sentenceIndex=3),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n1",
            targetB="ref:n4"
        )
    ],
    "ops6": [
        CompareOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n5"], sentenceIndex=3),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n3",
            targetB="ref:n5",
            which="max"
        )
    ],
    "ops7": [
        CompareOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n5"], sentenceIndex=3),
            field="Mortality, Per 1 000 000 Inhabitants, 1997",
            targetA="ref:n3",
            targetB="ref:n5",
            which="min"
        ),
        # 확인
        ScaleOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n6", "n7"], sentenceIndex=3),
            target="ref:n6",
            factor=1 / "ref:n7"
        )
    ],
}

spec_0ykydh8vao50ceou = {
    "ops": [
        # Agents
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Channel",
            value="Agents"
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

        # Bancassurance
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=1),
            field="Channel",
            value="Bancassurance"
        ),
        FindExtremumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),

        # Brokers
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=[], sentenceIndex=1),
            field="Channel",
            value="Brokers"
        ),
        FindExtremumOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="max"
        ),
        FindExtremumOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n7"], sentenceIndex=1),
            field="Share of total gross premiums written",
            which="min"
        ),
    ],

    "ops2": [
        DiffOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n2", "n3"], sentenceIndex=2),
            field="Share of total gross premiums written",
            targetA="ref:n2",
            targetB="ref:n3"
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n5", "n6"], sentenceIndex=2),
            field="Share of total gross premiums written",
            targetA="ref:n5",
            targetB="ref:n6"
        ),
        DiffOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n8", "n9"], sentenceIndex=2),
            field="Share of total gross premiums written",
            targetA="ref:n8",
            targetB="ref:n9"
        )
    ],

    "ops3": [
        CompareOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n10", "n11"], sentenceIndex=3),
            field="Share of total gross premiums written",
            targetA="ref:n10",
            targetB="ref:n11",
            which="max"
        ),

        CompareOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n12", "n13"], sentenceIndex=3),
            field="Share of total gross premiums written",
            targetA="ref:n12",
            targetB="ref:n13",
            which="max"
        )
    ]
}

spec_4p1m4tsmzmtvsrys = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share_of_Respondents",
            by="Candidate",
            groupA="Obama",
            groupB="Romney",
            signed=True
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share_of_Respondents",
            operator=">",
            value=0
        ),
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=1),
            field="Date_Range"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=2),
            field="Share_of_Respondents",
            operator="<",
            value=0
        ),
        CountOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2"], sentenceIndex=2),
            field="Date_Range"
        )
    ],
    "ops4": [
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n5"], sentenceIndex=3),
            field="Date_Range",
            targetA="ref:n3",
            targetB="ref:n5"
        )
    ]
}

spec_0wflwm4jebx7n12y = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Number of fires",
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Number of fires",
            which="max"
        )
    ],
    "ops3": [
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Number of fires",
            groupA="ref:n1",
            groupB="ref:n2"
        )
    ]
}

spec_0zjxkqy20iibpdvo = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents",
            by="Gender",
            groupA="Male",
            groupB="Female",
            signed=True
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of respondents",
            operator="<",
            value=0
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Gender",
            group="Female"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Share of respondents"
        )
    ],
    "ops3": [
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1"], sentenceIndex=3),
            field="Share of respondents",
            operator=">",
            value=0
        ),
    ],
    "ops4": [
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n5"], sentenceIndex=4),
            field="Gender",
            group="Male"
        ),
        AverageOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=4),
            field="Share of respondents"
        )
    ],
    "ops5": [
        DiffOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n4", "n7"], sentenceIndex=5),
            field="Share of respondents",
            targetA="ref:n4",
            targetB="ref:n7"
        )
    ]
}

spec_0xnim79vztf8hjor = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average ticket price in US dollars"
        )
    ],
    "ops2": [
        # 05/06
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["05/06"]
        ),
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        # 06/07
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["06/07"]
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n1", "n4"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n4"
        ),
        # 07/08
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["07/08"]
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n1", "n6"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n6"
        ),
        # 08/09
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["08/09"]
        ),
        DiffOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n1", "n8"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n8"
        ),
        # 09/10
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["09/10"]
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n1", "n10"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n10"
        ),
        # 10/11
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["10/11"]
        ),
        DiffOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n1", "n12"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n12"
        ),
        # 11/12
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["11/12"]
        ),
        DiffOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n1", "n14"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n14"
        ),
        # 12/13
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["12/13"]
        ),
        DiffOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n1", "n16"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n15"
        ),
        # 13/14
        FilterOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["13/14"]
        ),
        DiffOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n1", "n18"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n18"
        ),
        # 14/15
        FilterOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["14/15"]
        ),
        DiffOp(
            id="n21",
            meta=OpsMeta(nodeId="n19", inputs=["n1", "n20"], sentenceIndex=2),
            field="Average ticket price in US dollars",
            targetA="ref:n1",
            targetB="ref:n20"
        ),
    ],
    "ops3": [
        FindExtremumOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n3", "n7", "n9", "n11", "n13", "n15", "n17", "n19", "n21"],
                         sentenceIndex=3),
            field="Average ticket price in US dollars",
            which="max"
        ),
        # Year?
        # 확인
        RetrieveValueOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n22"], sentenceIndex=3),
            field="Average ticket price in US dollars",
            target="ref:n22"
        )
    ]
}

spec_0yx2080f08329xxb = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009", "2010", "2011", "2012", "2013"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            group="Supermarkets & hypermarkets",
        )
    ],
    "ops2": [
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Value market share"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=3),
            group="Discounters",
        )
    ],
    "ops4": [
        AverageOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=4),
            field="Value market share"
        )
    ],
    "ops5": [
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n2", "n4"], sentenceIndex=5),
            field="Value market share",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ],
    "ops6": [
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=6),
            field="Year",
            include=["2014", "2015", "2016", "2017", "2018"]
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=6),
            group="Supermarkets & hypermarkets",
        )
    ],
    "ops7": [
        AverageOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n8"], sentenceIndex=7),
            field="Value market share"
        )
    ],
    "ops8": [
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n7"], sentenceIndex=8),
            group="Discounters",
        )
    ],
    "ops9": [
        AverageOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n10"], sentenceIndex=9),
            field="Value market share"
        )
    ],
    "ops10": [
        DiffOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n9", "n11"], sentenceIndex=10),
            field="Value market share",
            targetA="ref:n9",
            targetB="ref:n11"
        )
    ],
    "ops11": [
        DiffOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n6", "n12"], sentenceIndex=11),
            field="Value market share",
            targetA="ref:n6",
            targetB="ref:n12"
        )
    ]
}

spec_3z678inbp0t89ahu = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage_of_Respondents",
            group="Dissatisfied"
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Percentage_of_Respondents"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Percentage_of_Respondents",
            group="Satisfied"
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Percentage_of_Respondents"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Percentage_of_Respondents",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ],
    "ops4": [
        PairDiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=4),
            field="Percentage_of_Respondents",
            groupA="Dissatisfied",
            groupB="Satisfied"
        )
    ],
    "ops5": [
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n5", "n6"], sentenceIndex=5),
            field="Percentage_of_Respondents",
            operator="<",
            value="ref:n5"
        ),
        CountOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n7"], sentenceIndex=5),
            field="Year"
        )
    ]
}

spec_3un2wyjae3ebkncl = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share_of_Respondents",
            group="Newspaper"
        ),

        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Share_of_Respondents",
            group="Radio"
        ),

        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Share_of_Respondents",
            group="Internet"
        ),

        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n3"], sentenceIndex=1),
            field="Share_of_Respondents",
            targetA="ref:n1",
            targetB="ref:n3",
            which="max"
        ),

        CompareOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n4"], sentenceIndex=1),
            field="Share_of_Respondents",
            targetA="ref:n1",
            targetB="ref:n4",
            which="min"
        ),
    ],
    "ops2": [
        AverageOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Share_of_Respondents"
        )
    ]
}

spec_1xz4egh52kvh2xwx = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2017", "2020"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Region",
            group="Canada"
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            field="Region",
            group="Other International"
        ),
        SumOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=1),
            field="Total_Revenue_Million_USD"
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3"], sentenceIndex=1),
            field="Total_Revenue_Million_USD"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Region",
            group="US"
        ),
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n6"], sentenceIndex=2),
            field="Year",
            include=["2020"]
        )
    ],
    "ops3": [
        CompareOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n3", "n7"], sentenceIndex=3),
            field="Total_Revenue_Million_USD",
            targetA="ref:n3",
            targetB="ref:n7",
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
            inlcude=["2009", "2010", "2011", "2012", "2013"]
        ),
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Population growth compared to previous year",
            which="max"
        ),
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            inlcude=["2015", "2016", "2017", "2018", "2019"]
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
            filed="Population growth compared to previous year",
            targetA="ref:n2",
            targetB="ref:n4",
        )
    ]
}

# 다시
spec_1y6itl6f2ho959ec = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Country_Region",
            include=["Chile"]
        ),

        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Opinion",
            group="Disapproves"
        )
    ],

    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1),
            field="Opinion",
            group="No answer"
        )
    ],

    "ops3": [
        # Mexico
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Country_Region",
            include=["Mexico"]
        ),

        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=3),
            field="Opinion",
            group="Disapproves"
        ),

        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4"], sentenceIndex=3),
            field="Opinion",
            group="No answer"
        ),

        # Mexico difference(Disapproves)
        FilterOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n2", "n8"], sentenceIndex=3),
            field="Share_of_Respondents",
            targetA="ref:n2",
            targetB="ref:n8"
        ),

        FilterOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n2", "n8"], sentenceIndex=3),
            field="Share_of_Respondents",
            targetA="ref:n2",
            targetB="ref:n8",

        ),

        # Mexico difference(No answer)

        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n2", "n8"], sentenceIndex=3),
            field="Opinion",
            group="Disapproves"
        )
    ]
}

spec_4ldjaoujpydpkbu5 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Inhabitants in millions",
            groupA="Male",
            groupB="Female"
        )
    ],

    "ops2": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Inhabitants in millions"
        )
    ],

    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="Inhabitants in millions",
            operator=">",
            value="ref:n2"
        )
    ],
    "ops4": [
        CountOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=4),
            field="Year"
        )
    ]
}

spec_12sdcc2xjltg7qj2 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Category",
            groupA="Total contributions to presidential candidates",
            groupB="Total spending by presidential candidates"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Value_Million_USD",
            which="max"
        ),
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Value_Million_USD",
            which="min"
        ),
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=2),
            field="Value_Million_USD",
            targetA="ref:n2",
            targetB="ref:n3"
        )
    ],

    "ops3": [
        ScaleOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n3"], sentenceIndex=3),
            target="ref:n2",
            factor="ref:n3",  # 확인
            field="Value_Million_USD",
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
            meat=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Age Group",
            group="0–14 years"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Year",
            include=["2019"]
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=4),
            field="Age Group",
            group="65 years and older"
        )
    ]
}

spec_23an1hozb7myw4e2 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Apparel_Item",
            group="Men's apparel"
        )
    ],
    "ops2": [
        LagDiffOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_Revenue",
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            filed="Share_of_Revenue",
            operator="<",
            value=0
        ),

    ]
}

spec_ = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            filed="Economic_Impact_Billion_USD",
            include=["2026", "2027", "2028", "2029"]
        )
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Contribution_Type",
            group="Direct contribution"
        ),

        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD"
        ),

        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            filed="Contribution_Type",
            group="Total contribution"
        ),

        AverageOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Economic_Impact_Billion_USD"
        ),
    ]
}

spec_74p313e1n8rzkfzp = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Share of respondents",
            order=["asc"]
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Share of respondents",
            order=["asc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Share of respondents",
            which="max"
        )
    ]
}

spec_4pi1e6ev8e0zobww = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            include=["2009", "2010", "2011"]
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Gender",
            group="Male"
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
            field="Year",
            include=["2018", "2019", "2020"]
        ),
        FilterOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=2),
            field="Gender",
            group="Female"
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
        )
    ],
    "ops2": [
        CompareBoolOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Share of respondents",
            operator=">",
            value=0.10
        )
    ],
    "ops3": [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Share of respondents"
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
            seriesField="Chamber",
            groupA="Senate",
            groupB="House"
        )
    ],
    "ops2": [
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Median_Wealth_Million_USD",
            order=["asc"]
        )
    ],
    "ops3": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Median_Wealth_Million_USD",
            which="max"
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=3),
            field="Median_Wealth_Million_USD",
            target="ref:n3"
        )
    ]
}

spec_1hm2mi3o0ejxp7tn = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Group",
            include=["Hypertensive untreated", "Normotensive untreated"]
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="Gender",
            group="Men"
        ),
        SumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            field="Share of respondents"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Gender",
            group="Women"
        ),
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=3),
            field="Share of respondents"
        )
    ],
    "ops4": [
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n5"], sentenceIndex=4),
            field="Share of respondents",
            targetA="ref:n3",
            targetB="ref:n5"
        )
    ]
}

spec_240rurpp2arislnt = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Age Group",
            group="18-29"
        ),
        SortOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Share of respondents",
            order=["asc"]
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Share of respondents",
            which="min"
        )
    ],
    "ops3": [
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=3),
            field="Age Group",
            group="65+"
        ),
        SortOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=3),
            field="Share of respondents",
            order=["asc"]
        )
    ],
    "ops4": [
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=4),
            field="Share of respondents",
            which="max"
        )
    ],
    "ops5": [
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=5),
            field="Share of respondents",
            targetA="ref:n3",
            targetB="ref:n6"
        )
    ]
}

# 다시
spec_1a6pxfig1xf4oeu3 = {
    "ops": [
        FilterOp(
            id="n1",

        )
    ]
}

spec_1ashoniy42n3n5jr = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2013", "2019"]
        ),
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Operating revenue in m million NOK"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Year",
            operator="between",
            value=["2013", "2020"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Operating revenue in m million NOK"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=3),
            field="Operating revenue in m million NOK",
            targetA="ref:n2",
            targetB="ref:n4"
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
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1),
            field="Value_Trillion_USD",
            which="min"
        )
    ],
    "ops2": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            filed="Trade_Type",
            group="Exports",
            signed=True,
        ),
        FilterOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            filed="Year",
            include=["2000"]
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n4",
            signed=True,
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2001"]
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n2", "n6"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n6",
            signed=True,
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2002"]
        ),
        DiffOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n2", "n8"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n8",
            signed=True,
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2003"]
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n2", "n10"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n10",
            signed=True,
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2004"]
        ),
        DiffOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n2", "n12"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n12",
            signed=True,
        ),
        FilterOp(
            id="n14",
            meta=OpsMeta(nodeId="n14", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2005"]
        ),
        DiffOp(
            id="n15",
            meta=OpsMeta(nodeId="n15", inputs=["n2", "n14"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n14",
            signed=True,
        ),
        FilterOp(
            id="n16",
            meta=OpsMeta(nodeId="n16", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2006"]
        ),
        DiffOp(
            id="n17",
            meta=OpsMeta(nodeId="n17", inputs=["n2", "n16"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n16",
            signed=True,
        ),
        FilterOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2007"]
        ),
        DiffOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n2", "n18"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n18",
            signed=True,
        ),
        FilterOp(
            id="n20",
            meta=OpsMeta(nodeId="n20", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2008"]
        ),
        DiffOp(
            id="n21",
            meta=OpsMeta(nodeId="n21", inputs=["n2", "n21"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n21",
            signed=True,
        ),
        FilterOp(
            id="n22",
            meta=OpsMeta(nodeId="n22", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2009"]
        ),
        DiffOp(
            id="n23",
            meta=OpsMeta(nodeId="n23", inputs=["n2", "n22"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n22",
            signed=True,
        ),
        FilterOp(
            id="n24",
            meta=OpsMeta(nodeId="n24", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2010"]
        ),
        DiffOp(
            id="n25",
            meta=OpsMeta(nodeId="n25", inputs=["n2", "n24"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n24",
            signed=True,
        ),
        FilterOp(
            id="n26",
            meta=OpsMeta(nodeId="n26", inputs=["n3"], sentenceIndex=2),
            field="Year",
            include=["2011"]
        ),
        DiffOp(
            id="n27",
            meta=OpsMeta(nodeId="n27", inputs=["n2", "n26"], sentenceIndex=2),
            field="Value_Trillion_USD",
            targetA="ref:n2",
            targetB="ref:n26",
            signed=True,
        ),
    ],
    "ops3": [
        FilterOp(
            id="n28",
            meta=OpsMeta(nodeId="n28",
                         inputs=["n5", "n7", "n9", "n11", "n13", "n15", "n17", "n19", "n21", "n23", "n25", "n27"],
                         sentenceIndex=3),
            field="Value_Trillion_USD",
            operator="<",
            value=0
        )
    ]
}

spec_1bbe64wpvq06sknm = {
    "ops": [
        AverageOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field=""
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
        ),
        FilterOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2012/13"]
        ),
        DiffOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n1", "n7"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n7",
        ),
        FilterOp(
            id="n8",
            meta=OpsMeta(nodeId="n8", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2013/14"]
        ),
        DiffOp(
            id="n9",
            meta=OpsMeta(nodeId="n9", inputs=["n1", "n8"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n8",
        ),
        FilterOp(
            id="n10",
            meta=OpsMeta(nodeId="n10", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2014/15"]
        ),
        DiffOp(
            id="n11",
            meta=OpsMeta(nodeId="n11", inputs=["n1", "n10"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n10",
        ),
        FilterOp(
            id="n12",
            meta=OpsMeta(nodeId="n12", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2015/16"]
        ),
        DiffOp(
            id="n13",
            meta=OpsMeta(nodeId="n13", inputs=["n1", "n12"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n12",
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
        ),
        FilterOp(
            id="n18",
            meta=OpsMeta(nodeId="n18", inputs=[], sentenceIndex=2),
            field="Fiscal Year",
            include=["2018/19"]
        ),
        DiffOp(
            id="n19",
            meta=OpsMeta(nodeId="n19", inputs=["n1", "n18"], sentenceIndex=2),
            field="Number of days in thousands",
            targetA="ref:n1",
            targetB="ref:n18",
        )

    ]
}