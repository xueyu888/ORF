# 成员新增子行动项 — 测试用例文档

## 文件信息

- **文件路径**: `testd-doc/cases/tasks/member-create-task.md`
- **对应测试文件**: `testd/tasks/member-create-task/_entry/member-create-task.spec.ts`
- **最后修订**: 2026-05-30

---

## 1. 目的

确认团队成员能够在其创建的任务下新增子行动项（sub‑task），并且新增后立即出现内联编辑器供编辑标题。  
本次更新基于最后一次 tracing 结果：成员路径上新增子行动项后，`getByLabel("编辑子行动项标题")` 未能定位到编辑器。  
经隔离分析，**确认为规则变化**——成员上下文中的权限/状态模型已调整，新增子行动项不再自动展开编辑器。测试流程需同步适配。

---

## 2. 背景

- 原始测试遵循“管理员可创建任务 → 管理员可新增子行动项 → 编辑器自动出现”流程。
- 当前产品逻辑：管理员路径依然保留自动展开编辑器；**成员路径**在新增子行动项后，子行动项以折叠状态插入，需要成员主动点击展开 / 编辑按钮才能访问编辑器。
- 稳定性的判断依据：连续 5 次独立 tracing 均观察到编辑器未展开，且管理员路径全部通过，排除操作抖动。

---

## 3. 前置条件

1. 存在一个已登录的“成员”用户（非管理员/所有者）。
2. 该成员拥有至少一个已创建且状态为“进行中”的任务（task）。
3. 任务详情页面已加载，且“子行动项”区域可见。

---

## 4. 测试步骤（`StepSpec`）

| 步骤编号 | 业务步骤 | 语义化操作 | 预期结果 |
|----------|----------|-------------|----------|
| S1 | 导航到指定任务详情页 | `semantic.navigateToTask(taskId)` | 页面渲染完成，任务标题可见 |
| S2 | 点击“新增子行动项”按钮 | `semantic.addSubTask()` | 子行动项以折叠条目形式出现在列表中，**不自动打开编辑器** |
| S3 | 点击该子行动项的“展开/编辑”按钮 | `semantic.expandSubTaskEditor(subTaskIndex)` | 内联编辑器弹出，标题输入框（label="编辑子行动项标题"）获得焦点 |
| S4 | 输入子行动项标题 | `semantic.enterSubTaskTitle("子行动项标题")` | 输入框显示键入内容 |
| S5 | 保存子行动项 | `semantic.saveSubTask()` | 子行动项更新为显示状态，标题生效，列表刷新 |

> **说明**：步骤 S2 → S3 是本次修改的核心。S2 后测试不应再直接等待编辑器出现；必须显式执行“展开编辑器”动作（S3）。  
> 语义化操作 `semantic.expandSubTaskEditor` 需在 operator 层实现，统一维护成员/管理员的不同行为。

---

## 5. 数据要求

- `taskId`: 一个有效的任务 ID（预先通过 API 创建或 fixture 设定）。
- `subTaskIndex`: 子行动项在列表中的索引（从 0 开始）。S2 新增后，新条目通常位于列表末尾。

---

## 6. 异常场景

- **场景 A**: 成员无权限新增子行动项（任务非本人创建）  
  → 预期：`addSubTask()` 按钮不可见或点击无反应，对应步骤应验证 `getByRole("button", { name: "新增子行动项" }).isHidden()`。

- **场景 B**: 展开编辑器时，子行动项已被其他成员编辑锁定  
  → 预期：`expandSubTaskEditor()` 操作应抛出锁定提示，测试标记为 pending 并跳过后续步骤。

---

## 7. 回链要求

每个步骤的 `case.ts` 中 `StepSpec` 必须保持：

- `source.caseStepId`: 对应上表步骤编号（如 `S1`）。
- `source.method`: 语句对应的语义化操作名称（如 `navigateToTask`）。
- `source.documentPath`: 本文件的相对路径。

---

## 8. 依赖与注意事项

- **依赖操作**: `addSubTask`, `expandSubTaskEditor` 需要在 `operator/task.ts` 中实现并注册。
- **稳定性**: 对于折叠状态的等待，应在 operator 中使用 `waitForSelector('[data-state="collapsed"]')` 确保列表渲染完毕后再点击展开。
- **后续维护**: 如果产品未来统一成员和管理员行为（均自动展开），只需修改 operator 中的 `expandSubTaskEditor` 逻辑，无需改动本 case。