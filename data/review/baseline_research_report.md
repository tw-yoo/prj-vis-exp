# Baseline 설계 연구 보고서 — "NL explanation → 실행 가능 operation-spec DAG" 강한 비교 baseline

> deep-research(5 angle, 25 소스 fetch, 121 claim 추출, top-25 적대적 검증 → 17 confirmed) 결과를
> 직접 합성. synthesis 단계가 세션 한도로 중단되어, 검증된 claim + fetch 단계 본문 추출 claim을
> 사람이 정리함. 각 논문은 본문(method/baseline/ablation) 인용 근거를 가짐.
>
> ⚠️ 검증 메모: 적대적 검증의 일부 표는 세션 한도로 "abstain(기권)" 처리되어 *반증된 게 아니라 미검증*임.
> 해당 항목(self-correction 관련)은 원논문(ICLR 2024) 인용으로 보존하되 "워크플로 재검증 미완"으로 표시.

---

## A. Executive Summary

1. single-shot은 baseline으로 약하다는 판단이 옳다. 최신 탑티어 논문들은 NL→구조적출력 과제에서
   **분해(decompose) · 계획(plan) · 실행피드백(execution feedback)** 중 최소 하나를 baseline에도 넣는 게 표준이다.
2. 우리 시스템의 기여(= 명시적 분해 + **결정론적 컨트롤러** + **단계별 실행 grounding** + 스케줄)는,
   각 축을 하나씩 끄거나 다른 방식으로 구현한 **강한 baseline 스펙트럼**으로 분리 검증해야 reviewer를 설득한다.
3. 우리 과제에 가장 직결되는 두 선례:
   - **LLMCompiler (ICML 2024)** — LLM이 *전체 DAG(op+args+의존성)를 1회 계획* → 결정론적 스케줄러가 위상정렬 실행.
     → "전체계획-후실행" vs 우리 "단계별 grounding" 을 분리하는 가장 깨끗한 강baseline.
   - **Chain-of-Table (ICLR 2024)** — 결정론적 컨트롤러가 매 스텝 두 LLM 호출(다음 op 선택 + 인자 생성) 후
     *실제 실행해 중간 결과를 다음 스텝 입력으로 전달*. → 우리 step-compose loop와 거의 동형. baseline보다는
     **자매 기법/상한선**으로 포지셔닝하는 게 정확하다.
4. **실행 피드백 없는** 순수 self-refine은 강baseline으로 쓰면 안 된다: 최신 연구가 intrinsic self-correction이
   추론 정확도를 *떨어뜨린다*고 보고(ICLR 2024). 강한 self-correction baseline은 반드시 **실제 실행 피드백**을 써야 한다
   — 다행히 우리는 결정론적 executor를 이미 갖고 있어 공정·강한 self-debug baseline을 싸게 만들 수 있다.
5. 권고: **B2(전체계획-후실행, LLMCompiler류)** 와 **B1(single-shot + 실행기반 self-debug, Self-Debugging류)** 을
   먼저 붙인다. 둘 다 **우리 executor를 재사용** → 구현 저비용 + 명백히 강함 + 우리 기여를 양쪽에서 협공.
6. 공정성은 "동일 LLM·동일 few-shot 풀·동일 토큰예산·동일 chart_context/op_contract 주입 + 분해/grounding 만 변수"
   로 확보한다 (L2M·DecomP·DIN-SQL의 ablation 설계 관행).

---

## B. 패러다임 매핑 표

