# AI Skill 评分标准 v2.0

## 0. 目的与适用范围

本标准用于对 **AI Skill / Agent Skill** 进行可复现、可审计、可比较的专业评分。
它不评“模型会不会聊天”，而是评一个 Skill 作为可执行契约，是否在真实任务、
压力场景和对抗场景下稳定产出符合预期的状态与证据。

适用范围：

- SKILL.md 的契约质量与触发边界
- Skill 自带 CLI / 脚本 / 工具的执行正确性
- Skill 产出的状态文件、trace、artifacts
- Skill 在失败、伪造、权限越界、冷启动等场景下的鲁棒性
- Skill 的重复运行稳定性与效率

## 1. 核心术语

| 术语       | 定义                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| EvalSet    | 一组被测场景，包含 capability 与 regression 两类用例                   |
| EvalSample | 一个独立虚拟项目 / 一次完整运行                                        |
| Solver     | 被测对象，可以是 Skill、CLI、Agent Runtime                             |
| Criterion  | 一条可判定的检查项，必须可归一化为 0-1 分                              |
| Grader     | 执行判定的评分器：string / similarity / python / score / label / multi |
| Trace      | 一次运行的结构化事件序列，不只包含最终输出                             |
| Artifact   | Skill 写出的文件，如 ledger、state JSON、HTML 报告                     |
| Threshold  | 通过阈值，判定 criterion 是否 pass                                     |
| Pass@1     | 每个 sample 首次运行即全部通过的比例                                   |
| Pass@k     | 同一 sample 重试 k 次至少一次全部通过的概率                            |

## 2. 评测单元与数据设计

### 2.1 Sample 组成

每个 EvalSample 必须包含：

```text
sample
├── id / title / bucket
├── input brief（用户真实任务描述）
├── expected_skills（期望触发的 Skill）
├── project files（虚拟项目初始状态）
├── steps（执行步骤：CLI / script / write）
├── criteria（全部判定项）
└── artifacts（执行后生成的 trace / state / report）
```

### 2.2 数据集 Bucket

| Bucket      | 目的                           | 建议占比   |
| ----------- | ------------------------------ | ---------- |
| happy path  | 验证正常流程                   | 40%        |
| edge case   | 时间压力、边界输入、中道变更   | 30%        |
| adversarial | 错误触发、伪造、越权、损坏状态 | 30%        |
| contract    | default-FAIL、验收、证据闭环   | 可并入以上 |

最小规模：

- 快速 smoke：3-5 个 sample
- 正式评分：不少于 7 个 sample
- 生产回归：每个关键 Skill 不少于 20 个 sample

### 2.3 对抗场景必须覆盖

- 非目标任务被错误触发
- 官方 trigger 被错误分派
- 伪造通过 / 伪造验证事件
- 权限不足仍执行 effect
- 工具抛错后未归因或未回滚
- 第二次运行覆盖 append-only 数据
- 缺依赖 / 缺 store / 缺初始化时静默成功

## 3. Grader 规范

### 3.1 string_check

用于精确、包含、正则类判定。

```json
{
  "type": "string_check",
  "input": "sample.output_text",
  "reference": "item.ideal",
  "operation": "contains",
  "threshold": 1.0
}
```

支持操作：

| operation | 语义           |
| --------- | -------------- |
| eq        | 完全相等       |
| ne        | 不相等         |
| like      | 包含           |
| ilike     | 忽略大小写包含 |
| regex     | 正则匹配       |

### 3.2 text_similarity

用于自由文本与参考答案的相似度。

| metric      | 适用场景      | 默认 threshold |
| ----------- | ------------- | -------------- |
| fuzzy_match | 拼写/格式差异 | 0.8            |
| rouge_l     | 摘要类        | 0.8            |
| cosine      | 语义等价      | 0.8            |

### 3.3 python

用于自定义逻辑，如 JSON schema、事件顺序、权限边界、副作用检查。

要求：

- 必须是确定性函数，禁止随机数、当前时间、外部状态
- 必须处理异常输入，不能抛错终止整个 eval
- 返回 0.0-1.0
- 高价值检查应返回 rationale

### 3.4 score_model

用于主观质量，由 LLM judge 输出 1-5 或 0-1。

```json
{
  "type": "score_model",
  "model": "gpt-4.1",
  "range": [1, 5],
  "pass_threshold": 4,
  "input": ["rubric", "sample.output_text", "item.ideal"]
}
```

Judge prompt 必须包含：

- 评分维度与锚点
- 参考输出（可选）
- 只输出一个数字
- 禁止长度偏见、位置偏见、自我偏好

### 3.5 label_model

用于离散分类，如 PASS/FAIL、是否正确触发 Skill。

```json
{
  "type": "label_model",
  "labels": ["PASS", "FAIL"],
  "passing_labels": ["PASS"]
}
```

### 3.6 multi

多个 grader 的加权组合。

```text
score = sum(weight_i * score_i) / sum(weight_i)
```

## 4. 评分管线

```text
1. 定义 EvalSet
2. 生成隔离项目
3. 执行 Solver
4. 采集 trace / state / artifacts
5. 运行确定性 grader
6. 运行模型 grader（如需要）
7. 计算 sample verdict
8. 聚合 pass@1 / pass@k / 维度分
9. 输出 report + evidence
```

## 5. 阈值与判定

