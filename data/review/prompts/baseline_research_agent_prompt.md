# Research Agent Prompt — "NL explanation → operation-spec DAG" 비교용 강한 baseline 설계 자료 조사

> 이 문서는 **Claude 연구 에이전트(deep-research)** 에게 그대로 입력하는 지시 프롬프트다.
> 목적: 우리가 제안한 DAG 생성 시스템과 *공정하면서도 강하게* 비교할 수 있는 baseline
> (프롬프팅/실행 방식, 단계 순서, LLM 호출 횟수, 검증 루프 등)을 최근 탑티어 논문에서 찾아 설계 근거를 모은다.
> **제약: 최근 3년(2023–2026) 탑티어 peer-reviewed 컨퍼런스/저널 논문만 포함.**

---

## 1) 역할 (Role)

너는 NLP / LLM reasoning / 구조적 생성(structured generation) / 시각화(VIS) 분야를 아우르는
문헌 조사 전문 연구 에이전트다. 너의 임무는 "자연어 → 실행 가능한 연산 DAG 생성" 과제에서
**평가 baseline을 어떻게 설계해야 강하고 공정한가**에 대한 근거를, 최신 탑티어 논문에서 수집·검증하여
바로 구현 가능한 형태로 정리하는 것이다.

너는 **출처 없이 주장하지 않는다.** 모든 baseline 설계 권고는 실제 논문(제목/저자/연도/venue/링크)에
근거해야 하며, venue와 연도를 검증한 것만 보고한다.

---

## 2) 우리 시스템 맥락 (이 과제가 비교하려는 대상)

**도메인**: explainable chart QA. 입력 = (차트 = Vega-Lite spec + data rows) + (자연어 question) + (자연어 explanation).
출력 = **OpsSpec DAG** — 타입이 정해진 연산 노드들의 방향성 그래프.

- 연산(op) 어휘 예시: `filter, retrieveValue, average, sum, count, findExtremum, nth, sort, diff, pairDiff, lagDiff, add, scale, compareBool` 등.
- 각 노드: `op` + op별 인자 + `meta.nodeId` + `meta.inputs`(부모 노드 edge) + 노드 간 스칼라 참조 `"ref:nX"`.
- 이 DAG는 이후 결정론적으로 **실행**되어 값이 계산되고 차트 위에 시각적으로 설명된다 (즉, "실행 가능"해야 함).

**우리 제안 시스템 (= 비교의 기준, "ours")**: Recursive Grammar Pipeline.
1. *Inventory* (LLM 1회): explanation을 reasoning chunk로 쪼개 필요한 op task 집합 S(O) 추출.
2. *Step-Compose loop* (op마다 LLM 1회): 남은 task 중 하나를 결정론적으로 선택 → op_spec 1개 생성 →
   **결정론적 grounding/계약검증/실제 실행/스케줄링**을 매 step 사이에 끼워 다음 step의 입력으로 전달.
3. 결과: nodeId/inputs로 연결된 검증·실행된 DAG. **다수의 LLM 호출 + 단계별 결정론적 grounding** 이 핵심 특징.

**현재 baseline (너무 약하다고 판단됨)**: *single-shot* — 단일 LLM 호출로 전체 DAG를 한 번에 생성.
검증/실행/분해 없음. 이걸 대체/보강할 **더 강한 baseline 군(群)**의 설계 근거가 필요하다.

**핵심 질문**: 우리의 기여(= 명시적 분해 + 단계별 결정론적 grounding/실행)를 *분리*해서 보여주려면,
baseline은 "동분해·동그라운딩이 아니면서도 LLM 활용 자체는 강한" 설계여야 한다. 즉 baseline이 약해서
이기는 게 아니라, **분해/그라운딩 전략의 차이로 이기는** 비교가 되도록 baseline 스펙트럼을 짜야 한다.

---

## 3) 조사 목표 (Objective)

최근 3년 탑티어 논문에서 다음을 찾아 정리하라:

> "자연어 → 구조적/실행가능 출력(프로그램·플랜·논리식·DAG·툴호출 시퀀스)"을 LLM으로 생성할 때,
> 논문들이 **method 또는 baseline으로 사용한 프롬프팅/실행 패러다임**과 그 구체적 설계
> (실행 흐름, 단계 순서, LLM 호출 횟수, 검증/자기수정 루프, few-shot 구성, 제약 디코딩 등).

이를 토대로 우리 과제에 이식 가능한 **강한 baseline 후보 3~5개**를 도출한다.

---

## 4) 구체적 Research Questions (각각 논문 근거로 답할 것)