| 패러다임 / 대표논문 (venue, 연도) | LLM 호출 수 | 순서 제어 주체 | 중간 검증/실행 | few-shot | 핵심 장단점 |
|---|---|---|---|---|---|
| **Single-shot** (현재 baseline) | 1 | — | 없음 | few-shot | 가장 약함. 복잡 DAG에서 구조·참조 오류. **현재 우리 baseline** |
| **Few-shot CoT (+ self-consistency)** | 1 (k-vote면 k) | LLM(암묵) | 없음 | few-shot/CoT | 싸고 강한 *바닥선*. 구조 보장 없음 |
| **Least-to-Most** (ICLR 2023) | 1 + k(서브문제수) | **LLM**이 분해·순서 | 없음(프롬프트 누적만) | few-shot 양단계 | 분해를 LLM이 함. chain-state=프롬프트 concat. 우리 Inventory+Step-Compose의 *비결정론* 버전 |
| **Decomposed Prompting / DecomP** (ICLR 2023) | 다중(서브태스크별) | **결정론적 컨트롤러** + decomposer LLM | 핸들러가 symbolic 가능 | 서브태스크별 분리 프롬프트 | 핸들러 교체형(LLM/계산기/검색기). CoT·L2M 대비 우위가 *분리 프롬프트* 자체에서 옴(통제 ablation) |
| **ReAct** (ICLR 2023) | 수렴까지 반복 | LLM(thought→action) | **외부 도구/환경** 실행 | few-shot | 추론+행동 인터리브. 툴 호출 시퀀스. 순서를 LLM이 잡음 |
| **Plan-then-Execute / LLMCompiler** (ICML 2024) | **1(계획) + 실행** | **LLM 1회 계획 → 결정론적 스케줄러** | 결정론적 실행(병렬) | few-shot 플래너 | **전체 DAG를 한 번에 계획** 후 위상정렬 실행. 우리와 가장 대비되는 강baseline |
| **Chain-of-Table** (ICLR 2024) | 스텝당 2(plan+args), 반복 | **결정론적 컨트롤러** | **매 스텝 실제 실행→피드백** | few-shot | 고정 op어휘에서 다음 op 선택+인자→실행→다음 입력. **우리 step-compose와 거의 동형**(→자매/상한) |
| **Self-Debugging** (ICLR 2024) | 1 + N턴(≤10, 보통 ≤3) | 결정론적 루프 | **실행/테스트 피드백**(없이도 rubber-duck 가능) | few-shot | 생성→설명→피드백 반복. Spider는 1턴이면 충분(+0.1%). 실행피드백판이 강함 |
| **LeDex** (NeurIPS 2024) | 1 + 정제턴 | 결정론적 | **실행검증으로 trajectory 필터** | explain-then-refine | 설명후정제 + 실행검증 필터. self-debug의 학습/정제판 |
| **DIN-SQL** (NeurIPS 2023) | 고정 4모듈 | **결정론적 순서** | 자기수정 모듈 | 모듈별 few-shot | schema linking→분류·분해→생성→자기수정. text-to-SQL 강baseline 정석 |
| **CRITIC** (ICLR 2024) | n회(QA 3, 코드 4) | verify→correct 루프 | **외부 도구** 검증이 핵심 | few-shot | *도구 없는* 자기비평은 미미/악화(ablation 'w/o Tool') |
| **(반례) 순수 intrinsic self-correct** (ICLR 2024) | 1 + 라운드 | LLM 자기판단 | 없음 | — | 외부피드백 없으면 정확도 **하락**(GSM8K 75.9→74.7 등). 강baseline 부적합 |
| **Constrained / JSON-schema decoding** (배경) | 1(디코딩제약) | — | 스키마 보장 | — | 출력 형식만 보장. 의미 정확성은 별도. 모든 baseline에 직교 적용 가능 |

호출 수 표기: "1+k"는 입력 크기 비례 멀티콜, "1+N턴"은 수렴/예산까지 반복.

---

## C. 인접 과제 선례 (우리 과제에 가장 직접적)

- **Chain-of-Table (ICLR 2024)** — table reasoning. 고정 op 어휘에서 **DynamicPlan(다음 op 선택)+GenerateArgs(인자)**
  를 결정론적 컨트롤러가 구동하고 **실제로 테이블을 변형 실행**해 다음 스텝 입력으로 전달, `[END]`까지 반복.
  → 우리 OpsSpec step-compose loop와 구조가 거의 같음. **baseline이 아니라 자매기법**으로 비교/포지셔닝 권장.
