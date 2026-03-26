import copy
import json
from typing import Any, Dict, List, Optional, Tuple, Union

Spec = Dict[str, Any]


# ----------------------------- helpers -----------------------------

def _deepcopy(spec: Spec) -> Spec:
    return copy.deepcopy(spec)

def _is_dict(x: Any) -> bool:
    return isinstance(x, dict)

def _quote(v: Any) -> str:
    # Vega expression literal
    return json.dumps(v, ensure_ascii=False)

def _datum_eq(field: str, value: Any) -> str:
    # datum["Field Name"] == <literal>
    return f'datum[{_quote(field)}] == {_quote(value)}'

def _and_expr(parts: List[Optional[str]]) -> Optional[str]:
    parts = [p for p in parts if p]
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return "(" + ") && (".join(parts) + ")"

def _ensure_encoding(unit: Spec) -> Spec:
    if "encoding" not in unit or not _is_dict(unit["encoding"]):
        unit["encoding"] = {}
    return unit["encoding"]

def _mark_type(unit: Spec) -> Optional[str]:
    m = unit.get("mark")
    if isinstance(m, str):
        return m
    if _is_dict(m):
        return m.get("type")
    return None

def _walk_unit_specs(spec: Spec, fn):
    """
    Applies fn(unit_spec_dict) to:
      - spec itself if unit-like
      - each layer item if layered
      - nested spec.spec (facet/repeat/concat containers)
    Returns a NEW spec (deep-copied).
    """
    s = _deepcopy(spec)

    def walk(node: Any):
        if not _is_dict(node):
            return node

        # Common container patterns
        if _is_dict(node.get("spec")):
            node["spec"] = walk(node["spec"])
            return node

        if isinstance(node.get("layer"), list):
            node["layer"] = [walk(ch) for ch in node["layer"]]
            return node

        # hconcat/vconcat/concat sometimes appear
        for k in ("hconcat", "vconcat", "concat"):
            if isinstance(node.get(k), list):
                node[k] = [walk(ch) for ch in node[k]]
                return node

        # unit-ish: has encoding and/or mark
        fn(node)
        return node

    return walk(s)


def _ensure_transform_list(node: Spec) -> List[Dict[str, Any]]:
    """Ensure node has a `transform` list and return it."""
    if "transform" not in node or node["transform"] is None:
        node["transform"] = []
    if not isinstance(node["transform"], list):
        # normalize unexpected shapes
        node["transform"] = [node["transform"]]
    return node["transform"]


def _prepend_filter_transform(node: Spec, filter_obj: Dict[str, Any]) -> None:
    """Prepend a filter transform so it runs before other transforms."""
    t = _ensure_transform_list(node)
    t.insert(0, {"filter": filter_obj})


def _filter_predicate_eq(field: str, value: Any) -> Dict[str, Any]:
    return {"field": field, "equal": value}


def _filter_predicate_one_of(field: str, values: List[Any]) -> Dict[str, Any]:
    return {"field": field, "oneOf": list(values)}


def _filter_predicate_range(field: str, min_val: Union[int, float], max_val: Union[int, float]) -> Dict[str, Any]:
    return {"field": field, "range": [min_val, max_val]}


def _apply_filter_to_all_relevant_scopes(spec: Spec, filter_obj: Dict[str, Any], *,
                                        apply_to_layer_children: bool = False) -> Spec:
    """
    Attach a filter transform to the right scope.

    Rules:
    - If the spec is layered (top-level `layer`), apply filter at that node so it affects all layers.
    - If the spec is a container with `spec`, apply at the container node (before facet) by default;
      this is safer because it filters the data prior to faceting.
    - If apply_to_layer_children is True, also apply the same filter to any unit layer nodes that
      already have their own `data` or `transform` (rare), but by default we avoid duplicating.

    This returns a NEW spec and does not mutate the input.
    """
    s = _deepcopy(spec)

    def walk(node: Any):
        if not _is_dict(node):
            return node

        # Container pattern: apply at container so data is filtered before facet/repeat
        if _is_dict(node.get("spec")):
            _prepend_filter_transform(node, filter_obj)
            node["spec"] = walk(node["spec"])
            return node

        # Layered: apply at this layer root
        if isinstance(node.get("layer"), list):
            _prepend_filter_transform(node, filter_obj)
            node["layer"] = [walk(ch) for ch in node["layer"]]

            if apply_to_layer_children:
                for ch in node["layer"]:
                    if _is_dict(ch):
                        # If a child has its own data/transform, you may want the filter duplicated.
                        # We only duplicate when explicitly requested.
                        if "data" in ch or "transform" in ch:
                            _prepend_filter_transform(ch, filter_obj)
            return node

        # Concat: apply at this node and recurse
        for k in ("hconcat", "vconcat", "concat"):
            if isinstance(node.get(k), list):
                _prepend_filter_transform(node, filter_obj)
                node[k] = [walk(ch) for ch in node[k]]
                return node

        # Unit spec: apply here
        _prepend_filter_transform(node, filter_obj)
        return node

    return walk(s)


