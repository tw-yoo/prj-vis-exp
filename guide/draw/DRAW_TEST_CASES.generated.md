# Draw Test Cases (Generated)

이 문서는 `draw_test_cases.csv`에서 자동 생성됩니다.

## highlight / highlight

### Simple bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "chartId": "",
      "select": {
        "mark": null,
        "keys": [
          "USA",
          "KOR"
        ]
      }
    }
  ]
}
```

### Stacked bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "1"
        ]
      }
    }
  ]
}
```

### Grouped bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "North America"
        ]
      }
    }
  ]
}
```

### Simple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "1992-01-01"
        ]
      }
    }
  ]
}
```

### Multiple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "highlight",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "2000-01-01"
        ]
      }
    }
  ]
}
```

## dim / dim

### Simple bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": [
          "USA",
          "GBR"
        ]
      }
    }
  ]
}
```

### Stacked bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": [
          "2"
        ]
      }
    }
  ]
}
```

### Grouped bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": [
          "Asia Pacific"
        ]
      }
    }
  ]
}
```

### Simple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "1991-01-01"
        ]
      }
    }
  ]
}
```

### Multiple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "dim",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": [
          "2000-03-01"
        ]
      }
    }
  ]
}
```

## text / text (normalized)

### Simple bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": null
      },
      "text": {
        "value": "Test string",
        "mode": "normalized",
        "position": {
          "x": 0.5,
          "y": 0.75
        },
        "offset": null,
        "style": null
      }
    }
  ]
}
```

### Stacked bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": null
      },
      "text": {
        "value": "Stacked note",
        "mode": "normalized",
        "position": {
          "x": 0.5,
          "y": 0.8
        },
        "offset": null,
        "style": {
          "color": "#111",
          "fontSize": 12
        }
      }
    }
  ]
}
```

### Grouped bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "chartId": null,
      "select": {
        "mark": "rect",
        "keys": null
      },
      "text": {
        "value": "Grouped note",
        "mode": "normalized",
        "position": {
          "x": 0.5,
          "y": 0.8
        },
        "offset": null,
        "style": {
          "color": "#111",
          "fontSize": 12
        }
      }
    }
  ]
}
```

### Simple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": null
      },
      "text": {
        "value": "Line note",
        "mode": "normalized",
        "position": {
          "x": 0.5,
          "y": 0.8
        },
        "offset": null,
        "style": {
          "color": "#111",
          "fontSize": 12
        }
      }
    }
  ]
}
```

### Multiple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "chartId": null,
      "select": {
        "mark": null,
        "keys": null
      },
      "text": {
        "value": "Multi line note",
        "mode": "normalized",
        "position": {
          "x": 0.5,
          "y": 0.8
        },
        "offset": null,
        "style": {
          "color": "#111",
          "fontSize": 12
        }
      }
    }
  ]
}
```

## text / text (anchor)

### Simple bar
```json
{
  "op": "draw",
  "action": "text",
  "select": {
    "keys": [
      "KOR",
      "USA"
    ]
  },
  "text": {
    "value": {
      "KOR": "Korea",
      "USA": "US"
    },
    "mode": "anchor",
    "offset": {
      "y": -8
    },
    "style": {
      "color": "#111",
      "fontSize": 12,
      "fontWeight": "bold"
    }
  }
}
```

### Stacked bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "select": {
        "keys": [
          "1",
          "2"
        ]
      },
      "text": {
        "value": {
          "1": "Jan",
          "2": "Feb"
        },
        "mode": "anchor",
        "offset": {
          "y": -8
        },
        "style": {
          "color": "#111",
          "fontSize": 12,
          "fontWeight": "bold"
        }
      }
    }
  ]
}
```

### Grouped bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "select": {
        "keys": [
          "North America",
          "Asia Pacific"
        ]
      },
      "text": {
        "value": {
          "North America": "NA",
          "Asia Pacific": "APAC"
        },
        "mode": "anchor",
        "offset": {
          "y": -8
        },
        "style": {
          "color": "#111",
          "fontSize": 12,
          "fontWeight": "bold"
        }
      }
    }
  ]
}
```

### Simple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "select": {
        "keys": [
          "1990-01-01",
          "1992-01-01"
        ]
      },
      "text": {
        "value": {
          "1990-01-01": "1990",
          "1992-01-01": "1992"
        },
        "mode": "anchor",
        "offset": {
          "y": -8
        },
        "style": {
          "color": "#111",
          "fontSize": 12,
          "fontWeight": "bold"
        }
      }
    }
  ]
}
```