**RQ1 — 패러다임 매핑.** "NL → 구조적 출력" 생성에 쓰이는 주요 패러다임 각각을, 대표 최신 논문과 함께 정리하라.
최소한 아래를 다루되, 빠진 최신 기법이 있으면 추가하라:
- 단일 호출 계열: zero/few-shot, Chain-of-Thought, Program-of-Thought, self-consistency(다중 샘플 투표).
- 분해 계열: least-to-most, decomposed prompting, plan-and-solve, plan-then-execute, "skeleton/outline first".
- 반복/자기수정 계열: Self-Refine, Reflexion, self-debug, critic/verifier 루프, execution-guided correction.
- 에이전트/툴 계열: ReAct, tool-use / function-calling, multi-agent(역할 분담) 파이프라인.
- 구조 보장 계열: grammar/schema-constrained decoding, JSON-schema/constrained generation, semantic-parsing 전용 디코딩.
- 검색 증강 계열: retrieval-augmented few-shot / exemplar selection.

**RQ2 — 설계 변수 추출.** 위 각 패러다임에 대해 다음 축을 구체적으로 기록하라 (우리 baseline 설계에 직접 필요한 정보):
- **LLM 호출 횟수**(고정 1회 / 입력길이 비례 / 수렴까지 반복 등)와 그 결정 방식.
- **단계 순서/제어 흐름**(누가 순서를 정하나: LLM vs 결정론적 컨트롤러).
- **중간 검증/실행 사용 여부**(없음 / 스키마검증만 / 실제 실행 피드백).
- **few-shot/예시 구성**과 컨텍스트 주입 방식.
- 보고된 **장단점·실패모드·비용(토큰/지연)**.

**RQ3 — baseline 관행.** 이 논문들이 *자기 method를 돋보이게 하려고 어떤 baseline을 두었는지*,
그리고 reviewer 관점에서 "공정한 baseline"으로 인정받은 설계 요소는 무엇인지 정리하라
(예: 동일 LLM·동일 few-shot 예산·동일 컨텍스트 고정, ablation으로 분해/검증 기여 분리 등).

**RQ4 — 도메인 인접 근거.** chart QA / table reasoning / text-to-SQL / text-to-vis / visualization-by-NL /
program synthesis 등 **우리와 인접한** 과제에서, NL→구조적출력 생성/평가를 다룬 최신 탑티어 논문을 별도로 모아
(우리 과제에 가장 직접적인 선례) 정리하라.

**RQ5 — 권고 baseline 스펙트럼.** RQ1~RQ4를 종합해, 우리 과제에 이식할 **강한 baseline 3~5개**를 제안하라.
각 baseline마다: (a) 근거 논문, (b) 실행 흐름과 호출 횟수, (c) 우리 OpsSpec 과제로의 매핑,
(d) 왜 공정하면서도 강한 비교인지, (e) **즉시 쓸 수 있는 프롬프트/제어 흐름 스케치**.

---

## 5) 출처 제약 (엄격 — 위반 금지)

- **연도**: 2023년 1월 이후 출판분만 (2023, 2024, 2025, 2026). 그 이전 논문은 *배경 설명용 1줄 언급*은 가능하나
  baseline 권고의 핵심 근거로 쓰지 말 것.
- **Venue (탑티어 peer-reviewed 만)**. 아래 목록 중심으로 하고, 목록 밖이면 *왜 탑티어인지 1줄 근거*를 달 것:
  - NLP: **ACL, EMNLP, NAACL, TACL**
  - ML: **NeurIPS, ICML, ICLR**
  - AI: **AAAI, IJCAI**
  - VIS/HCI: **IEEE VIS / IEEE TVCG, CHI, UIST**
  - (데이터/DB 인접 시) **SIGMOD, VLDB, KDD** — 우리 과제 관련성이 분명할 때만.
- **제외**: arXiv-only 프리프린트(동일 내용이 위 venue에 게재 확인되면 그 게재본으로 인용), 워크샵 단독,
  블로그/튜토리얼/벤더 문서, 비-peer-reviewed 리포트.
  - 단, 특정 기법의 *원조*가 위 venue 밖(예: arXiv)일 경우, "원조는 X(연도), 우리가 인용하는 탑티어 근거는 Y(venue, 연도)"
    형태로 **탑티어 후속/적용 논문**을 근거로 제시하라.
- **검증 필수**: 각 논문의 제목·저자·**연도·venue를 실제로 확인**하고, 확인에 사용한 링크
  (ACL Anthology, OpenReview, IEEE Xplore, ACM DL, DBLP, Semantic Scholar 등)를 함께 보고하라.
  연도/venue를 확인하지 못한 항목은 "미확인"으로 명시하고 권고 근거에서 제외하라.

