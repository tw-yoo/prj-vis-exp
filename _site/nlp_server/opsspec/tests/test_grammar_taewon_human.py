from opsspec.specs import *

# Q: How many years are above the average? (0o12tngadmjjux2n)
"""
1. Find average
2. filter which countries are above the average
"""
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
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Production in million units",
            operator=">",
            value="ref:n1"
        )
    ]
}

# Q: In which year was the agriculture sector the highest (10t8o5vhethzeod1)
"""
1. get the all values from the agriculture sector
2. find the maximum value
"""
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

# Q: in which years does south korea have a bigger value than france? (11e148qcs7x70t8v)
"""
1. Get difference between south korea and france in every year
2. Filter the year with a positive value
"""
spec_11e148qcs7x70t8v = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", sentenceIndex=1),
            by="Period",
            seriesField="Country",
            field="Share_of_Import_Value",
            groupA="South Korea",
            groupB="France",
            signed=True
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Share_of_Import_Value",
            operator=">",
            value=0,
        ),
    ]
}

# Q: Which city had the biggest jump in population from 2010 to 2025? (0prhtod4tli879nh)
"""
1. get the difference of every city in every year
2. find the extremum
"""
spec_0prhtod4tli879nh = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            by="City",
            seriesField="Year",
            field="Population in millions",
            groupA="2025",
            groupB="2010",
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Population in millions",
            which="max"
        )
    ]
}

# Q: How big was the change from 2016 to 2017 compared to the change from 2017 to 2018? (0pzdf7hfbxgjghsa)
"""
1. retrieve value of 2016 and 2017
2. retrieve value of 2017 and 2018
3. get the difference of the retrieved values
"""
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

# Q: Which year had the biggest gap between favor and oppose? (23wg8zio5ahp40tg)
"""
1. calculate difference between the values of favor and oppose
2. find extremum
"""
spec_23wg8zio5ahp40tg = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            by="Year",
            seriesField="Opinion",
            field="Percentage",
            groupA="Favor",
            groupB="Oppose",
            signed=False
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

# Q: What is the sum of the number of weights exceeding 3670 in the Boys group and the number of weights exceeding 3550 in the Girls group? (16aphfabldrpgcmd)
"""
1. Counting the number of values above 3670 on the Boys graph
2. Counting the number of values above 3550 on the Girls graph
3. Add the number of 1 and 2
"""
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

# Q: What is the difference between the second largest and the smallest values between 2000 and 2008? (10gtgmmgh599jnr7)
"""
1. Check the largest value between 2000 and 2009
2. Determine the second largest value after the largest value between 2000 and 2009
3. Determine the smallest value between 2000 and 2009 
4. Subtract small value from large value
"""
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

# Q: What is the difference between the installed base million value of Tablets in 2017 and the installed base million value of Mobile PCs in 2022? (0aj7na7tkqb7iomu)
"""
1. Check the value of the installed Base Millions in Tablets for 2017
2. Check Mobile PCs' Installed Base Millions value for 2022
3. Check the values of 1 and 2 which are greater
4. Subtract small value from large value
"""
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

# Q: What is the difference between Scotland's largest value and England and Wales's smallest value? (0egzejn5mejtnfdm)
"""
1. Check Scotland's Biggest Value
2. Check the smallest value for England & Wales
3. Check if the value is greater than the value of number 1 or number 2
4. Subtract small value from large value

"""
spec_0egzejn5mejtnfdm = {
    "ops": [
        FindExtremumOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="SharePercentage",
            group="Scotland",
            which="max",

        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2),
            field="SharePercentage",
            group="England & Wales",
            which="min"
        ),
    ],
    "ops3": [
        CompareOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=3),
            field="SharePercentage",
            targetA="ref:n1",
            targetB="ref:n2",
            which="max"
        ),
    ],
    "ops4": [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1", "n2"], sentenceIndex=4),
            field="SharePercentage",
            targetA="ref:n2",
            targetB="ref:n4",
            signed=False
        )
    ]
}

# Q: How many years did Thailand's revenue exceed that of the Philippines'? (0gzowodb2py0d1s9)
"""
1. Filter for the revenue of Thailand and the Philippines
2. Compare the revenue of Thailand and the Philippines
3. count the years for which Thailand's revenue was higher.
"""
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
            seriesField="Country_Region",
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

# Q: How many dates was the growth rate below the average? (1sf5c8wqw1192q6b)
"""
1. calculate average growth rate
2. filter for the date for which the growth rate was below the average
3. count the number of filtered dates 
"""
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
            field="Month",
        )
    ]
}

# Q: Is the average of the top three greater than twice the average of the lowest three? (0k7bm9iqewnrzj47)
"""
1. find the top three values
2. calculate the average
3. find the lowest three values
4. calculate the average
5. double the lowest average
6. compare the two values to find which one is bigger
"""
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
        ScaleOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n4"], sentenceIndex=5),
            target="ref:n4",
            factor=2.0
        )
    ],
    "ops6": [
        CompareBoolOp(
            id="n6",
            meta=OpsMeta(nodeId="n8", inputs=["n2", "n5"], sentenceIndex=6),
            operator=">",
            targetA="ref:n2",
            targetB="ref:n5",
        ),
    ],
}

# Q: Which group shows the highest value in the sum of occasionally and infrequently answered? (0opt5fjw2xphdgp2)
"""
1. calculate the sum of each value of occasionally and infrequently
2. find the maximum
"""
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
            field="Share of respondents",
            targetA="ref:n2",
            targetB="ref:n4",
            which="max"
        )
    ]

}

# Q: What is the difference between the average of Commercial and the average of Matchday? (004fhteah0l9kud2)
"""
1. Add all the Commercial values for each year.
2. Divide the value by six.
3. Add all the values of the matchday for each year.
4. Divide the value by six.
5. Find the difference between the two computed values.
"""
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

# Q: In which year did construction record the highest percentage? (0vw6ydim9cff8ji6)
"""
- Compare the percentage values for all years in the construction sector to each other
"""
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

# Q: What is the average of the percentage of responses in the last three years of Favourable views of the US? (2kmpy10btl65kr2j)
"""
- Filters data from 2015 to 2017
- Average the the percentage of responses of Favourable views of U.S from filtered data
"""
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
            field="Percentage_of_Respondents",
            group="Favorable view of US"
        )
    ]
}

# Q: What is the year with the largest increase compared to the previous year? (66va2s35es5t86l3)
"""
- Find the difference between the current value and the previous data value for all years with previous years.
- Find the year in which the highest value was recorded among the differences.
"""
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