### Multiple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "text",
      "select": {
        "keys": [
          "2000-01-01",
          "2000-02-01"
        ]
      },
      "text": {
        "value": {
          "2000-01-01": "2000-01",
          "2000-02-01": "2000-02"
        },
        "mode": "anchor",
        "offset": {
          "y": -8
        },
        "style": {
          "color": "#111",
          "fontSize": 12,
          "fontWeight": "bold"
        }
      }
    }
  ]
}
```

## rect / rect (axis, x 하나)

### Simple bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "x": [
        "KOR"
      ]
    },
    "style": {
      "fill": "#22c55e33"
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "x": [
        "1"
      ]
    },
    "style": {
      "fill": "#22c55e33"
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "x": [
        "North America"
      ]
    },
    "style": {
      "fill": "#22c55e33"
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "x": [
        "1990"
      ]
    },
    "style": {
      "fill": "#22c55e33"
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "x": [
        "2000"
      ]
    },
    "style": {
      "fill": "#22c55e33"
    }
  }
}
```

## rect / rect (axis, y 두 값)

### Simple bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "y": [
        40,
        70
      ]
    },
    "style": {
      "fill": "#c084fc33",
      "stroke": "#7c3aed"
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "y": [
        20,
        60
      ]
    },
    "style": {
      "fill": "#c084fc33",
      "stroke": "#7c3aed"
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "y": [
        5,
        12
      ]
    },
    "style": {
      "fill": "#c084fc33",
      "stroke": "#7c3aed"
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "y": [
        700,
        900
      ]
    },
    "style": {
      "fill": "#c084fc33",
      "stroke": "#7c3aed"
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "axis",
    "axis": {
      "y": [
        70,
        90
      ]
    },
    "style": {
      "fill": "#c084fc33",
      "stroke": "#7c3aed"
    }
  }
}
```

## rect / rect (normalized)

### Simple bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": {
      "x": 0.5,
      "y": 0.6
    },
    "size": {
      "width": 0.3,
      "height": 0.2
    },
    "style": {
      "fill": "#60a5fa33",
      "stroke": "#2563eb"
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": {
      "x": 0.5,
      "y": 0.6
    },
    "size": {
      "width": 0.3,
      "height": 0.2
    },
    "style": {
      "fill": "#60a5fa33",
      "stroke": "#2563eb"
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": {
      "x": 0.5,
      "y": 0.6
    },
    "size": {
      "width": 0.3,
      "height": 0.2
    },
    "style": {
      "fill": "#60a5fa33",
      "stroke": "#2563eb"
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": {
      "x": 0.5,
      "y": 0.6
    },
    "size": {
      "width": 0.3,
      "height": 0.2
    },
    "style": {
      "fill": "#60a5fa33",
      "stroke": "#2563eb"
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "normalized",
    "position": {
      "x": 0.5,
      "y": 0.6
    },
    "size": {
      "width": 0.3,
      "height": 0.2
    },
    "style": {
      "fill": "#60a5fa33",
      "stroke": "#2563eb"
    }
  }
}
```

## rect / rect (data-point)

### Simple bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "data-point",
    "point": {
      "x": "KOR"
    },
    "size": {
      "width": 0.08,
      "height": 0.12
    },
    "style": {
      "stroke": "#ef4444",
      "strokeWidth": 2,
      "fill": "none"
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "data-point",
    "point": {
      "x": "1"
    },
    "size": {
      "width": 0.08,
      "height": 0.12
    },
    "style": {
      "stroke": "#ef4444",
      "strokeWidth": 2,
      "fill": "none"
    }
  }
}
```

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "data-point",
    "point": {
      "x": "1992-01-01"
    },
    "size": {
      "width": 0.06,
      "height": 0.12
    },
    "style": {
      "stroke": "#ef4444",
      "strokeWidth": 2,
      "fill": "none"
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "rect",
  "rect": {
    "mode": "data-point",
    "point": {
      "x": "2000-03-01"
    },
    "size": {
      "width": 0.06,
      "height": 0.12
    },
    "style": {
      "stroke": "#ef4444",
      "strokeWidth": 2,
      "fill": "none"
    }
  }
}
```

## line / line (connect)