- **LLMCompiler (ICML 2024)** — function calling. **LLM 플래너가 op+args+노드간 의존성으로 된 DAG를 1회 생성**,
  Task Fetching Unit이 위상정렬·병렬 디스패치, Executor가 실행. → 우리 출력(OpsSpec DAG)과 형태가 동일.
  "전체-한번에-계획" baseline의 정석.
- **DIN-SQL (NeurIPS 2023)** / **DEA-SQL(arXiv 2402.10671, venue 확인필요)** / **MAC-SQL(COLING 2025)** — text-to-SQL.
  공통적으로 **고정 순서 다단계 분해 + 자기수정/실행수정** 모듈로 single-shot을 이긴다. 강baseline 설계의 표준 레시피.
- **ChartGPT (IEEE TVCG 2024)** — NL→차트 스펙(NL2VIS). 생성을 **6단계 step-by-step 파이프라인**으로 분해해
  매 실행마다 단일 서브태스크만 추론. → 우리와 같은 VIS 도메인에서 분해형이 통한다는 직접 선례.
- **NL2VIS 실증 (SIGMOD/PACMMOD 2024)** — 충분한 few-shot이면 inference-only LLM이 fine-tuned 모델을 능가.
  → baseline 스펙트럼을 *약한 비-LLM*이 아니라 **강한 LLM 변형**으로 구성해야 한다는 근거.
- **NL2VIS 프롬프트전략 평가 (IEEE TVCG 2025)** — Zero/Few-shot, Zero-shot-CoT, Plan-and-Solve+, Auto-CoT,
  Least-to-Most, Self-Refine, Self-Consistency 8종을 NL→Vega-Lite에서 직접 비교. → baseline 후보군 카탈로그.

---

## D. 공정 비교 원칙 (근거 포함)

reviewer가 "공정한 baseline"으로 인정하는 통제 설계 (L2M·DecomP·DIN-SQL 관행):

1. **동일 LLM·동일 디코딩(temp=0)**: 모든 baseline과 ours가 같은 모델·설정. (우리 StructuredLLMClient 기본과 일치)
2. **동일 few-shot 예시 풀, 분해만 제거**: L2M 논문은 CoT baseline에 *동일한 command-mapping 예시*를 주고
   "분해"만 빼서 통제했고, 프롬프트 **토큰 예산을 맞추려 CoT 예시를 추가**했다(인용: L2M §SCAN).
   → 비분해 baseline에도 같은 예시·같은 길이 예산을 주어 "분해 효과"만 분리.
3. **동일 컨텍스트 주입**: chart_context, op_contract(allowed_ops·필드규칙), rows_preview를 모든 조건에 동일 주입.
4. **분해 vs grounding 기여 분리 ablation**: DIN-SQL/DEA-SQL은 모듈 제거 시 정확도 하락폭으로 각 기여를 정량화.
   → 우리도 "ours에서 단계별 실행 grounding만 OFF"한 내부 ablation을 두면 B3와 정합.
5. **비용 동시 보고**: 호출 수·토큰·지연(latency)을 baseline별로 보고(Self-Debugging은 턴 예산·실제 종료턴 보고).
   → 강함을 "비용 대비"로 비교해 공정성 확보.
6. **통제 메시지**: DecomP는 CoT/L2M이 *같은 추론 절차*를 한 체인으로 펼친 경우에도 분리 프롬프트가 이긴다고
   보고 → "알고리즘 차이가 아니라 분해/grounding 전략 차이"임을 보이는 게 핵심 (우리 주장과 동일 논리).

---

## E. 권고 Baseline (★ 가장 중요)

> 모두 우리 nlp_server 스택(FastAPI + StructuredLLMClient temp=0 + JSON 스키마 강제 + op_contract 주입 +
> **기존 결정론적 executor/validator**)으로 구현 가능. 특히 B1·B2는 우리 executor를 그대로 재사용.