# Q: What is the difference between the average of before 2000 and from 2010? (0w88bu7qm4ilsqmh)
"""
1. Find the average of the values for 1995 and 1999.
2. Find the average of the values for 2010, 2013, and 2017.
3. Calculate the difference between the two averages.
"""
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

# Q: What year is the smallest difference between the two types? (1ar60b8rke2d8e64)
"""
1. Calculate the rate differences between two types for each year # FIX: "month"
2. Sort them
3. Find the minimum value
"""
spec_1ar60b8rke2d8e64 = {
    "ops": [
        PairDiffOp()
    ],
    "ops2": [
        SortOp()
    ],
    "ops3": [
        FindExtremumOp()
    ]
}

# Q: For each fiscal year, find the difference between the corresponding year value and the overall average (1bbe64wpvq06sknm) # FIX: 질문 수정
"""
1. Calculate the average value for all fiscal years
2. Get the differences between each year's value and average value
"""
spec_1bbe64wpvq06sknm = {'ops1': [AverageOp()], 'ops2': []}

# Q: Which years has the biggest jump? (2jromeq5u9lloh1s)
"""
1. Get the difference between every year
2. Get the extremum 
"""
spec_2jromeq5u9lloh1s = {
    "ops": [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Audience_Millions"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Audience_Millions",
            which="max"
        )
    ]
}

# Q: Which country has the highest european factor? (13guplcbmfu1tjzu)
"""
1. Get the sum of germany and italy for each country
2. Get the country with the highest value
"""
spec_13guplcbmfu1tjzu = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group=["Germany – exports", "Italy – exports"],
        ),
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Decrease_in_GDP_Percentage",
            which="max"
        )
    ],
}

# Q: Which year had the lowest amount of suicides of all ages combined? (0q8vqyb35mbq0efx) # FIX: GroupToStack? # NOTE: 지금 상태로는 유진님이 적은게 맞는데, 이대로는 정답으로 하기가 어려울 것 같음.
"""
1. Sum of all the age ranges for every year
2. Find the extremum (lowest)

"""
spec_0q8vqyb35mbq0efx = {'ops1': [], 'ops2': []}

# Q: Which year had the second-lowest value? (2o3fyauxv32p571i)
"""
1. Sort in ascending order by year
2. find the second lowest
"""
spec_2o3fyauxv32p571i = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Operating_Profit_Margin",
            order="asc",
        )
    ],
    "ops2": [
        NthOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            n=2
        )
    ]
}

# Q: What is the difference between the average of September 1896 until December 1896 and the average of January 1897 until April 1897? (0s6zi9dyw22qo4rp)
"""
1. calculate the average of sep 1896 until dec 1896
2. calculate the average of jan 1897 until april 1897
3. compare the two averages
"""
spec_0s6zi9dyw22qo4rp = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Month/Year",
            operator="between",
            value=["Sep 1896", "Dec 1896"]
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
            operator="between",
            value=["Jan 1897", "Apr 1897"]
        ),
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2),
            field="Fatality rate among plague cases"
        )
    ],
    "ops3": [
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
            field="Fatality rate among plague cases",
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# Q: Which year had the second lowest value? (2ebtadc07b7bo277) # NOTE: 방법 1이 맞는 것 같음. 설명에서 sort라고 했으니, 그렇게 나오는게 맞을듯. 하지만 nth(2)나 min(2)나 같은걸로 처리해야 할듯.
"""
1. sort the values from lowest to highest
2. find the second lowest 
"""
spec_2ebtadc07b7bo277 = {
    "ops": [
        SortOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Average price in US dollars",
            order="asc",
        )
    ],
    "ops2": [
        NthOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            n=2
        )

    ]
}


# Q: If you compare the average value from july 2008 until june 2012 and july 2013 until june 2017, which value is higher? (2jki13q54zizc6i4)
"""
1. get the average from july 2008 until june 2012
2. get the average from july 2013 until june 2017
3. compare 
4. find extremum
"""
spec_2jki13q54zizc6i4 = {'ops1': [FilterOp(), AverageOp()], 'ops2': [FilterOp(), AverageOp()], 'ops3': [CompareOp()], 'ops4': [FindExtremumOp()]} # FIX:

# Q: What is the difference in the average between North America and Latin America? (0rfuaawgi58ajpsv)
"""
1. Get the average of Northern America
2. Get the average of Latin America
3. Get the difference between the two average values
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

# Q: Which year shows the lowest gap between lending and investment? (0rdpculfpyw3bv5p) # NOTE: 유진님 n1 diff -> PairDiff가 맞는 것 같음.
"""
1. Get the difference between lending and investment in every year
2. Find the year with the smallest value
"""
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

# Q: Which season was above average in both commercial and broadcasting? (10x2rgiqw97wdspi) # NOTE: Average에 group이 있기 때문에 filter 하지 않아도 됨. filter를 넣는다면  average에 group이 없어도 됨.
"""
1. Find the average of the commercial
2. Find the average of the broadcasting
3. Find the season that is above average for both commercial and broadcasting
"""
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

# Q: Which fiscal years' expenditures are below average? (0qz3v0bszsex7jjm) # NOTE: 지금 정답은 유진님이 맞음. pairdiff든 전체 diff하는거 만들어야 할듯.
"""
1. Determine average
2. Compare each year's value with the average
3. Filter to countries that are below average
"""
spec_0qz3v0bszsex7jjm = {'ops1': [AverageOp()], 'ops2': [], 'ops3': [FilterOp()]}

# Q: What is the difference between the maximum and minimum gap between the two groups? (28bxxhd6omv2l2h1) # FIX: 설명 이상함. 일단 설명대로 만듦
"""
1. calculate the difference for each value
2. find the maximum value
"""
spec_28bxxhd6omv2l2h1 = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            by="Year",
            seriesField="Region",
            field="Life expectancy in years",
            groupA="Canada",
            groupB="Newfoundland and Labrador"
        )
    ],
    "ops2": [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Life expectancy in years",
            which="max"
        )
    ]
}

# Q: In 2002 and 2017, which year shows the highest gap between two opinion? (29rxoltwhongoday) # NOTE: 질문의 해석이 다름. 내 생각엔 2002, 2017 둘만 비교하는게 맞는 것 같음. Between이 아니고 in이기 때문에.
"""
1. calculate the difference in 2002 and 2017
2. find the year which has the bigger difference
"""
spec_29rxoltwhongoday = {
    'ops1': [
        RetrieveValueOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Percentage",
            target="2002",
            group="Dissatisfied"
        ),
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Percentage",
            target="2002",
            group="Satisfied"
        ),
        DiffOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1", "n2"], sentenceIndex=1),
            field="Percentage",
            targetA="ref:n1",
            targetB="ref:n2"
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=1),
            field="Percentage",
            target="2002",
            group="Dissatisfied"
        ),
        RetrieveValueOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=1),
            field="Percentage",
            target="2017",
            group="Satisfied"
        ),
        DiffOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4", "n5"], sentenceIndex=1),
            field="Percentage",
            targetA="ref:n4",
            targetB="ref:n5"
        ),
    ],
    'ops2': [
        FindExtremumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3", "n6"], sentenceIndex=2),
            field="Percentage",
        )
    ]
}

# Q: How many years has Russia had higher favorability than the US? (2eiyyw562tcvjypp)
"""
1. calculate the difference between Russia and the US
2. count the number of years that Russia is higher than the US
"""
spec_2eiyyw562tcvjypp = {
    "ops": [
        PairDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Favorable_View_Percentage",
            by="Year",
            seriesField="Favorability_Direction",
            groupA="Russia favorability in US",
            groupB="US favorability in Russia",
            signed=True,
        ),
    ],
    "ops2": [
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Favorable_View_Percentage",
            operator=">",
            value=0,
        ),
        CountOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=2),
            field="Year"
        )
    ]
}

# Q: Which of the most recent years is the value of the EU 5-country media with y-axis values between 51 and 61? (1h4rj9i2jtzq589y) # NOTE: 설명할게 없으면 안보는것도 필요할듯? 첫 번째 문장 (아니면 문장 합치는 것도 괜찮을듯) # NOTE: 유진님 문장 3개만 있음.
# NOTE: 질문이 이상함
"""
1. Check y-axis number
2. Check the points between 51 and 61
3. Check the year of values corresponding to the EU 5-country media between 51 and 61 
4. Choose the largest year
"""
spec_1h4rj9i2jtzq589y = {
    'ops1': [],
    'ops2': [],
    'ops3': [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=["n1"], sentenceIndex=3),
            field="Year",
            operator="between",
            value=["51", "61"],
        )
    ],
    'ops4': [
        FindExtremumOp()
    ]
}

# Q: What is the average value for each service area in the year when the data center's revenue was highest? (0gf8ugj84bs1ko2k) # NOTE: 설명이 약간 부족함. # 유진님이랑 다름 (오류 있음. n1 sentenceIndex)
"""
1. Check the graph for the data center with the highest value.
2. Check the value for each service area.
3. Calculate the average.
"""
spec_0gf8ugj84bs1ko2k = {
    'ops1': [
        FindExtremumOp(
            id="n2",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Revenue_Million_USD",
            group="Data Centers",
            which="max",
        )
    ],
    'ops2': [
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2),
            field="Revenue_Million_USD",
            target="2022",
            group="Data Centers",
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=2),
            field="Revenue_Million_USD",
            target="2022",
            group="Cloud",
        ),
        RetrieveValueOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=[], sentenceIndex=2),
            field="Revenue_Million_USD",
            target="2022",
            group="BPO",
        )
    ],
    'ops3': [
        AverageOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n3", "n4", "n5"], sentenceIndex=3),
            field="Revenue_Million_USD",
        )
    ]
}

# Q: What is the sum of the Confidence in U.S. present values for the period in which the favorite view of the U.S. is the lowest? (14jt6jor7iknkjkl) # FIX: Present -> President # 이건 정답을 만들 수 없을듯?
# NOTE: 유진님이랑 다름
# NOTE: check라는걸 retrieveValue로 볼지? 아니면 Filter만으로 괜찮을지?
"""
1. Check the section with the lowest favorite view of U.S. value (2009, 2010, 2011)
2. Check Confidence in U.S. present value corresponding to section 1
3. Add all values of number 2
"""
spec_14jt6jor7iknkjkl = {
    'ops1': [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year",
            operator="between",
            value=["2009", "2011"]
        )
    ],
    'ops2': [
        RetrieveValueOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Percentage",
            target="2009",
            group="Confidence in US President"
        ),
        RetrieveValueOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=2),
            field="Percentage",
            target="2010",
            group="Confidence in US President"
        ),
        RetrieveValueOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n1"], sentenceIndex=2),
            field="Percentage",
            target="2011",
            group="Confidence in US President"
        )
    ],
    'ops3': [
        SumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n3", "n4"], sentenceIndex=3),
            field="Percentage",
        )
    ]
}

# Q: What is the difference between the average of values corresponding to Poor and the average of values corresponding to Good? (0dglnk2wbf5ll15t)
"""
1. Check the values for each year's Poor
2. Obtaining the mean of the values found in number 1
3. Check the value corresponding to Good for each year
4. Obtaining the mean of the values found in number 3
5. Find the difference between the two mean values
"""
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

# Q: What is the sum of the year when the Ease of Doing Business score is the second largest and the year when the Ease of Doing Business score is the second smallest? (0ix8hz9qvakto18g)
# NOTE: 정답 만들 수 없을 것 같음.
"""
1. Check the top of the graph
2. Then check the value of the dot above
3. Check the bottom of the graph
4. Compare each of the bottom three point values
5. Check the smallest value and check the Year
6. Add values of 2 and 5
"""
spec_0ix8hz9qvakto18g = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': [], 'ops6': []}

# Q: What is the average of the revenue multiple from 2006 to 2011? (0egdxqun1m2n9k4z)
"""
1. Check the Revenue multiple values from 2006 to 2011.
2. Add all the values
3. Divide by six.
"""
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

# Q: What is the average of Season's ticket prices with a ticket price of $60 or less? (0gvrmm8qbn6o1vya) # NOTE: 유진님이랑 다름. 1번 문장에서 Filter를 만들 수는 없을듯?
"""
1. Identify the 60 line on the Y-axis.
2. Identify the bar graphs with values under 60.
3. Calculate the average of each bar.
"""
spec_0gvrmm8qbn6o1vya = {
    "ops": [],
    "ops2": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=2),
            field="Season",
            operator="<",
            value=60
        )
    ],
    "ops3": [
        AverageOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=3),
            field="Average ticket price in US dollars"
        )
    ]
}

# Q: What is the average of the values in the period in which the Unemployment rate value falls for more than two years? (0roec4s0drcyiuz4)
# NOTE: 정답 만들기 좀 까다로움.
"""
1. Check for sections where prices have fallen for more than two years
2. Check all values for each year from Quarter obtained by 1
3. Finds the average of the values obtained in number 2 
"""
spec_0roec4s0drcyiuz4 = {
    'ops1': [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Season",
            signed=True
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Quarter",
            between=["Q1 2019", "Q2 2020"]
        )
    ],
    'ops2': [],
    'ops3': [
        AverageOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=["n2"], sentenceIndex=3),
            field="Unemployment rate (%)"
        )
    ]
}

# Q: What is the average of the sales values of a company with a sales volume in million units of 60 or more? (0eq4w2wsl864mhcj)
"""
1. Confirmation of a company with a Sales value of more than 60
2. Finds the average of the values found in number 1
"""
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

# Q: Which year has the second largest difference between 65 years and older and 15–64 years? (0g0xma0b0k29lk5j)
# NOTE: Stacked bar chart PairDiff 할 때 Stack to group 만든 다음에 정답 만들기
"""
1. Check the graph with the second smallest value of 65 years and old and check the value 
2. Check the graph with the second largest value of 15–64 years and check the value
3. Check the year in question (Compare the value between 1 and 2)
"""
spec_0g0xma0b0k29lk5j = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which year has the average of the values corresponding to 2018 or the larger value corresponding to 2020? (0fhm43s0j7glca29) # 유진님이랑 다름 (Average 만드는 부분)
"""
1. Check all values for 2018
2. Calculated the mean
3. Check all values for 2020
4. Calculated the mean
5. Determine which year has the greater of the two means
"""
spec_0fhm43s0j7glca29 = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            group="2018"
        )
    ],
    "ops2": [
        AverageOp(
            nodeId="n2",
            meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=2),
            field="Revenue in billion US dollars",
        )
    ],
    "ops3": [
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3),
            group="2020"
        )
    ],
    "ops4": [
        AverageOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=[], sentenceIndex=4),
            field="Revenue in billion US dollars",
        )
    ],
    "ops5": [
        FindExtremumOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=5),
        )
    ]
}

# Q: What is the difference between the average of surgical values in European countries and the average of surgical values in Asian countries? (0gacqohbzj07n25s)
# NOTE: 유진님이랑 다름 (유럽 국가 기준?) 터키 같은 애들은 애매해서 어디에 있어도 정답처리 해야 할듯?
"""
1. European countries identified
2. Obtain the average of the surgical values of European countries
3. Check out Asian countries
4. Find the average of the surgical values of Asian countries
5. Subtract smaller values from larger values
"""
spec_0gacqohbzj07n25s = {
    "ops": [
        FilterOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Country",
            include=["France", "Germany", "Italy", "Russia", "Turkey"],
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
            include=["India", "Japan"],
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
            meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], senteceIndex=5),
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# Q: What is the sum of the y-values for the period in which the y-axis value increased most sharply for two or more consecutive years? (1c80b6i7wdu3m1ir)
# NOTE 유진님이랑 정답 다름
"""
1. Identify lines that trend upward for two or more years.
2. Find the difference between the starting and ending values.
3. Identify the line with the largest value.
4. Add all values corresponding to number 3.
"""
spec_1c80b6i7wdu3m1ir = {
    'ops1': [
        LagDiffOp(
            id="n1",
            meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1),
            field="Year on year percentage change (%)"
        ),
        FilterOp(
            id="n2",
            meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=1),
            field="Year",
            between=["1996", "1998"]
        ),
        FilterOp(
            id="n3",
            meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=1),
            field="Year",
            between=["1999", "2001"]
        )
    ],
    'ops2': [
        DiffOp(
            id="n4",
            meta=OpsMeta(nodeId="n4", inputs=["n2"], sentenceIndex=2),
            field="Year on year percentage change (%)",
            targetA="1996",
            targetB="1998"
        ),
        DiffOp(
            id="n5",
            meta=OpsMeta(nodeId="n5", inputs=["n3"], sentenceIndex=2),
            field="Year on year percentage change (%)",
            targetA="1999",
            targetB="2001"
        )
    ],
    'ops3': [
        FindExtremumOp(
            id="n6",
            meta=OpsMeta(nodeId="n6", inputs=["n4", "n5"], sentenceIndex=3),
            field="Year on year percentage change (%)",
            which="max"
        )
    ],
    'ops4': [
        SumOp(
            id="n7",
            meta=OpsMeta(nodeId="n7", inputs=["n3"], sentenceIndex=4),
            field="Year on year percentage change (%)",
        )
    ]
} #cur

# Q: What is the difference between the largest value in Germany and the smallest value in the U.S. between 2010 and 2015? (1k8qhmg9rui7gtzh)
# NOTE: 이건 filter 순서 바뀌어도 맞는 걸로 해야 함.
"""
1. Find the largest value in Germany between 2010 and 2015.
2. Find the smallest value in the U.S. between 2010 and 2015.
3. Subtract value 2 from value 1.
"""
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

# Q: What is the Male value in the category with the second-lowest Female share of employees? (0ihx2vzdsej883sq)
# NOTE: 유진님이랑 다름
"""
1. Check the second-lowest Female value.
2. Check the Male value in that Category.
"""
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
            target="Overall",
            group="Male"
        )
    ]
}

# Q: What is the difference between the largest and smallest values between 2010 and 2019? (0fh0emp095qhq3ag)
# NOTE: 유진님이랑 다름 (약간, n5 순서?)
"""
1. Check the highest bar graph between 2010 and 2019 and find the value
2. Check the lowest bar graph between 2010 and 2019 and find the value
3. Subtract value 2 from value 1
"""
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
            targetA="ref:n2",
            targetB="ref:n4"
        )
    ]
}

# Q: For which year was the difference between the average age at marriage for men and women the lowest? (0k75gqf8ckjikdym)
"""
1. Calculate the difference between the average age at marriage for each year.
2. Compare the differences between each year.
3. Choose the year with the lowest difference 
"""
spec_0k75gqf8ckjikdym = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many times did the dominant opinion change? (1p4nnba4568wza9n)
"""
1. determine what if the dominant opinion was good or bad for each year (if higher than >50% dominant)
2. compare the dominant opinion for each year with the following and count if there was a change
"""
spec_1p4nnba4568wza9n = {'ops1': [], 'ops2': []}

# Q: Which country had the most significant difference in net sales between the years 2019 and 2020? (0nmj7sdej4cipma7)
"""
1. filter year 2019 and 2020
2. filter for the values of each given group and subtract the 2020 value from the 2019 values.
3. compare absolute values and choose the highest