### Simple bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "chartId": null,
      "line": {
        "mode": "connect",
        "axis": null,
        "pair": {
          "x": [
            "USA",
            "ESP"
          ]
        },
        "hline": null,
        "angle": null,
        "length": null,
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": null,
          "opacity": null
        },
        "arrow": null
      }
    }
  ]
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "pair": {
      "x": [
        "1",
        "3"
      ]
    },
    "style": {
      "stroke": "#2563eb"
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "pair": {
      "x": [
        "North America",
        "Asia Pacific"
      ]
    },
    "style": {
      "stroke": "#2563eb"
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "pair": {
      "x": [
        "1995-01-01",
        "2005-01-01"
      ]
    },
    "style": {
      "stroke": "#2563eb"
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "connect",
    "pair": {
      "x": [
        "2000-01-01",
        "2000-04-01"
      ]
    },
    "style": {
      "stroke": "#2563eb"
    }
  }
}
```

## line / line (arrowheads on ends)

### Simple bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "chartId": null,
      "line": {
        "mode": "connect",
        "axis": null,
        "pair": {
          "x": [
            "USA",
            "ESP"
          ]
        },
        "hline": null,
        "angle": null,
        "length": null,
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": null,
          "opacity": null
        },
        "arrow": {
          "start": false,
          "end": true,
          "length": null,
          "width": null,
          "style": null
        }
      }
    }
  ]
}
```

### Stacked bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "connect",
        "pair": {
          "x": [
            "1",
            "3"
          ]
        },
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": 2
        },
        "arrow": {
          "start": true,
          "end": true,
          "length": 12,
          "width": 8
        }
      }
    }
  ]
}
```

### Grouped bar
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "connect",
        "pair": {
          "x": [
            "North America",
            "Asia Pacific"
          ]
        },
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": 2
        },
        "arrow": {
          "start": true,
          "end": true,
          "length": 12,
          "width": 8
        }
      }
    }
  ]
}
```

### Simple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "connect",
        "pair": {
          "x": [
            "1990-01-01",
            "1993-01-01"
          ]
        },
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": 2
        },
        "arrow": {
          "start": true,
          "end": true,
          "length": 12,
          "width": 8
        }
      }
    }
  ]
}
```

### Multiple line
```json
{
  "ops": [
    {
      "op": "draw",
      "action": "line",
      "line": {
        "mode": "connect",
        "pair": {
          "x": [
            "2000-02-01",
            "2000-05-01"
          ]
        },
        "style": {
          "stroke": "#2563eb",
          "strokeWidth": 2
        },
        "arrow": {
          "start": true,
          "end": true,
          "length": 12,
          "width": 8
        }
      }
    }
  ]
}
```

## line / line (angle)

### Simple bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": {
      "x": "USA",
      "y": 0
    },
    "angle": 45,
    "length": 30,
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": {
      "x": "1",
      "y": 0
    },
    "angle": 45,
    "length": 20,
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": {
      "x": "North America",
      "y": 0
    },
    "angle": 45,
    "length": 10,
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": {
      "x": "1990",
      "y": 800
    },
    "angle": 30,
    "length": 150,
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "angle",
    "axis": {
      "x": "2000",
      "y": 50
    },
    "angle": 30,
    "length": 30,
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

## line / line (hline-y)

### Simple bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": {
      "y": 65
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": {
      "y": 40
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": {
      "y": 9
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": {
      "y": 900
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-y",
    "hline": {
      "y": 80
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

## line / line (hline-x)

### Simple bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": {
      "x": "KOR"
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": {
      "x": "1"
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": {
      "x": "North America"
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Simple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": {
      "x": "1992-01-01"
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "line",
  "line": {
    "mode": "hline-x",
    "hline": {
      "x": "2000-03-01"
    },
    "style": {
      "stroke": "#f59e0b",
      "strokeWidth": 2
    }
  }
}
```

## filter / filter

