# Hackathon Run Skill Evaluation Lab

本目录是一套可重复运行的 **skill 专业测评实验室**，对
`hackathon-run` v1.5+ skill pack 做执行型跑分、契约检查和 A/B 对比。

## 测评对象

- 根级 skill：`hackathon-run`
- 内置 15 个子 skill：`idea-clarify`、`prize-strategy`、`scope-knife`、
  `time-box`、`stack-picker`、`fast-verify`、`demo-coach`、
  `demo-rehearsal`、`judge-sim`、`ship-pack`、`recovery-runbook`、
  `pivot`、`retro`、`decision-log`、`team-roster`
- CLI：`node dist/cli/index.js`

## 方法论来源

评分标准综合了以下公开方法论：

| 来源                                                     | 借鉴内容                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| OpenAI《Testing Agent Skills Systematically with Evals》 | Outcome / Process / Style / Efficiency 四类成功标准；确定性检查 + rubric schema 评分 |
| SWE-bench / SWE-bench Verified                           | 执行结果判定优先于最终文本；pass@1；不搞“差不多也算过”                               |
| Claude Caliper / skill-eval                              | 行为断言、pass rate、重复运行标准差、盲评 A/B                                        |
| Coder Eval                                               | 0-1 加权标准、skill_triggered 触发检查、A/B 层                                       |
| Future AGI《Claude Skills Evaluation Deep Dive》         | 分派正确性、内部轨迹、输出集成三份契约分别评分                                       |

## 目录结构

```text
skill-eval-lab/
├── README.md
├── rubric.md                 # 评分标准 v2.0（完整细则）
├── rubric.schema.json        # 机器可读评分标准
├── llm-judge-prompt.md       # LLM judge 模板
├── scenarios/                # 6 个虚拟项目场景
├── harness.mjs               # 跑分 harness
├── judge.json                # 定性质量评分（可由人/LLM 填入）
└── results/                  # 运行产物与最终报告
```

## 如何运行

```bash
node skill-eval-lab/harness.mjs --scenarios skill-eval-lab/scenarios --out skill-eval-lab/results
```

从源码运行时先构建共享模块：

```bash
npm run build
npm run test:skill-eval
```

CI uses the same harness as a grade gate:

```bash
npm run test:skill-eval
```

该门禁要求 grade A、零 critical failure、零 P1 finding。`results/` 下的
完整运行目录保持未跟踪，CI 只上传 `report.md`、`final.json` 和
`runs/aggregate.json`。

环境要求：

- Node.js 20.9+
- Python 3.11+
- 共享 resolver 的顺序为 `PYTHON` → `python3` → `python` → Windows
  `py -3`。可用 `PYTHON` 指定绝对路径；CLI 的 `doctor`、`flow` 与本
  harness 会选到同一个解释器。

## 报告输出

每次运行会生成：

- `runs/<scenario>/run-<n>/`：完整虚拟项目、状态文件、命令输出
- `runs/aggregate.json`：机器可读的断言与评分结果
- `report.md`：专业评分报告
- `final.json`：最终分数、等级与 CI gate

GitHub Actions 会把上述三份汇总资产作为 `quality-reports` artifact
上传；路由 golden set 同时生成 `routing-report.json`。