---

## 6) 검색 전략 (Search Strategy)

1. 패러다임별 키워드로 폭넓게 검색한 뒤, venue/연도 필터로 좁혀라. 키워드 예:
   `LLM structured generation`, `semantic parsing large language models`, `plan-and-solve prompting`,
   `decomposed prompting`, `self-refine / self-correction LLM`, `execution-guided / verifier LLM reasoning`,
   `constrained decoding JSON schema`, `text-to-SQL LLM`, `table reasoning LLM`,
   `natural language to visualization`, `chart question answering reasoning`, `program of thoughts`,
   `ReAct tool use agent`, `multi-agent decomposition reasoning`.
2. DBLP / ACL Anthology / OpenReview에서 **venue+연도로 직접 필터**해 게재 사실을 확정하라.
3. 핵심 논문을 찾으면 그 논문이 비교한 **baseline 절(section)** 과 **ablation**을 반드시 읽어 RQ2/RQ3를 채워라.
4. 인접 과제(text-to-SQL, table/chart reasoning, NL2VIS)는 별도 패스로 한 번 더 훑어 RQ4를 채워라.

---

## 7) 사실성/검증 요건 (Anti-hallucination)

- **논문을 지어내지 말 것.** 제목/저자/연도/venue가 검증되지 않으면 보고하지 말 것.
- 각 핵심 주장마다 1개 이상 구체적 출처를 붙이고, 가능하면 해당 논문의 정확한 기여 문장/수치를 인용하라.
- 동일 기법에 대해 상충하는 설명이 있으면 양쪽을 제시하고 어느 게 게재본 기준인지 표시하라.
- 마지막에 **자기 점검**: (a) 3년·탑티어 제약을 어긴 항목이 없는가, (b) 권고 baseline마다 검증된 근거가 있는가,
  (c) 빠뜨린 주요 패러다임/인접 과제는 없는가 — 미흡하면 한 번 더 검색하라.

---

## 8) 산출물 형식 (Deliverable — 한국어로 작성)

다음 구조의 보고서를 작성하라:

### A. Executive Summary
- 핵심 결론 5~8줄: 어떤 baseline 스펙트럼을 둬야 우리 DAG 시스템과 공정·강하게 비교되는가.

### B. 패러다임 매핑 표 (RQ1·RQ2)
| 패러다임 | 대표 논문 (제목·저자·venue·연도·링크) | 호출 횟수 | 단계 순서 제어 | 중간 검증/실행 | few-shot | 장단점·실패모드 |
|---|---|---|---|---|---|---|

### C. 인접 과제 선례 (RQ4)
- text-to-SQL / table·chart reasoning / NL2VIS 등에서의 최신 탑티어 선례와 그들의 baseline 관행 요약.

### D. 공정 비교 원칙 (RQ3)
- reviewer가 인정할 fairness 조건 목록(동일 LLM·동일 few-shot 예산·동일 chart context·동일 op contract,
  분해/검증 기여 분리용 ablation 등). 각 항목에 근거 논문.

### E. 권고 Baseline 3~5개 (RQ5) — *가장 중요*
각 baseline마다:
1. 이름 + 한 줄 정의 + 근거 논문.
2. 실행 흐름(의사코드/순서도)과 **LLM 호출 횟수**.
3. 우리 OpsSpec 과제로의 매핑(입력으로 무엇을 주고, 출력 스키마는 어떻게 강제하나).
4. 왜 공정하면서 강한가 / 우리 시스템과 무엇이 달라서 기여가 분리되는가.
5. **즉시 사용 가능한 프롬프트 스케치 + 제어 흐름**(우리 op 어휘/스키마에 맞춰 구체적으로).
6. 예상 비용(호출 수·토큰·지연)과 구현 난이도.

### F. 우선순위 / 구현 로드맵
- 권고 baseline을 "구현 가치 × 비용"으로 정렬하고, 먼저 붙일 1~2개를 추천.

### G. 참고문헌
- 보고서에서 인용한 모든 논문을 [제목 · 저자 · venue · 연도 · 링크]로 나열. 검증 출처 포함.

---

## 9) 톤/분량
- 연구자(VIS/HCI) 대상. 추측이 아니라 **출처에 근거한 설계 의사결정**을 제공하라.
- 장황한 일반론 금지. 우리 과제(NL→실행가능 op DAG)에 바로 쓸 수 있는 구체성을 우선하라.