"""
spec_0nmj7sdej4cipma7 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: How many employees did they have on average between 2008 and 2011? (0i9bxppwocx0tyop)
"""
1. filter for the years 2008, 2009, 2010 and 2011
2. sum up the number of employees
3. calculate the average 
"""
spec_0i9bxppwocx0tyop = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many diet types surpassed the threshold of 0.03% in 2019? (0lua5jsw92d3enb4)
"""
1. Filter for which diet type surpased the 0.03% threshold. in 2018 and 2019.
2. Calculate the amount of diet types in 2018 and 2019.
3. and calculate the absolute difference of the two results.
"""
spec_0lua5jsw92d3enb4 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What was the average of active users from March '16 to March '19? (0iv07908ph6y6ifj)
"""
1. filter for the dates March 16 to MARCH 19
2. calculate the average of those filtered dates
"""
spec_0iv07908ph6y6ifj = {'ops1': [], 'ops2': []}

# Q: What was the median number of facilities between the years 2010 and 2019? (1jabqwjz9pmd7qwz)
"""
1. Filter for the years 2010 to 2019
2. Calculate the median number
"""
spec_1jabqwjz9pmd7qwz = {'ops1': [], 'ops2': []}

# Q: In which year did men and women report the most similar stress levels? (1vh62ks9wweck6m2)
"""
1. Calculate the absolute differences in stress level of men and women
2. find the minimum
"""
spec_1vh62ks9wweck6m2 = {'ops1': [], 'ops2': []}

# Q: How many years had investments of over 22 Billion Euros in the years 2011 to 2014? (0jbrb1dcbliiampz)
"""
1. filter for the years 2011 to 2014
filter for the years higher than 22 Billion Euros
 count the filtered number of years 