# ---------------------- (0) y-axis max/domain ----------------------

def set_y_scale(spec: Spec,
                *,
                domain: Optional[Tuple[Union[int, float], Union[int, float]]] = None,
                domain_min: Optional[Union[int, float]] = None,
                domain_max: Optional[Union[int, float]] = None) -> str:
    """
    (Vega-Lite) y축 스케일(domain) 고정/제어를 spec에 주입합니다.

    이 함수는 bar/line 등 y encoding이 있는 차트에서 `encoding.y.scale`에 아래 값을 설정합니다.

    필수/선택 인자
    - `spec` (필수): Vega-Lite spec(dict)
    - `domain` (선택): (min, max) 튜플/리스트. 주면 `scale.domain=[min,max]`로 **고정**합니다.
      - 이 경우 기존 `domainMin`/`domainMax`는 제거됩니다(충돌 방지).
    - `domain_min` (선택): `scale.domainMin` 설정
    - `domain_max` (선택): `scale.domainMax` 설정
      - `domain`을 주지 않은 경우에만 의미가 있습니다.

    동작 규칙
    - `domain`이 주어지면 가장 우선이며, 명시적 min/max 도메인을 고정합니다.
    - `domain`이 없고 `domain_min`/`domain_max`만 주어지면 해당 값만 세팅합니다.

    반환값
    - `str`: 업데이트된 spec의 JSON 문자열 (`json.dumps(..., ensure_ascii=False)`)

    예시
    ```python
    # y축 최대값 고정
    patched_json = set_y_scale(spec, domain_max=450)

    # y축 범위 완전 고정
    patched_json = set_y_scale(spec, domain=(0, 100))

    # y축 최소/최대 일부만 고정
    patched_json = set_y_scale(spec, domain_min=0, domain_max=450)
    ```
    """
    if domain is not None:
        if not (isinstance(domain, (tuple, list)) and len(domain) == 2):
            raise ValueError("domain must be a 2-tuple/list: (min, max)")

    def apply(unit: Spec):
        enc = unit.get("encoding")
        if not _is_dict(enc) or "y" not in enc or not _is_dict(enc["y"]):
            return

        y = enc["y"]
        if "scale" not in y or not _is_dict(y["scale"]):
            y["scale"] = {}
        sc = y["scale"]

        if domain is not None:
            sc["domain"] = [domain[0], domain[1]]
            sc.pop("domainMin", None)
            sc.pop("domainMax", None)
        else:
            if domain_min is not None:
                sc["domainMin"] = domain_min
            if domain_max is not None:
                sc["domainMax"] = domain_max

    updated = _walk_unit_specs(spec, apply)
    return json.dumps(updated, ensure_ascii=False)


# ------------------- (1) simple bar: bar color ---------------------

def highlight_simple_bar(spec: Spec,
                         *,
                         x_field: str,
                         x_value: Any,
                         highlight_color: str,
                         base_color: str = "lightgray",
                         extra_equals: Optional[List[Tuple[str, Any]]] = None) -> str:
    """
    (Vega-Lite) 단일 시리즈(simple) bar 차트에서 특정 bar 하나의 색만 바꾸는 highlight를 주입합니다.

    **중요:** simple bar는 보통 `encoding.color.field`가 없는 경우가 많아, 이 함수는
    `encoding.color`를 **condition/value 형태로 overwrite** 합니다.

    필수/선택 인자
    - `spec` (필수): Vega-Lite spec(dict)
    - `x_field` (필수): x encoding에 해당하는 필드명(예: "Season", "country")
    - `x_value` (필수): 하이라이트할 x의 값(예: "2019/20", "USA")
    - `highlight_color` (필수): 강조 색(예: "#ff0000", "red")
    - `base_color` (선택): 기본 bar 색(기본값 "lightgray")
    - `extra_equals` (선택): 추가 AND 조건. (field, value) 리스트
      - 예: `[("Region", "EU")]` → `x_field==x_value AND Region=="EU"` 인 bar만 highlight

    반환값
    - `str`: 업데이트된 spec의 JSON 문자열

    예시
    ```python
    patched_json = highlight_simple_bar(
        spec,
        x_field="country",
        x_value="USA",
        highlight_color="#ff0000",
        base_color="lightgray",
    )

    patched_json = highlight_simple_bar(
        spec,
        x_field="Season",
        x_value="2019/20",
        highlight_color="orange",
        extra_equals=[("Revenue_Type", "Broadcasting")],
    )
    ```
    """
    extra_equals = extra_equals or []
    test = _and_expr([_datum_eq(x_field, x_value)] + [_datum_eq(f, v) for f, v in extra_equals])

    def apply(unit: Spec):
        if _mark_type(unit) != "bar":
            return
        enc = _ensure_encoding(unit)
        # overwrite color to condition/value (no field) for simple bar
        enc["color"] = {
            "condition": {"test": test, "value": highlight_color},
            "value": base_color,
            "legend": None
        }

    updated = _walk_unit_specs(spec, apply)
    return json.dumps(updated, ensure_ascii=False)


# -------- (2) stacked bar: whole x bar OR x+group segment -----------

