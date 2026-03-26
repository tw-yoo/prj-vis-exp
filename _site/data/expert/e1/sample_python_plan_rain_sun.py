from __future__ import annotations


def build_request() -> dict:
    return {
        "question": "Which months are above average in both rain and sun?",
        "explanation": (
            "Compute the average of count for rain and for sun across all months. "
            "Filter months where each is above its own average. "
            "Take the intersection of the two month sets."
        ),
        "vega_lite_spec": {
            "mark": "bar",
            "encoding": {
                "x": {"field": "month", "type": "ordinal"},
                "y": {"field": "count", "type": "quantitative"},
                "color": {"field": "weather", "type": "nominal"},
            },
        },
        "data_rows": [
            {"month": "Jan", "weather": "rain", "count": 10},
            {"month": "Feb", "weather": "rain", "count": 20},
            {"month": "Mar", "weather": "rain", "count": 30},
            {"month": "Jan", "weather": "sun", "count": 12},
            {"month": "Feb", "weather": "sun", "count": 16},
            {"month": "Mar", "weather": "sun", "count": 18},
        ],
        "debug": True,
    }