"""
spec_0jbrb1dcbliiampz = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which season has the biggest gap between Matchday and Commercial? (0ufvwi9xv37e597q)
"""
1. Calculate the difference between Matchday and Commercial for each season
2. find the season with the maximum difference
"""
spec_0ufvwi9xv37e597q = {'ops1': [], 'ops2': []}

# Q: What was the difference between the maximum value of women and men? (0oinwvo88bvvs25b)
"""
1. find the maximum value in the men group
2. find the maximum value in the women group
3. calculate the absolute difference from the two values
"""
spec_0oinwvo88bvvs25b = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which year showed the highest drop? (1vni31fp2ii7wz68)
"""
1. calculate the difference for each year,
2. find the minimum value
"""
spec_1vni31fp2ii7wz68 = {'ops1': [], 'ops2': []}

# Q: What is the average difference between Women and Men from 2000? (20gpvz4ylu4olrm7)
"""
1. calculate the average of Women from 2000
2. calculate the average of Men from 2000
3. calculate the difference
"""
spec_20gpvz4ylu4olrm7 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between white and black who answer more than most of all time? (0vfqjaxeiv96ww7g)
"""
1. sum "almost of all of the time" and "most of the time" of white
2. sum "almost of all of the time" and "most of the time" of black
3. calcuate the difference
"""
spec_0vfqjaxeiv96ww7g = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: In average and median values, which one is bigger? (25gpdzxh8nu0c0vf)
"""
1. calculate the average
2. calculate the median
3. compare which one is bigger
"""
spec_25gpdzxh8nu0c0vf = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which year shows the lowest gap between convenience and price (20qa83ih1gn6toqt)
"""
1. calculate the difference between convenience and price for each year
2. find the minimum
"""
spec_20qa83ih1gn6toqt = {'ops1': [], 'ops2': []}

# Q: What is the average of the three lowest rate values? (0baf5ch9y4z8914p)
"""
List the Rate values in ascending order.
Add the first three values.
Divide the added value by three.
"""
spec_0baf5ch9y4z8914p = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the average difference between the male and female proportions of each artist? (01h0jkno5l7jola8)
"""
Get the difference between the Men and the Women in the share of respondents for each artist.
Sum all of the differences.
Divide the sum by 5.

"""
spec_01h0jkno5l7jola8 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: What is the difference between the year with the smallest difference between Republicans and Democrats and the year with the highest difference? (0cjk67q39ee6dhzj)
"""
Find the difference between Republicans and Democrats for each year.
Sort the values in descending order.
Find the highest and lowest values.
Find the difference between the two values.
"""
spec_0cjk67q39ee6dhzj = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: Which sector showed the most decline? (01mksjs373fhcl4q)
"""
Find the difference between the two years of each sector.
List the values in descending order.
Find the sector with the highest value.
"""
spec_01mksjs373fhcl4q = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the third most index scores and the fifth most index scores? (04xwv56n37ybj8zr)
"""
List the index scores of each year in descending order.
Find the third highest value and the fifth highest value among them.
Find the difference between the two values.

"""
spec_04xwv56n37ybj8zr = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: What is the difference between the sum of the values above 4.0 and the sum of the values below 2.5? (0cymcilknp8krjwz)
"""
Find the line of 4.0.
Add the values of the dots above 4.0.
Find the line of 2.5.
Add the values of the dots below 2.5.
Find the difference between the two values.
"""
spec_0cymcilknp8krjwz = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: What is the difference between 2010 and 2020 values? (0abj8blv663ussbr)
"""
Find the value for 2010.
Find the value for 2020.
Find the difference between the two values.
"""
spec_0abj8blv663ussbr = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the sum of the three median values for each year? (0cad2xfrwdgvo9zk)
"""
List the values ​​for each year in descending order.
Find the three medians.
Add those values.
"""
spec_0cad2xfrwdgvo9zk = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between a value for a year with a score value between 6.2 and 5.8 and a value for a year with a score value below 4.8? (0gr1c2jcthc8h9f6)
"""
Find values for years with values between 6.2 and 5.8.
Find the value of the year with the value below 4.8.
Find the difference between the two values.
"""
spec_0gr1c2jcthc8h9f6 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What year has the biggest difference between commercial and matchday? (001dao0mq0pplbzj)
"""
Get the difference between the Commercial and the Matchday for each year.
Find the year with the maximum difference.
"""
spec_001dao0mq0pplbzj = {'ops1': [], 'ops2': []}

# Q: What is the difference between the countries with the highest and lowest images? (0a5npu4o61dz4r5f)
"""
 Find the highest damage value.