def highlight_stacked_bar(spec: Spec,
                          *,
                          x_field: str,
                          x_value: Any,
                          highlight_color: str,
                          group_field: Optional[str] = None,
                          group_value: Any = None) -> str:
    """
    (Vega-Lite) stacked bar 차트에서 색상 highlight를 주입합니다.

    동작
    - spec에 `encoding.color.field`가 이미 있으면(스택 그룹/series를 표현),
      그 field는 **유지**하면서 `condition`만 overlay 합니다. (스택 semantics 보존)
    - `group_field`를 주지 않으면: 특정 x에 해당하는 **전체 bar(모든 segment)** 를 같은 색으로 highlight
    - `group_field`와 `group_value`를 주면: 특정 x + 특정 group segment만 highlight

    필수/선택 인자
    - `spec` (필수): Vega-Lite spec(dict)
    - `x_field` (필수): x 축 필드
    - `x_value` (필수): highlight할 x 값
    - `highlight_color` (필수): 강조 색
    - `group_field` (선택): segment 구분 필드(보통 `encoding.color.field`와 동일)
    - `group_value` (선택): highlight할 segment 값

    반환값
    - `str`: 업데이트된 spec의 JSON 문자열

    예시
    ```python
    # (a) 특정 x의 전체 bar(모든 segment) highlight
    patched_json = highlight_stacked_bar(
        spec,
        x_field="month",
        x_value="Feb",
        highlight_color="#ff0000",
    )

    # (b) 특정 x + 특정 segment만 highlight
    patched_json = highlight_stacked_bar(
        spec,
        x_field="month",
        x_value="Feb",
        group_field="weather",
        group_value="rain",
        highlight_color="#ff0000",
    )
    ```
    """
    parts = [_datum_eq(x_field, x_value)]
    if group_field is not None:
        parts.append(_datum_eq(group_field, group_value))
    test = _and_expr(parts)

    def apply(unit: Spec):
        if _mark_type(unit) != "bar":
            return
        enc = _ensure_encoding(unit)

        orig_color = enc.get("color") if _is_dict(enc.get("color")) else None
        if orig_color and orig_color.get("field"):
            # preserve stacking semantics; just add condition overlay
            new_color = _deepcopy(orig_color)
            new_color["condition"] = {"test": test, "value": highlight_color}
            enc["color"] = new_color
        else:
            # fallback: behave like simple bar
            enc["color"] = {
                "condition": {"test": test, "value": highlight_color},
                "value": "lightgray",
                "legend": None
            }

    updated = _walk_unit_specs(spec, apply)
    return json.dumps(updated, ensure_ascii=False)


# ---------------- (3) grouped bar: specific bar color --------------

def highlight_grouped_bar(spec: Spec,
                          *,
                          x_field: str,
                          x_value: Any,
                          highlight_color: str,
                          base_color: Optional[str] = None,
                          series_field: Optional[str] = None,
                          series_value: Any = None,
                          facet_field: Optional[str] = None,
                          facet_value: Any = None) -> str:
    """
    (Vega-Lite) grouped bar(또는 column facet 포함)에서 특정 bar 하나를 색으로 highlight 합니다.

    식별 조건
    - 기본: `x_field == x_value`
    - 추가로 필요하면 AND 조건:
      - `series_field == series_value` (그룹/시리즈 식별)
      - `facet_field == facet_value` (facet(열/행) 식별)

    동작
    - 기존 `encoding.color.field`가 있으면 그 field를 유지하고 `condition`만 overlay
    - 없으면 simple bar처럼 `condition/value` 형태로 color를 세팅

    필수/선택 인자
    - `spec` (필수): Vega-Lite spec(dict)
    - `x_field`, `x_value` (필수): 대상 bar의 x 식별
    - `highlight_color` (필수): 강조 색
    - `base_color` (선택): 기본 색(기본 lightgray)
    - `series_field`, `series_value` (선택): grouped에서 특정 bar(시리즈)를 정확히 찍고 싶을 때
    - `facet_field`, `facet_value` (선택): facet chart에서 특정 패널만 찍고 싶을 때

    반환값
    - `str`: 업데이트된 spec의 JSON 문자열

    예시
    ```python
    # grouped bar에서 (x, series)로 특정 bar highlight
    patched_json = highlight_grouped_bar(
        spec,
        x_field="country",
        x_value="USA",
        series_field="procedure",
        series_value="Surgical",
        highlight_color="#ff0000",
    )

    # facet(column)까지 포함해서 특정 패널의 특정 bar highlight
    patched_json = highlight_grouped_bar(
        spec,
        x_field="Year",
        x_value="2020",
        series_field="Product",
        series_value="A",
        facet_field="Region",
        facet_value="EU",
        highlight_color="orange",
    )
    ```
    """
    conds = [_datum_eq(x_field, x_value)]
    if series_field is not None:
        conds.append(_datum_eq(series_field, series_value))
    if facet_field is not None:
        conds.append(_datum_eq(facet_field, facet_value))
    test = _and_expr(conds)

    def apply(unit: Spec):
        if _mark_type(unit) != "bar":
            return
        enc = _ensure_encoding(unit)
        orig_color = enc.get("color") if _is_dict(enc.get("color")) else None

        if orig_color and orig_color.get("field"):
            new_color = _deepcopy(orig_color)
            new_color["condition"] = {"test": test, "value": highlight_color}
            enc["color"] = new_color
        else:
            enc["color"] = {
                "condition": {"test": test, "value": highlight_color},
                "value": base_color or "lightgray",
                "legend": None
            }

    updated = _walk_unit_specs(spec, apply)
    return json.dumps(updated, ensure_ascii=False)