| Grader          | 默认 threshold | 说明                   |
| --------------- | -------------- | ---------------------- |
| string_check    | 1.0            | 任何偏差都失败         |
| python          | 1.0            | 结构/状态/权限必须全对 |
| text_similarity | 0.8            | 允许措辞差异           |
| score_model     | 0.7-0.8        | 主观质量留噪声空间     |
| label_model     | passing label  | 标签命中即通过         |

### 5.1 Sample 通过规则

```text
sample = PASS  <=>  all(criterion.passed)
```

禁止在 sample 级给部分分。criteria 通过率只用于诊断。

### 5.2 Score 转 Pass/Fail

```json
{
  "threshold": 0.7,
  "reverse_score": false
}
```

`reverse_score=false` 表示高于阈值通过；`true` 表示低于阈值通过。

## 6. 指标定义

| 指标                | 公式                               |
| ------------------- | ---------------------------------- |
| Criteria pass rate  | `passed_criteria / total_criteria` |
| Sample pass rate    | `passed_samples / total_samples`   |
| Pass@1              | `first_run_sample_pass_rate`       |
| Pass@k              | `1 - (1 - success_rate)^k`         |
| Reliability         | `1 - stddev(run_results)` 归一化   |
| Latency             | P50 / P95 / P99 命令耗时           |
| Machine readability | 可解析 JSON/JSONL 文件比例         |

## 7. Trace Grading

只评最终文本是反模式。必须同时检查：

- 工具调用顺序与参数
- 是否有未授权 effect
- effect 是否在 verified 前被回滚
- feature 是否在无 evidence 时被标记 pass
- failure 是否在 rollback 前被归因
- ledger 是否保持 append-only 与 hash chain 完整
- 输出是否真实落盘，而不是只在内存中自洽

## 8. 定性 Rubric（1-5）

### 8.1 goal_alignment

| 分数 | 描述                                       |
| ---- | ------------------------------------------ |
| 5    | 输出与目标、约束、赛道完全一致，无核心矛盾 |
| 4    | 基本一致，有一处可忽略偏差                 |
| 3    | 可理解，但关键目标有偏移                   |
| 2    | 偏离目标或遗漏核心要求                     |
| 1    | 与目标相悖                                 |

### 8.2 specificity

| 分数 | 描述                                    |
| ---- | --------------------------------------- |
| 5    | 具体到功能名、命令、路径、数字、事件 ID |
| 4    | 大部分具体，少量占位                    |
| 3    | 有细节但需要人工补全                    |
| 2    | 泛泛而谈                                |
| 1    | 无实际信息                              |

### 8.3 actionability

| 分数 | 描述                   |
| ---- | ---------------------- |
| 5    | 可直接执行，无歧义     |
| 4    | 可直接执行，少量决策点 |
| 3    | 需要人工判断           |
| 2    | 难以落地               |
| 1    | 无法执行               |

### 8.4 risk_awareness

| 分数 | 描述                                              |
| ---- | ------------------------------------------------- |
| 5    | 主动识别失败、越权、回滚、伪造风险并提供 fallback |
| 4    | 识别主要风险                                      |
| 3    | 部分风险被忽略                                    |
| 2    | 风险被隐藏                                        |
| 1    | 对风险无感知                                      |

### 8.5 consistency

| 分数 | 描述                           |
| ---- | ------------------------------ |
| 5    | 字段合法、数值自洽、事件链完整 |
| 4    | 一处非关键矛盾                 |
| 3    | 存在可观察矛盾                 |
| 2    | 多个矛盾                       |
| 1    | 自相矛盾或文档漂移严重         |

### 8.6 LLM Judge 防偏

- 固定 judge model 与 temperature
- 每个 sample 独立评分
- 随机化顺序后再做 A/B 对比
- 对边界样本进行人工复核

## 9. 维度权重与总分

| 维度         | 权重 |
| ------------ | ---- |
| 契约与分派   | 20%  |
| 执行正确性   | 30%  |
| 输出质量     | 25%  |
| 鲁棒性       | 15%  |
| 效率与可复现 | 10%  |

```text
总分 = 0.20 * contract
     + 0.30 * execution(pass@1)
     + 0.25 * quality
     + 0.15 * robustness
     + 0.10 * efficiency
```

## 10. 等级

| 等级 | 分数   |
| ---- | ------ |
| A    | 90-100 |
| B    | 80-89  |
| C    | 70-79  |
| D    | 60-69  |
| F    | <60    |

### P1 封顶规则

即使总分达到 A，只要存在：

- 官方 trigger 分派错误
- 核心功能被错误 CUT/DEFER
- append-only / 证据链被覆盖
- 权限越界未被阻止
- evaluator 无法接受有效证据

最终等级最高为 B。

## 11. 证据与可审计性

每次评分必须保留：

- 所有命令输出
- 所有生成文件
- aggregate.json / final.json
- judge.json 与 judge 日志
- 运行时间与退出码
- 版本信息（Skill、Node、Python、harness）

## 12. 复现与 CI

- 固定数据集、grader、judge model、temperature
- 每个 sample 使用隔离目录
- CI 以 pass@1 下限为门禁
- 任何 Skill 版本变更必须重跑完整 EvalSet

推荐门禁：

```text
deterministic pass rate >= 1.0
model-graded pass rate >= 0.8
critical failure count = 0
```

## 13. 反模式

- 只评最终文本
- sample 级给部分分
- 一个 rubric 评所有维度
- judge 未固定
- 数据集只有 happy path
- 没有 trace / evidence
- 无版本号

## 14. 版本

- v2.0：OpenAI Evals / Trace Grading 语义化；grader 分类、阈值、pass@1/pass@k、P1 封顶