Find the lowest damage value.
Get the difference between the two values
"""
spec_0a5npu4o61dz4r5f = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the sum of the values with the highest and lowest percentage differences for each year? (07lo3vvwztz32ifq)
"""
Find the difference in values between the years in each region.
List the values in descending order.
Sum the highest and lowest values.
"""
spec_07lo3vvwztz32ifq = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the service value in 2010 and the service value in 2020? (075i5mfewy2uvwej)
"""
Find the service value for 2010.
Find the service value for 2020.
Find the difference between the two values.
"""
spec_075i5mfewy2uvwej = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many years have a score below 80 in total? (08x3crju85yix5ab)
"""
Find the value of 80.
Find the points below the 80-value line.
Count the number of dots.
"""
spec_08x3crju85yix5ab = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the female value in 2010 and the male value in 2016? (0bunvsqd54e3qahz)
"""
Find the female value for 2010.
Find the male value for 2016.
Find the difference between the two values.
"""
spec_0bunvsqd54e3qahz = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the average value of the difference between the three years with the largest difference between age groups? (0bgcjlbz7nv5vnjc)
"""
Find the difference in values for each year.
Sort the values in descending order.
Find the top 3 years with the highest difference.
Divide the values by three.
"""
spec_0bgcjlbz7nv5vnjc = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: Which year has the highest difference in values between Male and Female? (08iur64i01boakg5)
"""
Find the difference between the male and female percentages for each year.
Sort the values in descending order.
Choose the highest value.
"""
spec_08iur64i01boakg5 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which one has the highest percentage sum between major and minor? (05qg5ubxklojfze7)
"""
Find the sum of the major and minor problems of each of the problems.
Find the highest value among them.
"""
spec_05qg5ubxklojfze7 = {'ops1': [], 'ops2': []}

# Q: What is the difference between the value of the year with the highest percentage of no and the value of the year with the third highest percentage of yes? (0b9o2vahkw2a1bxy)
"""
Sort the percentage values that answered no for each year in descending order.
Find the highest value.
Sort the percentage values that answered Yes for each year in descending order.
Find the third-highest value.
Find the difference between the two values obtained.
"""
spec_0b9o2vahkw2a1bxy = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: Which is more, the number of suicides under the age of 30 or over the age of 70? (0v0l4wdbx7orkqz1)
"""
- Filters the number of suicides under the age of 30 and over the age of 70, respectively.
- Add each value within each filtered group.
- Compare the magnitude of the total of each group.
"""
spec_0v0l4wdbx7orkqz1 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which sector accounted for the largest portion of this chart as a whole? (14jud3ymyoonba4e)
"""
- Add all year values for each sector by sector
- Find the largest value by comparing the sum of values for each sector added
"""
spec_14jud3ymyoonba4e = {'ops1': [], 'ops2': []}

# Q: How many months were the month when the producer price index was lower than 210 in total? (5lhrulhnl0io2r81)
"""
- Compare that the price index was lower than 210 for each month
- Counting the number of all low months
"""
spec_5lhrulhnl0io2r81 = {'ops1': [], 'ops2': []}

# Q: Was the period from 2006 to 2011 longer than the period when people were more likely to be satisfied than the period when they were dissatisfied? (2hjkdo5w242alvjd)
"""
- Filter responses only from 2006 to 2011
- Count the number of years over 50% of the respondents said they were satisfied
- Check the number is greater than 3
"""
spec_2hjkdo5w242alvjd = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the net income sum from 2010 to 2015? (0vmvmj77j3p6vcy7)
"""
- Filters data from 2010 to 2015
- Add all filtered data.
"""
spec_0vmvmj77j3p6vcy7 = {'ops1': [], 'ops2': []}

# Q: What is the sum of Sony's rankings for 2017 and 2018? (174uq759pluu079w)
"""
- Filtering from 2017 to 2018
- Find the ranking for each year of Sony
- Add each rank
"""
spec_174uq759pluu079w = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many years in total did APAC have the lowest annual revenue? (0w5jptak9peti0mj)
"""
- Check APAC's ranking for all years.
- Count the number of years in which APAC ranks lowest.
"""
spec_0w5jptak9peti0mj = {'ops1': [], 'ops2': []}

# Q: What is the total from 2011 to 2017? (5po479f2ju9lqv16)
"""
- Filters data from 2011 to 2017
- Add all filtered data
"""
spec_5po479f2ju9lqv16 = {'ops1': [], 'ops2': []}

# Q: Which of the differences between 2018 and 2019 or the differences between 2023 and 2025 is the bigger value? (0vqxnzu0mpbz12ch)
"""
- Calculate the difference between 2019 and 2018, the difference between 2025 and 2023
- Compare which of each difference is greater
"""
spec_0vqxnzu0mpbz12ch = {'ops1': [], 'ops2': []}

# Q: What the average of the agricultural values for all years in which the value of industry is greater than 0.2? (19xwo5oscmgpcdyl)
"""
- Find all years in which the value of indusrtry is greater than 0.2.
- Average the agricultural values for all years found.
"""
spec_19xwo5oscmgpcdyl = {'ops1': [], 'ops2': []}

# Q: Is the difference between Alaska's 2000 value and 2020 value greater than Total's 2020 minus 2000 value? (0wgqpso2vnilpym6)
"""
- Subtract Alaska's 2020 value from Alaska's 2000 value
- Subtract Total's 2000 value from Total's 2020 value
- Compare each
"""
spec_0wgqpso2vnilpym6 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: When was the fifth highest percentage of the values on the chart? (651x1l1swysyy6vp)
"""
- Sort in order of percent higher
- Check the date of the fifth highest percentage.
"""
spec_651x1l1swysyy6vp = {'ops1': [], 'ops2': []}

# Q: What is the sum of the differences between women and men in the last five years? (2s65jcap9pn289qx)
"""
- Filter data from 2016 to 2020
- Find both the differences between women and men in the filtered data.
- Add all the values
"""
spec_2s65jcap9pn289qx = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What the average of values from 2012 to 2015? (0vvz9mdgdiazke5o)
"""
- Filter data from 2012 to 2015
- Add all the values from filtered data
"""
spec_0vvz9mdgdiazke5o = {'ops1': [], 'ops2': []}

# Q: What is the sum of the Coal values for all years in which the value of Gas is greater than 1/3 of the value of Oil? (19msoowya2szdynd)
"""
- For all years, divide the oil value by 3 and filter all years with larger gas values compared to the value of gas.
- Add all Coal values from filtered years.
"""
spec_19msoowya2szdynd = {'ops1': [], 'ops2': []}

# Q: What is the average of the vote share at an age when Clinton received a lower vote share? (0xc7sx6ll8fl5rgh)
"""
- Filters the age group where Clinton gets a lower vote share.
- Find the average of the votes for a filtered age group.
"""
spec_0xc7sx6ll8fl5rgh = {'ops1': [], 'ops2': []}

# Q: How many dates were there in total when the percentage sum of dem and rep was less than 70? (3tc31k5k2o6wmvyp)
"""
- For all days, the sum of each dem and rep values is obtained, and values higher than 70 are filtered.
- Count the total number of filtered values
"""
spec_3tc31k5k2o6wmvyp = {'ops1': [], 'ops2': []}

# Q: Among the differences between the blue and orange bars, how many times is the largest value greater than the smallest value? (12sdcc2xjltg7qj2)
"""
1. Calculate the difference between the two bars for each year.
2. Find the maximum and minimum differences.
3. Divide the maximum value by the minimum value.
"""
spec_12sdcc2xjltg7qj2 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the average from 2011 and the average up to 2010? (72yqb8jwj9a6g4nx)
"""
1. Calculate the average from 2011 to 2015.
2. Calculate the average from 2005 to 2010.
3. Calculate the difference.
"""
spec_72yqb8jwj9a6g4nx = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many years are below average? (6al86e9qyokma74i)
"""
1. Calculate the average value.
2. Count how many years are below average.
"""
spec_6al86e9qyokma74i = {'ops1': [], 'ops2': []}

# Q: How many years are there that have a lower value than the average? (724mfnyk34kp97le)
"""
1. Calculate the difference.
2. Find all values that have a lower value than the average.
3. Count the values.
"""
spec_724mfnyk34kp97le = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: In which year is the difference between the blue and gray bars the greatest? (1q3mzgt77lwo172f)
"""
1. Calculate the difference between the blue bar and the gray bar each year.
2. Find the year with the highest difference.
"""
spec_1q3mzgt77lwo172f = {'ops1': [], 'ops2': []}

# Q: How many times is the difference between El Salvador and Ukraine greater than the difference between El Salvador and Denmark? (0xo3r87obscjsktm)
"""
1. Find the value of El Salvador.
2. Find the value of Ukraine.
3. Calculate the difference between the two values.
4. Find the value of Denmark.
5. Calculate the difference between Denmark and El Salvador
6. Compare which difference value is higher.
7. Divide the higher value by the lower value.
"""
spec_0xo3r87obscjsktm = { 'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': [], 'ops6': [],
  'ops7': []}

# Q: Which channel shows the maximum difference between the highest value and the lowest value of each channel? (0ykydh8vao50ceou)
"""
1. Find the maximum value and the minimum value for each channel
2. Calculate the difference between the minimum value and the maximum value for each channel
3. Find the channel that shows the maximum value
"""
spec_0ykydh8vao50ceou = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the days when Obama is higher than Romney and the days when Romney is higher than Obama? (4p1m4tsmzmtvsrys)
"""
1. Calculate the difference for each date.
2. Count where Obama is higher than Romney.
3. Count where Romney is higher than Obama.
4. Calculate the difference.
"""
spec_4p1m4tsmzmtvsrys = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: What is the difference between the average and the maximum number? (0wflwm4jebx7n12y)
"""
1. Calculate the average value.
2. Find the maximum value.
3. Calculate the difference.
"""
spec_0wflwm4jebx7n12y = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Which method shows the highest difference between every day and less often? (21fa7gb8l1ix6yfm)
"""
1. Calculate the difference between everyday and less often for each method.
2. Find the method with the highest difference.
"""
spec_21fa7gb8l1ix6yfm = {'ops1': [], 'ops2': []}

# Q: What is the difference between the average for Female on platforms more used by Male and the average for Male on platforms more used by Female? (0zjxkqy20iibpdvo)
"""
1. Find the Platforms where the Male shows a higher value than the Female.
2. Calculate the average of the Female values from the Platforms just found.
3. Find the Platforms where the Female shows a higher value than the Male.
4. Calculate the average of the Male values from the Platforms just found.
5. Calculate the difference between the two average values.