# -------------- (4)(5) line: 특정 데이터 포인트 색 ----------------

def highlight_points(spec: Spec,
                     *,
                     x_field: str,
                     x_value: Any,
                     y_field: Optional[str] = None,
                     y_value: Any = None,
                     series_field: Optional[str] = None,
                     series_value: Any = None,
                     highlight_color: str = "red",
                     base_color: str = "lightgray",
                     target_mark_types: Tuple[str, ...] = ("point",)) -> str:
    """
    (Vega-Lite) 특정 데이터 포인트(주로 point mark)의 색을 조건부로 highlight 합니다.

    적용 대상
    - mark.type이 `target_mark_types`에 포함된 unit/layer만 적용 (기본: point)
      - multi-line layered spec에서 line layer는 유지하고 point layer만 highlight 하는 전형적 패턴을 지원

    식별 조건
    - 기본: `x_field == x_value`
    - 선택: `y_field == y_value`, `series_field == series_value` 를 AND로 추가 가능

    필수/선택 인자
    - `spec` (필수)
    - `x_field`, `x_value` (필수)
    - `y_field`, `y_value` (선택): 같은 x에 여러 포인트가 있을 때 y로 더 좁히기
    - `series_field`, `series_value` (선택): multi-series에서 특정 series만 좁히기
    - `highlight_color` (선택, 기본 "red")
    - `base_color` (선택, 기본 "lightgray")
    - `target_mark_types` (선택, 기본 ("point",)): 예: ("point","circle") 등

    반환값
    - `str`: 업데이트된 spec의 JSON 문자열

    예시
    ```python
    # point layer가 있는 line chart에서 특정 x 포인트 강조
    patched_json = highlight_points(
        spec,
        x_field="year",
        x_value="2020",
        highlight_color="#ff0000",
        base_color="#2563eb",
    )

    # multi-line + point layer에서 특정 series의 특정 포인트만 강조
    patched_json = highlight_points(
        spec,
        x_field="year",
        x_value="2019",
        series_field="series",
        series_value="B",
        highlight_color="orange",
        base_color="lightgray",
    )
    ```
    """
    conds = [_datum_eq(x_field, x_value)]
    if y_field is not None:
        conds.append(_datum_eq(y_field, y_value))
    if series_field is not None:
        conds.append(_datum_eq(series_field, series_value))
    test = _and_expr(conds)

    def apply(unit: Spec):
        mt = _mark_type(unit)
        if mt not in target_mark_types:
            return
        enc = _ensure_encoding(unit)
        orig_color = enc.get("color") if _is_dict(enc.get("color")) else None

        if orig_color and orig_color.get("field"):
            new_color = _deepcopy(orig_color)
            new_color["condition"] = {"test": test, "value": highlight_color}
            enc["color"] = new_color
        else:
            enc["color"] = {
                "condition": {"test": test, "value": highlight_color},
                "value": base_color,
                "legend": None
            }

    updated = _walk_unit_specs(spec, apply)
    return json.dumps(updated, ensure_ascii=False)


# ------------------------ example usage ------------------------
# updated_json = set_y_scale(spec_dict, domain_max=100)
# updated_json = highlight_simple_bar(spec_dict, x_field="Year", x_value="2020", highlight_color="red")
# updated_json = highlight_stacked_bar(spec_dict, x_field="Year", x_value="2020", highlight_color="red",
#                                      group_field="Age_Group", group_value="15-24")
# updated_json = highlight_grouped_bar(spec_dict, x_field="Year", x_value="2020", highlight_color="red",
#                                      facet_field="Product Category", facet_value="Food",
#                                      series_field="Year", series_value="2020")
# updated_json = highlight_points(spec_dict, x_field="Year", x_value=2016,
#                                 y_field="Favorable_View_Percentage", y_value=42,
#                                 series_field="Country_Group", series_value="Group A",
#                                 highlight_color="red")


# -------------------------- filtering ops --------------------------

def filter_eq(spec: Spec, *, field: str, value: Any) -> Spec:
    """
    (Vega-Lite) `transform.filter`를 `{field, equal}` 형태로 spec에 주입합니다.

    필수/선택 인자
    - `spec` (필수)
    - `field` (필수): 필터링할 필드명
    - `value` (필수): 유지할 값(= equal)

    주입 위치(스코프)
    - layered spec이면 layer root에 prepend → 모든 layer에 동일 필터 적용
    - facet/repeat/concat container면 container에 prepend → facet 전에 데이터가 걸러지도록
    - unit spec이면 해당 unit에 prepend

    반환값
    - `Spec`(dict): 업데이트된 spec dict (JSON 문자열이 아님)

    예시
    ```python
    patched = filter_eq(spec, field="country", value="USA")
    ```
    """
    pred = _filter_predicate_eq(field, value)
    return _apply_filter_to_all_relevant_scopes(spec, pred)