### Simple bar
```json
{
  "op": "draw",
  "action": "filter",
  "filter": {
    "x": {
      "include": [
        "USA",
        "KOR"
      ],
      "exclude": [
        "FRA"
      ]
    },
    "y": {
      "op": "gte",
      "value": 50
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "filter",
  "filter": {
    "x": {
      "include": [
        "1",
        "2"
      ]
    },
    "y": {
      "op": "gte",
      "value": 30
    }
  }
}
```

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "filter",
  "filter": {
    "x": {
      "include": [
        "1990-01-01",
        "1992-01-01"
      ]
    },
    "y": {
      "op": "gte",
      "value": 800
    }
  }
}
```

### Multiple line
_NA_

## sort / sort

### Simple bar
```json
{
  "op": "draw",
  "action": "sort",
  "sort": {
    "by": "y",
    "order": "asc"
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "sort",
  "sort": {
    "by": "y",
    "order": "desc"
  }
}
```

### Grouped bar
_NA_

### Simple line
_NA_

### Multiple line
_NA_

## split / split (split)

### Simple bar
```json
{
  "op": "draw",
  "action": "split",
  "split": {
    "by": "x",
    "groups": {
      "A": [
        "KOR",
        "USA"
      ]
    },
    "restTo": "B",
    "orientation": "horizontal"
  }
}
```

### Stacked bar
_NA_

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "split",
  "split": {
    "by": "x",
    "groups": {
      "A": [
        "1990-01-01",
        "1991-01-01"
      ]
    },
    "restTo": "B",
    "orientation": "horizontal"
  }
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "split",
  "split": {
    "by": "x",
    "groups": {
      "A": [
        "2000-01-01"
      ]
    },
    "restTo": "B",
    "orientation": "horizontal"
  }
}
```

## split / split (unsplit)

### Simple bar
```json
{
  "op": "draw",
  "action": "unsplit"
}
```

### Stacked bar
_NA_

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "unsplit"
}
```

### Multiple line
```json
{
  "op": "draw",
  "action": "unsplit"
}
```

## sum / sum

### Simple bar
```json
{
  "op": "draw",
  "action": "sum",
  "sum": {
    "value": 1129,
    "label": "Total rating"
  }
}
```

### Stacked bar
_NA_

### Grouped bar
_NA_

### Simple line
_NA_

### Multiple line
_NA_

## bar segment / bar segment

### Simple bar
```json
{
  "op": "draw",
  "action": "bar-segment",
  "select": {
    "keys": [
      "KOR"
    ]
  },
  "segment": {
    "threshold": 45,
    "when": "gte",
    "style": {
      "fill": "#ef4444"
    }
  }
}
```

### Stacked bar
```json
{
  "op": "draw",
  "action": "bar-segment",
  "select": {
    "keys": [
      "1"
    ]
  },
  "segment": {
    "threshold": 30,
    "when": "gte",
    "style": {
      "fill": "#ef4444"
    }
  }
}
```

### Grouped bar
```json
{
  "op": "draw",
  "action": "bar-segment",
  "select": {
    "keys": [
      "North America"
    ]
  },
  "segment": {
    "threshold": 5,
    "when": "gte",
    "style": {
      "fill": "#ef4444"
    }
  }
}
```

### Simple line
_NA_

### Multiple line
_NA_

## line-trace / line-trace

### Simple bar
_NA_

### Stacked bar
_NA_

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "line-trace",
  "select": {
    "keys": [
      "1990-01-01",
      "1993-01-01"
    ]
  }
}
```

### Multiple line
_NA_

## line-to-bar / line-to-bar

### Simple bar
_NA_

### Stacked bar
_NA_

### Grouped bar
_NA_

### Simple line
```json
{
  "op": "draw",
  "action": "line-to-bar"
}
```

### Multiple line
_NA_

## stacked-to-grouped / stacked-to-grouped

### Simple bar
_NA_

### Stacked bar
```json
{
  "op": "draw",
  "action": "stacked-to-grouped"
}
```

### Grouped bar
_NA_

### Simple line
_NA_

### Multiple line
_NA_

## grouped-to-stacked / grouped-to-stacked

### Simple bar
_NA_

### Stacked bar
_NA_

### Grouped bar
```json
{
  "op": "draw",
  "action": "grouped-to-stacked"
}
```

### Simple line
_NA_

### Multiple line
_NA_

## stacked-filter-groups / stacked-filter-groups

### Simple bar
_NA_

### Stacked bar
```json
{
  "op": "draw",
  "action": "stacked-filter-groups",
  "groupFilter": {
    "groups": [
      "rain",
      "sun"
    ]
  }
}
```

### Grouped bar
_NA_

### Simple line
_NA_

### Multiple line
_NA_

## grouped-filter-groups / grouped-filter-groups

### Simple bar
_NA_

### Stacked bar
_NA_

### Grouped bar
```json
{
  "op": "draw",
  "action": "grouped-filter-groups",
  "groupFilter": {
    "groups": [
      "North America"
    ]
  }
}
```

### Simple line
_NA_

### Multiple line
_NA_

## sleep / sleep (seconds)

### Simple bar
```json
{
  "op": "sleep",
  "seconds": 1
}
```

### Stacked bar
```json
{
  "op": "sleep",
  "seconds": 1
}
```

### Grouped bar
```json
{
  "op": "sleep",
  "seconds": 1
}
```

### Simple line
```json
{
  "op": "sleep",
  "seconds": 1
}
```

### Multiple line
```json
{
  "op": "sleep",
  "seconds": 1
}
```