### B1 — Single-shot + 실행기반 Self-Debug  *(근거: Self-Debugging, ICLR 2024 / LeDex, NeurIPS 2024)*
- **흐름**: ① 1회 호출로 전체 DAG 생성 → ② 우리 executor로 실행 → ③ 실패(스키마/참조/NaN/실행오류) 시
  오류 메시지 + 현재 spec을 프롬프트에 넣어 재생성 → ②~③ 최대 N턴(권장 N=2~3; 논문상 대부분 ≤3턴 수렴).
- **호출 수**: 1 + N (보통 2~4회).
- **우리 과제 매핑**: 출력 스키마 = 기존 OpsSpec JSON 스키마 강제. 피드백 = `validate_operation` 위반 메시지 +
  executor의 NaN/실행오류(이미 pipeline에 존재) 재사용.
- **기여 분리**: "분해 없이 사후수정만"으로도 어디까지 가나 → 우리의 *사전 분해*가 사후수정 대비 얼마나 더 버는지 분리.
- **공정·강함**: 실행 피드백을 쓰므로 intrinsic self-refine의 함정(ICLR 2024 하락)을 피함. executor 재사용으로 공정.
- **프롬프트 스케치**: system="single-shot OpsSpec generator" + user(질문/설명/chart_context/op_contract/few-shot)
  → 실패 시 user에 `[Execution feedback] nodeId=n3 produced NaN (empty slice)…[Fix and regenerate full JSON]` 추가.
- **비용/난이도**: 낮음(★). 기존 single-shot 엔드포인트 + executor 루프만 추가.

### B2 — Plan-then-Execute 전체-DAG  *(근거: LLMCompiler, ICML 2024)*
- **흐름**: ① **1회 호출로 전체 DAG(op+args+meta.inputs 의존성)를 계획** → ② 우리 스케줄러가 위상정렬 →
  ③ executor가 결정론적 실행 → (옵션) 실행 실패 시 B1식 1회 repair.
- **호출 수**: 1 (+옵션 1).
- **우리 과제 매핑**: B2의 출력은 사실상 우리 최종 산출과 동형(그룹맵+inputs). 차이는 **계획이 단계증분이 아니라 일괄**.
- **기여 분리**: 가장 깨끗한 대비 — "전체를 한 번에 계획" vs 우리 "한 스텝씩 실행 grounding 후 다음 계획".
  즉 *단계별 grounding의 가치*를 정조준.
- **공정·강함**: 출력이 결정론적으로 실행/스케줄되므로 raw LLM이 아님 → 강함. 우리 스케줄러/executor 재사용 → 공정.
- **프롬프트 스케치**: system="DAG planner: emit complete op DAG with nodeId/inputs in one pass" + 동일 컨텍스트.
- **비용/난이도**: 낮음(★). single-shot 프롬프트를 "의존성 명시 DAG" 형태로 강조 + 기존 schedule/execute 연결.

### B3 — 반복 LLM 분해 (실행 grounding 없음)  *(근거: Least-to-Most, ICLR 2023 / DecomP, ICLR 2023)*
- **흐름**: ① 1회 호출로 서브태스크(op task) 순서 분해 → ② 스텝마다 1회 호출로 op 1개 생성, 단 **이전 스텝의
  (서브질문, 생성 op)만 프롬프트에 누적**(우리처럼 실제 실행 결과를 넣지 않음), 스키마 검증만 통과.
- **호출 수**: 1 + k(op 수).
- **우리 과제 매핑**: Inventory+Step-Compose의 **결정론적 컨트롤러·실행 grounding을 뺀 쌍둥이**.
  순서도 LLM이 잡고, chain-state는 실행값이 아니라 프롬프트 텍스트.