def filter_one_of(spec: Spec, *, field: str, values: List[Any]) -> Spec:
    """
    (Vega-Lite) `transform.filter`를 `{field, oneOf:[...]}` 형태로 spec에 주입합니다.

    필수/선택 인자
    - `spec` (필수)
    - `field` (필수)
    - `values` (필수): 남길 값 리스트

    반환값
    - `Spec`(dict): 업데이트된 spec dict

    예시
    ```python
    patched = filter_one_of(spec, field="Revenue_Type", values=["Broadcasting","Commercial"])
    ```
    """
    pred = _filter_predicate_one_of(field, values)
    return _apply_filter_to_all_relevant_scopes(spec, pred)


def filter_range(spec: Spec, *, field: str, min_val: Union[int, float], max_val: Union[int, float]) -> Spec:
    """
    (Vega-Lite) `transform.filter`를 `{field, range:[min,max]}` 형태로 spec에 주입합니다.

    필수/선택 인자
    - `spec` (필수)
    - `field` (필수)
    - `min_val`, `max_val` (필수): 범위

    반환값
    - `Spec`(dict): 업데이트된 spec dict

    예시
    ```python
    patched = filter_range(spec, field="x", min_val=0, max_val=10)
    ```
    """
    pred = _filter_predicate_range(field, min_val, max_val)
    return _apply_filter_to_all_relevant_scopes(spec, pred)


# ---------------- chart-type oriented wrappers (optional) ----------------

def filter_stacked_bar(spec: Spec,
                       *,
                       x_field: Optional[str] = None,
                       x_value: Any = None,
                       group_field: Optional[str] = None,
                       group_values: Optional[List[Any]] = None) -> Spec:
    """
    (Vega-Lite) stacked bar용 필터 convenience wrapper 입니다.

    필수/선택 인자
    - `spec` (필수)
    - `x_field` (선택): 특정 x만 남기고 싶을 때
    - `x_value` (선택): x_field와 함께 사용
    - `group_field` (선택): 특정 group/segment만 남기고 싶을 때(보통 color field)
    - `group_values` (선택): 남길 group 값 리스트

    주의
    - group/segment를 필터링하면 stacked total이 달라집니다(의도된 동작).

    반환값
    - `Spec`(dict): 업데이트된 spec dict

    예시
    ```python
    # 특정 x만 남기기
    patched = filter_stacked_bar(spec, x_field="month", x_value="Feb")

    # 특정 segment만 남기기
    patched = filter_stacked_bar(spec, group_field="weather", group_values=["rain","sun"])
    ```
    """
    updated = _deepcopy(spec)
    if x_field is not None:
        updated = filter_eq(updated, field=x_field, value=x_value)
    if group_field is not None and group_values is not None:
        updated = filter_one_of(updated, field=group_field, values=group_values)
    return updated


def filter_grouped_bar(spec: Spec,
                       *,
                       facet_field: Optional[str] = None,
                       facet_values: Optional[List[Any]] = None,
                       x_field: Optional[str] = None,
                       x_values: Optional[List[Any]] = None,
                       series_field: Optional[str] = None,
                       series_values: Optional[List[Any]] = None) -> Spec:
    """
    (Vega-Lite) grouped bar(및 column-facet grouped bar)용 필터 convenience wrapper 입니다.

    필수/선택 인자
    - `spec` (필수)
    - `facet_field`, `facet_values` (선택): 특정 facet 패널만 남기기
    - `x_field`, `x_values` (선택): 특정 x 값들만 남기기
    - `series_field`, `series_values` (선택): 특정 series/group만 남기기

    반환값
    - `Spec`(dict): 업데이트된 spec dict

    예시
    ```python
    # 특정 facet + 특정 series만 남기기
    patched = filter_grouped_bar(
        spec,
        facet_field="Region",
        facet_values=["EU","NA"],
        series_field="procedure",
        series_values=["Surgical"],
    )
    ```
    """
    updated = _deepcopy(spec)
    if facet_field is not None and facet_values is not None:
        updated = filter_one_of(updated, field=facet_field, values=facet_values)
    if x_field is not None and x_values is not None:
        updated = filter_one_of(updated, field=x_field, values=x_values)
    if series_field is not None and series_values is not None:
        updated = filter_one_of(updated, field=series_field, values=series_values)
    return updated