"""
spec_0zjxkqy20iibpdvo = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': [], 'ops6': []}

# Q: Which year shows the highest difference from the average? (0xnim79vztf8hjor)
"""
1. Calculate the average of Average ticket price in US dollars.
2. Calculate the difference between the average and each year.
3. Find the year that shows the highest absolute difference.
"""
spec_0xnim79vztf8hjor = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the average of the blue and orange bars in the first five years and the average of the blue and orange bars in the last five years? (0yx2080f08329xxb)
"""
1. Get the values of the blue bar for the first five years.
2. Calculate the average.
3. Get the values of the orange bar for the first five years.
4. Calculate the average.
5. Calculate the difference between the two average values.
6. Get the values of the blue bar for the last five years.
7. Calculate the average.
8. Get the values of the orange bar for the last five years.
9. Calculate the average.
10. Calculate the difference between the two average values.
11. Calculate the difference between the two difference values between the two groups.
"""
spec_0yx2080f08329xxb = { 'ops1': [],
  'ops10': [],
  'ops11': [],
  'ops2': [],
  'ops3': [],
  'ops4': [],
  'ops5': [],
  'ops6': [],
  'ops7': [],
  'ops8': [],
  'ops9': []}

# Q: In how many years was the difference between Disatisfied and Satisfied less than the difference between their means? (3z678inbp0t89ahu)
"""
1. Calculate the average of Dissatisfied.
2. Calculate the average of Satisfied.
3. Calculate the difference between the two values.
4. Calculate the difference for each year. (PairDiffOp)
5. Count all years that have a lower difference than the difference between the averages.
"""
spec_3z678inbp0t89ahu = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: What is the average of the Internet, where the value of the year is higher than that of Radio and lower than that of Newspaper? (3un2wyjae3ebkncl)
"""
1. Find the years that the value of the Internet is above Radio and below Newspaper.
2. Calculate the average.
"""
spec_3un2wyjae3ebkncl = {'ops1': [], 'ops2': []}

# Q: Is the sum of the orange and red values ​​from 2017 to 2020 greater than the US value in 2020? (1xz4egh52kvh2xwx)
"""
1. Sum all of the orange and red bars from 2017 to 2020.
2. Find the value of the US in 2020.
3. Determine which one is bigger.
"""
spec_1xz4egh52kvh2xwx = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the difference between the maximum before 2014 and the maximum after 2014? (7272hodb02i6e09q)
"""
1. Calculate the maximum between the values before 2014.
2. Calculate the maximum between the values after 2014.
3. Calculate the difference.
"""
spec_7272hodb02i6e09q = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: How many countries have higher red and orange values than Chile? (1y6itl6f2ho959ec)
"""
1. Find the value of the red(Disapproves) bar of Chile.
2. Find the value of the orange(No answer) bar of Chile.
3. Compare each country to see if the red(Disapproves) value and the orange(No answer) value are higher than those of Chile.
4. Count the number of the countries.
"""
spec_1y6itl6f2ho959ec = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: In how many years was the difference between Female and Male higher than average? (4ldjaoujpydpkbu5)
"""
1. Calculate the difference between females and males for each year.
2. Calculate the average.
3. Find the years where the difference shows a higher value than the average difference.
4. Count all the found values.
"""
spec_4ldjaoujpydpkbu5 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: What is the difference between the youngest age group's population values in an earliest year and the oldest age group's population values in an latest year? (221xwpab655f7g8x)
"""
1. Check the 0-14 age group's population value in 2009
2. Check the over-65 age group's population value in 2019
3. Calculate the difference between them
"""
spec_221xwpab655f7g8x = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find the year when the share of men's apparel starts to decrease. (23an1hozb7myw4e2)
"""
1. Retrieve the share values of men's apparel
2. Get the share differences between neighboring years
3. Find the first year where the difference value is negative
"""
spec_23an1hozb7myw4e2 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the average of direct and total content predicted in the future based on the present(2025)? (4wqpl5jrdmc75go3)
"""
1. Retrieve the values after year of 2026 for both contribution types
2. Calculate the average impact values for both types
"""
spec_4wqpl5jrdmc75go3 = {'ops1': [], 'ops2': []}

# Q: Find the a pair of age group with the largest difference between adjacent groups (74p313e1n8rzkfzp)
"""
1. Calculate the differences between adjacent groups
2. Sort the differences
3. Find the maximum value and pair of age group
"""
spec_74p313e1n8rzkfzp = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: What is the highest period of three years of average sales? (7mgydgux0ay0flv4)
"""
1. Find the average sales volume between -1 and +1 for each year
2. Sort the average values
3. Find the maximum average value
4. Set the period as [maximum average's year -1 ~ maximum average's year +1]
"""
spec_7mgydgux0ay0flv4 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: Find the difference between the average of the first three years of the male group and the average of the last three years of the female group (4pi1e6ev8e0zobww)
"""
1. Calculate the average of the male group population value in 2009, 2010, and 2011
2. Calculate the average of the female group population value in 2018, 2019, and 2020
3. Get the difference between two average values
"""
spec_4pi1e6ev8e0zobww = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find a hair removal type with a share of 10% or more in the under 30s group (1gb8sqnptdsdvagz)
"""
1. Retrieve the share values for each hair removal type in under 30s group
2. Check whether each value exceeds 10% or not
3. Find the hair removal types that satisfy the condition
"""
spec_1gb8sqnptdsdvagz = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: When was the year when the difference in wealth between the Senate and the House was the least? (4vcdm7lwwlgdd0h1)
"""
1. Calculate the wealth differences between the Senate and the House in each year
2. Sort the differences
3. Find the maximum value and year
"""
spec_4vcdm7lwwlgdd0h1 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Among untreated people, find the difference between the proportion of males and the proportion of females (1hm2mi3o0ejxp7tn)
"""
1. Retrieve the share values who are currently untreated
2. Sum the male's share values among them
3. Sum the female's share values among them
4. Get the difference between male's value and female's value
"""
spec_1hm2mi3o0ejxp7tn = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': []}

# Q: Find the difference between the response with the smallest percentage in the youngest group and the response with the highest percentage in the oldest group (240rurpp2arislnt)
"""
1. Sort the share values in 18-29 age group
2. Find the minimum value of them
3. Sort the share values in 65+ age group
4. Find the maximum value if them
5. Get the difference between youngest group's minimum value and oldest group's maximum value
"""
spec_240rurpp2arislnt = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: In what year is the smallest difference between the market size of Asia Pacific region and the remaining three regions? (2a8mliwolqqo6s5u)
"""
1. For each year, get the difference between Asia Pacific's market size and sum of the remaining regions' market size
2. Sort the difference values
3. Find the minimum value and year
"""
spec_2a8mliwolqqo6s5u = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find a period with a franchise value of $200 million or less (1a6pxfig1xf4oeu3)
"""
1. Find the first year where the franchise value is less than $200 million
2. Find the last year where the franchise value is over than $200 million
3. Get the period 
"""
spec_1a6pxfig1xf4oeu3 = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find the difference between the average revue with 2020 and the average revue with 2020 excluded (1ashoniy42n3n5jr)
"""
1. Calculate the average revenue from 2013 to 2019
2. Calculate the average revenue from 2013 to 2020
3. Get the difference between them
"""
spec_1ashoniy42n3n5jr = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find the year in which the value of exports was greater than the minimum value of imports. (4twwx65oath7vrkt)
"""
1. Retrieve the minimum value of imports
2. Compare the exports' value of each year and the minimum imports' value
3. Select the years when the export's value is higher than the minimum imports' value
"""
spec_4twwx65oath7vrkt = {'ops1': [], 'ops2': [], 'ops3': []}

# Q: Find the difference between the average percentage of even and odd years (7w9v4fsbg5ydxsr2)
"""
1. Retrieve the even years' percentage value
2. calculate the average of them
3. Retrieve the odd years' percentage value
4. Calculate the average of them
5. Get the difference between even years' average and odd   years' average
"""
spec_7w9v4fsbg5ydxsr2 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: What is the average value of top 3 malls' per sqaure foot cost? (1a09xqtrj8zms716)
"""
1. Sum up the top 3 values(Sydney, Melbourne, Brisbane)
2. Divide the sum value with 3
"""
spec_1a09xqtrj8zms716 = {'ops1': [], 'ops2': []}

# Q: What is the difference between average of maximum payment in all states and average of minimum payment in all states? (16fif5hdi8yzml00)
"""
1. sum up the maximum payment value of all states
2. Divide it with the number of states to calculate the average
3. sum up the minimum payment value of all states
4. Divide it with the number of states to calculate the average 
5. Calculate the difference between two average values
"""
spec_16fif5hdi8yzml00 = {'ops1': [], 'ops2': [], 'ops3': [], 'ops4': [], 'ops5': []}

# Q: Count all the years that change from increasing to decreasing (827lhm2w7n652knp)
"""
1. Find a difference between the neighboring years(year - previous year)
2. Check whether each year's difference value is positive or negative
3. Count the years where the difference values are negative
"""
spec_827lhm2w7n652knp = {'ops1': [], 'ops2': [], 'ops3': []}