- **기여 분리**: 우리 핵심 주장(결정론 컨트롤러 + 실행된 chain-state) 을 정조준. 내부 ablation("ours − grounding")과 매칭.
- **공정·강함**: 분해·멀티콜을 동일하게 쓰므로 "분해는 같고 grounding만 다른" 통제. 가장 설득력 있는 head-to-head.
- **프롬프트 스케치**: stage1 decomposer(op task 리스트) → stageN solver(이전 (taskmention, op_json) 누적 + 현재 task).
- **비용/난이도**: 중(★★). 우리 step-compose 프롬프트를 재활용하되 grounding/executor 연결을 끊은 변형.

### (옵션) B0′ — Few-shot CoT + Self-Consistency k-vote  *(바닥선; 근거: NL2VIS prompt-eval, TVCG 2025)*
- 1단계 k샘플 → 스키마검증 통과분 중 다수결/최빈 DAG. 호출 k회. 구조 없이 "샘플 스케일"만으로 어디까지 가나.
- 난이도 낮음(★). single-shot 재사용 + k회 샘플 + 투표.

> **포지셔닝 메모**: **Chain-of-Table(ICLR 2024)** 는 우리와 거의 동형이라 baseline보다 **related work / 상한선
> 비교 대상**으로 두는 게 정확하다. baseline으로 쓰면 "우리가 우리를 이긴다"는 약한 그림이 된다.

---

## F. 우선순위 / 구현 로드맵

1. **먼저(저비용·고효과): B2 + B1.** 둘 다 기존 single-shot 엔드포인트 + 기존 executor/scheduler 재사용.
   - B2 = 우리 산출과 동형(일괄계획) → "단계별 grounding" 기여 분리.
   - B1 = single-shot + 실행수정 → "사전 분해" 기여 분리. 둘이 우리 기여를 양쪽에서 협공.
2. **다음: B3.** 우리 step-compose 프롬프트의 grounding-off 변형. 핵심 head-to-head(컨트롤러+실행 chain-state) 증거.
3. **옵션: B0′(k-vote).** 바닥선/스케일 비교.
4. **ablation 동시 설계**: ours에서 "단계별 실행 grounding OFF"를 켜 B3와 정합, "분해 OFF"를 켜 B1과 정합.
5. **공정성 체크리스트 고정**(§D): 동일 LLM/temp, 동일 few-shot 풀·토큰예산, 동일 chart_context·op_contract,
   호출수·토큰·지연 보고.
6. **Chain-of-Table** 은 related work 비교(자매기법)로 별도 칸.

구현상 우리 강점: B1·B2의 "실행 피드백/스케줄"은 **이미 있는 executor/scheduler를 재사용**하므로, baseline을
공정하게(=우리와 같은 실행기) 만들면서도 추가 구현이 작다. 엔드포인트는 기존
`/generate_grammar_baseline_single_shot` 를 mode 파라미터(plan_execute / self_debug / decompose)로 확장 권장.

---

## G. 참고문헌 (검증 상태 포함)