def filter_multiple_line(spec: Spec,
                         *,
                         series_field: str,
                         series_values: List[Any],
                         x_field: Optional[str] = None,
                         x_range: Optional[Tuple[Union[int, float], Union[int, float]]] = None) -> Spec:
    """
    (Vega-Lite) multi-line 차트용 필터 convenience wrapper 입니다.

    필수/선택 인자
    - `spec` (필수)
    - `series_field` (필수): series 구분 필드(보통 color field)
    - `series_values` (필수): 남길 series 값 리스트
    - `x_field` (선택): x 범위를 추가로 제한하고 싶을 때
    - `x_range` (선택): (min, max). x_field와 함께 사용(주로 x가 quantitative일 때)

    동작
    - layered(line+point)인 경우에도 layer root에 필터를 붙여 두 레이어가 동일하게 필터링되도록 합니다.

    반환값
    - `Spec`(dict): 업데이트된 spec dict

    예시
    ```python
    patched = filter_multiple_line(
        spec,
        series_field="series",
        series_values=["g2","g3"],
    )

    patched = filter_multiple_line(
        spec,
        series_field="series",
        series_values=["g2","g3"],
        x_field="x",
        x_range=(0, 10),
    )
    ```
    """
    updated = filter_one_of(spec, field=series_field, values=series_values)
    if x_field is not None and x_range is not None:
        updated = filter_range(updated, field=x_field, min_val=x_range[0], max_val=x_range[1])
    return updated


# --------------------- chart-type conversions ---------------------

def _get_or_create_encoding(spec: Spec) -> Dict[str, Any]:
    """Return spec['encoding'] as a dict, creating an empty one if missing."""
    if not _is_dict(spec.get("encoding")):
        spec["encoding"] = {}
    return spec["encoding"]


def _iter_unit_encodings(spec: Spec) -> List[Dict[str, Any]]:
    """
    Return encoding dicts for the top-level spec and any layer unit specs.

    Notes
    -----
    - We include top-level encoding (creating it if needed).
    - For layers, we only include layers that already have an encoding dict.
      (We don't create encodings inside layers unless the caller explicitly sets them.)
    """
    encodings: List[Dict[str, Any]] = []
    encodings.append(_get_or_create_encoding(spec))

    layers = spec.get("layer")
    if isinstance(layers, list):
        for layer in layers:
            if _is_dict(layer) and _is_dict(layer.get("encoding")):
                encodings.append(layer["encoding"])
    return encodings


def _remove_facet_hints(spec: Spec, enc: Dict[str, Any]) -> None:
    """Remove common facet hints so Workbench can infer a stacked bar."""
    enc.pop("column", None)
    enc.pop("row", None)
    spec.pop("facet", None)
    spec.pop("repeat", None)


def _remove_offset_hints(enc: Dict[str, Any]) -> None:
    """Remove x/y offsets so Workbench doesn't treat spec as grouped."""
    enc.pop("xOffset", None)
    enc.pop("yOffset", None)


def _ensure_xoffset(enc: Dict[str, Any], *, field: str, reuse_from: Optional[Spec] = None,
                    type_fallback: str = "nominal") -> None:
    """
    Ensure `encoding.xOffset` exists as a {field,type} definition.

    We keep this minimal on purpose (avoid copying axis/scale configs meant for x/y).
    """
    resolved_type = type_fallback
    if reuse_from is not None:
        reused = _find_encoding_by_field(reuse_from, field)
        if _is_dict(reused) and isinstance(reused.get("type"), str):
            resolved_type = reused["type"]
    enc["xOffset"] = {"field": field, "type": resolved_type}


def _find_encoding_by_field(spec: Spec, field: str) -> Optional[Dict[str, Any]]:
    """Search common encoding channels for a definition that uses the given field."""
    enc = spec.get("encoding") if _is_dict(spec.get("encoding")) else None
    if not enc:
        return None

    # Common channels that carry field defs
    for ch in ("x", "y", "color", "column", "row", "xOffset", "yOffset", "detail"):
        d = enc.get(ch)
        if _is_dict(d) and d.get("field") == field:
            return _deepcopy(d)
    return None


def _default_field_def(field: str, *, channel: str) -> Dict[str, Any]:
    """Create a minimal field def when we can't reuse an existing one."""
    if channel == "y":
        return {"field": field, "type": "quantitative"}
    # x/color/facet default to nominal unless caller overrides later
    return {"field": field, "type": "nominal"}


def _set_encoding_channel(enc: Dict[str, Any], *, channel: str, field: str, reuse_from: Optional[Spec] = None,
                          override: Optional[Dict[str, Any]] = None) -> None:
    """Set enc[channel] to a field def; reuse existing def from reuse_from if possible."""
    base = None
    if reuse_from is not None:
        base = _find_encoding_by_field(reuse_from, field)
    if base is None:
        base = _default_field_def(field, channel=channel)

    if override:
        # shallow merge; override wins
        base.update(override)

    enc[channel] = base


def _infer_field_type(spec: Spec, field: str, *, fallback: str = "nominal") -> str:
    """Infer a Vega-Lite type string for a field from the spec's encodings."""
    reused = _find_encoding_by_field(spec, field)
    if _is_dict(reused) and isinstance(reused.get("type"), str):
        return reused["type"]
    return fallback


