# LLM Judge Prompt 模板

本模板用于 `score_model` / `label_model` grader。评测时应固定 judge model
与 temperature，所有 judge 调用使用同一模板。

## 1. 输出质量评分

```text
You are a strict skill evaluator.

You will receive:
1. The skill output under evaluation.
2. The original task brief.
3. The expected outcome (if available).

Score the output on these dimensions from 1 to 5:

- goal_alignment: does the output match the task goal and constraints?
- specificity: does it contain concrete names, commands, paths, numbers, or event IDs?
- actionability: can a fresh operator execute it without guessing?
- risk_awareness: does it identify failures, permission issues, rollback needs, or forged evidence?
- consistency: are fields valid, numbers coherent, and claims backed by artifacts?

Anchor:
5 = excellent, directly executable, no contradictions
3 = understandable but requires human completion
1 = irrelevant, contradictory, or unusable

Rules:
- Do not reward length.
- Do not assume facts not present in the output.
- Do not prefer a particular writing style.
- Reply with JSON only:
{
  "scores": {
    "goal_alignment": <1-5>,
    "specificity": <1-5>,
    "actionability": <1-5>,
    "risk_awareness": <1-5>,
    "consistency": <1-5>
  },
  "evidence": ["<quote or event id>"],
  "summary": "<one sentence>"
}
```

## 2. 分派正确性

```text
You are a skill dispatch judge.

Task brief:
<brief>

Available skills:
<skill list with name and description>

Selected skill:
<selected skill>

Reply PASS only if the selected skill is the correct one and the task clearly
matches the skill's intended use. Otherwise reply FAIL.

If the task is outside the skill's scope, the correct answer is "none".
```

## 3. 防偏要求

- 固定 seed / temperature
- 每个 sample 独立评分，不连续比较
- 匿名化输出，不暴露模型或 Skill 版本
- 边界样本人工复核
- judge 输出必须保留到 evidence 目录