핵심 (탑티어·2023+, 본문 인용 확보):
1. Chain-of-Table: Evolving Tables in the Reasoning Chain for Table Understanding — **ICLR 2024** — https://openreview.net/pdf?id=4L0xnS4GQM (DynamicPlan+GenerateArgs+실행 루프)
2. An LLM Compiler for Parallel Function Calling (LLMCompiler) — **ICML 2024 (PMLR v235)** — https://proceedings.mlr.press/v235/kim24y.html (Planner→DAG, Task Fetching Unit, Executor)
3. Teaching Large Language Models to Self-Debug — **ICLR 2024** — https://proceedings.iclr.cc/paper_files/paper/2024/file/2460396f2d0d421885997dd1612ac56b-Paper-Conference.pdf (Gen/Explain/Feedback 루프, 턴예산)
4. Decomposed Prompting (DecomP) — **ICLR 2023** — https://openreview.net/pdf?id=_nGgzQjzaRy (decomposer LLM + imperative controller, 핸들러)
5. Least-to-Most Prompting — **ICLR 2023** (원조 arXiv 2205.10625, 2022) — https://arxiv.org/pdf/2205.10625 (2단계 분해→순차해결, 공정성 통제)
6. ReAct: Synergizing Reasoning and Acting — **ICLR 2023** — https://aclanthology.org/2023.acl-long.147/ 외 (thought/action 인터리브, 외부도구)  *(주: ReAct 정본은 ICLR 2023; 해당 ACL 링크는 보조)*
7. DIN-SQL: Decomposed In-Context Learning of Text-to-SQL — **NeurIPS 2023** — https://neurips.cc/virtual/2023/poster/70114 (고정 4모듈 분해+자기수정)
8. ChartGPT: NL→차트 step-by-step 생성 — **IEEE TVCG 2024** — https://ieeevis.org/year/2024/program/paper_v-tvcg-20243368621.html (6단계 분해)
9. LeDex: Learning to Self-Debug and Explain — **NeurIPS 2024** — https://neurips.cc/virtual/2024/poster/94367 (explain-then-refine + 실행검증 필터)
10. Self-Refine: Iterative Refinement with Self-Feedback — **NeurIPS 2023** — https://proceedings.neurips.cc/paper_files/paper/2023/hash/91edff07232fb1b55a505a9e9f6c0ff3-Abstract-Conference.html

caveat (강baseline 설계 시 *피해야 할* 함정 근거; 워크플로 재검증은 세션한도로 미완 → 원논문 인용):
11. Large Language Models Cannot Self-Correct Reasoning Yet — **ICLR 2024** — https://proceedings.iclr.cc/paper_files/paper/2024/file/8b4add8b0aa8749d80a34ca5d941c355-Paper-Conference.pdf (외부피드백 없는 self-correct는 정확도 하락; oracle-gated 이득은 비현실)
12. CRITIC: LLMs Can Self-Correct with Tool-Interactive Critiquing — **ICLR 2024** — https://proceedings.iclr.cc/paper_files/paper/2024/hash/fef126561bbf9d4467dbb8d27334b8fe-Abstract-Conference.html (도구 없는 자기비평은 미미/악화)

인접·보조:
13. NL2VIS 프롬프트전략 평가(8종) — **IEEE TVCG 2025** — (Zero/Few/CoT/PS+/Auto-CoT/L2M/Self-Refine/Self-Consistency)
14. NL2VIS 실증연구 — **SIGMOD/PACMMOD 2024** — https://dl.acm.org/doi/10.1145/3654992 (few-shot LLM이 fine-tuned 능가)
15. MAC-SQL: Multi-Agent text-to-SQL — **COLING 2025** — https://aclanthology.org/2025.coling-main.36/ (Selector/Decomposer/Refiner)  *(COLING=주요 NLP 학회, 단 위 핵심목록 밖)*

검증·연도 확인 필요(핵심 근거에서 제외, 보조로만):
- DEA-SQL — https://arxiv.org/html/2402.10671v1 — **venue 미확인**(ACL 2024 Findings 추정). 핵심 근거로 쓰지 않음.
- JSONSchemaBench (constrained decoding 벤치) — arXiv 2501.10868 — **arXiv-only** → 배경 언급만.
- Modularized NL2SQL survey — arXiv — **survey/arXiv** → 배경 언급만.

---

### 검증 한계 / 후속 정밀화 메모
- deep-research가 verify(top-25 중 17 confirmed)까지 마쳤고 synthesis만 세션한도로 중단됨.
- "self-correction 하락"(11·12) 관련 claim은 검증 표가 abstain되어 **워크플로 독립검증 미완** → 원논문 인용으로 보존.
- B1·B2를 먼저 구현하기로 하면, 그 시점에 핵심 3편(Chain-of-Table, LLMCompiler, Self-Debugging)의 본문
  pseudo-code/ablation 수치를 다시 1차 출처에서 정밀 인용해 논문 Related Work/Experiment 절에 직접 반영 권장.