def stacked_to_grouped(spec: Spec,
                       *,
                       out_x_field: str,
                       out_y_field: str,
                       out_series_field: str,
                       out_facet_field: Optional[str] = None,
                       facet_channel: str = "column",
                       facet_type: str = "ordinal",
                       keep_original_config: bool = True) -> Spec:
    """
    Convert a stacked-bar-like spec into a grouped (faceted) bar spec.

    Workbench compatibility note
    ----------------------------
    Workbench infers "Grouped bar chart" when it sees either:
      - facet (encoding.column/row or spec.facet/repeat), OR
      - a field-backed xOffset (encoding.xOffset.field)
    This converter ensures grouped inference by injecting `encoding.xOffset` that references
    `out_series_field`, resulting in a side-by-side grouped bar.

    If the input spec uses a Vega-Lite v3 $schema, Workbench (Vega-Lite v5 runtime) may show
    a schema mismatch warning. We intentionally keep `$schema` unchanged to avoid unexpected
    cross-version rewrites.

    Output structure (unit spec):
      - mark: bar
      - encoding.x: out_x_field
      - encoding.y: out_y_field
      - encoding.color: out_series_field
      - optional facet: encoding.column/row: out_facet_field

    Parameters let you decide what becomes x/y/series/facet.

    Returns updated spec as a dict (does not mutate input).
    """
    if facet_channel not in ("column", "row"):
        raise ValueError("facet_channel must be 'column' or 'row'")

    s = _deepcopy(spec)

    # We only reshape the top-level unit encoding for now.
    # (If you have layered/faceted containers, apply conversion before wrapping.)
    if not _is_dict(s.get("encoding")):
        s["encoding"] = {}
    enc = s["encoding"]

    # Set mark explicitly to bar (safe for your use cases)
    s["mark"] = "bar"

    _set_encoding_channel(enc, channel="x", field=out_x_field, reuse_from=spec)
    _set_encoding_channel(enc, channel="y", field=out_y_field, reuse_from=spec)

    # In many of your grouped examples, color duplicates x (e.g., color=Region, x=Region).
    _set_encoding_channel(enc, channel="color", field=out_series_field, reuse_from=spec)

    # Remove stacking hints if present (rare but safe)
    if _is_dict(enc.get("y")) and "stack" in enc["y"]:
        enc["y"].pop("stack", None)

    # Ensure grouped inference + side-by-side grouping in Workbench via xOffset.
    for unit_enc in _iter_unit_encodings(s):
        _ensure_xoffset(unit_enc, field=out_series_field, reuse_from=spec)

    # Optional facet
    if out_facet_field is not None:
        # Reuse existing facet def if present, else create minimal
        facet_override = {"type": facet_type}
        _set_encoding_channel(enc, channel=facet_channel, field=out_facet_field, reuse_from=spec, override=facet_override)
    else:
        # If caller doesn't want facet, remove any existing facet channels
        enc.pop("column", None)
        enc.pop("row", None)

    # Keep config by default; otherwise remove potentially conflicting config
    if not keep_original_config:
        s.pop("config", None)

    return s


def grouped_to_stacked(spec: Spec,
                       *,
                       out_x_field: str,
                       out_y_field: str,
                       out_series_field: str,
                       facet_channel: str = "column",
                       keep_original_config: bool = True) -> Spec:
    """
    Convert a grouped (faceted) bar spec into a stacked bar spec.

    Typical use (matching your examples):
      - grouped has encoding.column = Year, x = Region, color = Region
      - stacked wants x = Year, color = Region

    This function:
      - removes the facet channel (column/row)
      - sets encoding.x/y/color to the fields you specify
      - relies on default bar stacking (stack is implicit)

    Returns updated spec as a dict (does not mutate input).
    """
    if facet_channel not in ("column", "row"):
        raise ValueError("facet_channel must be 'column' or 'row'")

    s = _deepcopy(spec)

    enc = _get_or_create_encoding(s)

    # Remove facet hints that force Workbench to infer grouped.
    _remove_facet_hints(s, enc)
    enc.pop(facet_channel, None)

    # Set mark explicitly
    s["mark"] = "bar"

    _set_encoding_channel(enc, channel="x", field=out_x_field, reuse_from=spec)
    _set_encoding_channel(enc, channel="y", field=out_y_field, reuse_from=spec)
    _set_encoding_channel(enc, channel="color", field=out_series_field, reuse_from=spec)

    # Remove offset hints and force stacked behavior.
    for unit_enc in _iter_unit_encodings(s):
        _remove_offset_hints(unit_enc)
        if _is_dict(unit_enc.get("y")):
            unit_enc["y"]["stack"] = "zero"

    if not keep_original_config:
        s.pop("config", None)

    return s


def select_series_to_simple_bar(spec: Spec,
                                *,
                                series_field: str,
                                series_value: Any,
                                out_x_field: Optional[str] = None,
                                out_y_field: Optional[str] = None,
                                keep_original_config: bool = True) -> Spec:
    """
    (Vega-Lite) grouped/stacked bar spec에서 특정 series 1개만 선택해 simple bar spec으로 변환합니다.

    핵심 아이디어
    - `transform.filter`(equal)을 추가해서 `series_field == series_value`만 남깁니다.
    - simple bar로 인식되도록 `encoding.color`와 grouped/stacked 힌트(facet/xOffset/stack)를 제거합니다.
    - grouped bar(예: column=Year, x=Region, color=Region)에서 Region 1개를 선택하면,
      x는 보통 facet(Year)로 옮겨서 Year별 단일 막대가 되도록 합니다.

    필수/선택 인자
    - `spec` (필수)
    - `series_field` (필수): series 구분 필드(대부분 `encoding.color.field`)
    - `series_value` (필수): 남길 series 값(예: "North America")
    - `out_x_field` (선택): 결과 simple bar의 x field를 강제로 지정하고 싶을 때
    - `out_y_field` (선택): 결과 simple bar의 y field를 강제로 지정하고 싶을 때
    - `keep_original_config` (선택, 기본 True): 기존 config 유지 여부

    반환값
    - `Spec`(dict): 변환된 spec dict

    예시
    ```python
    # grouped bar에서 "North America"만 선택해 simple bar로 변환
    simple_spec = select_series_to_simple_bar(
        grouped_spec,
        series_field="Region",
        series_value="North America",
    )
    ```
    """
    # 1) Filter first (applies at an appropriate scope: layer/container/unit)
    s = filter_eq(spec, field=series_field, value=series_value)

    # 2) Determine fields
    enc = _get_or_create_encoding(s)

    y_field = out_y_field
    if y_field is None:
        if _is_dict(enc.get("y")) and isinstance(enc["y"].get("field"), str):
            y_field = enc["y"]["field"]
    if y_field is None:
        raise ValueError("Could not infer y field; pass out_y_field explicitly.")

    x_field = out_x_field
    if x_field is None:
        x_def = enc.get("x") if _is_dict(enc.get("x")) else {}
        x_field_current = x_def.get("field") if isinstance(x_def.get("field"), str) else None

        # Prefer the existing x if it's not the series field.
        if x_field_current and x_field_current != series_field:
            x_field = x_field_current
        else:
            # Grouped pattern: facet field becomes the new x when x==series_field.
            col_def = enc.get("column") if _is_dict(enc.get("column")) else {}
            row_def = enc.get("row") if _is_dict(enc.get("row")) else {}
            col_field = col_def.get("field") if isinstance(col_def.get("field"), str) else None
            row_field = row_def.get("field") if isinstance(row_def.get("field"), str) else None
            if col_field and col_field != series_field:
                x_field = col_field
            elif row_field and row_field != series_field:
                x_field = row_field
            else:
                x_field = x_field_current or col_field or row_field

    if not x_field:
        raise ValueError("Could not infer x field; pass out_x_field explicitly.")

    # 3) Normalize to simple bar
    s["mark"] = "bar"

    # Remove top-level facet/container hints to avoid Workbench inferring GROUPED_BAR.
    _remove_facet_hints(s, enc)

    # Remove grouped/stacked hints and color across unit encodings.
    for unit_enc in _iter_unit_encodings(s):
        _remove_offset_hints(unit_enc)
        unit_enc.pop("color", None)
        unit_enc.pop("column", None)
        unit_enc.pop("row", None)
        if _is_dict(unit_enc.get("y")) and "stack" in unit_enc["y"]:
            unit_enc["y"].pop("stack", None)

    # Preserve axis/sort styling from the original x channel if available.
    orig_x_def = enc.get("x") if _is_dict(enc.get("x")) else {}
    x_axis = _deepcopy(orig_x_def.get("axis")) if _is_dict(orig_x_def.get("axis")) else None
    x_sort = _deepcopy(orig_x_def.get("sort")) if "sort" in orig_x_def else None

    x_type = _infer_field_type(spec, x_field, fallback="nominal")
    x_out: Dict[str, Any] = {"field": x_field, "type": x_type}
    if x_axis is not None:
        x_out["axis"] = x_axis
    if x_sort is not None:
        x_out["sort"] = x_sort
    enc["x"] = x_out

    # Keep y definition (axis config etc.) if possible.
    _set_encoding_channel(enc, channel="y", field=y_field, reuse_from=spec)

    if not keep_original_config:
        s.pop("config", None)

    return s


# --------------------- quick mapping examples ---------------------
# Example 1: stacked -> grouped (your naming)
# - Stacked: x=Period, y=Share_of_Import_Value, color=Country
# - "Grouped" (faceted): column=Period, x=Country, color=Country
# grouped_spec = stacked_to_grouped(
#     stacked_spec,
#     out_x_field="Country",
#     out_y_field="Share_of_Import_Value",
#     out_series_field="Country",
#     out_facet_field="Period",
#     facet_channel="column",
# )
#
# Example 2: grouped -> stacked
# - Grouped: column=Year, x=Region, color=Region, y=Media rights revenue...
# - Stacked: x=Year, color=Region
# stacked_spec = grouped_to_stacked(
#     grouped_spec,
#     out_x_field="Year",
#     out_y_field="Media rights revenue in billion US dollars",
#     out_series_field="Region",
#     facet_channel="column",
# )
