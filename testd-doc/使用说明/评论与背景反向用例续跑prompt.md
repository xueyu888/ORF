# 评论反向用例续跑 prompt

把下面这段提示词复制给下一台电脑上的 Codex 继续执行：

```text
你在 /home/waao/work/ORF 仓库继续处理 testd-doc / testd 数据化测试。

必须先阅读 AGENTS.md 以及：
- testd-doc/规范/数据化测试方法论.md
- testd-doc/规范/数据化测试步骤语言规范.md
- testd-doc/规范/数据化测试代码生成约束.md
- 本次涉及的 6 个评论反向用例文档

当前已实现内容：
- 新增并挂入 6 个评论反向用例文档和 testd 配置：
  - 管理员新增评论-普通成员不可评论未参与目标和任务
  - 成员新增评论-非参与成员不可新增评论
  - 评论回复-非参与成员不可回复
  - 评论编辑-非作者不可编辑
  - 评论删除-非作者不可删除
  - 评论上传图片-非图片文件不可上传
- 新增 comment reverse case factory、6 组 comments 反向 spec。
- 新增/扩展 comments 领域 operators/helpers。
- `testd/testd.config.ts` 和 `testd/testd.config.ts.example` 已加入这些用例，均保持 `enabled: false`，但有 `spec`、`fixtureLifecycle: "isolated"`、`traceability: "verified"`。
- 注意用户确认过的业务规则：非参与成员不可回复，但管理员可以回复；当前反向回复用例只验证非参与普通成员不可回复。

已跑验证：
- `npm run build` 已通过。
- 未启动后端时直接跑新增 spec，会全部在 B-2 `backend.ready` 失败。这是测试环境未就绪，不是用例结论。
- 启动后端：
  - `npm run server:start`
  - 后端监听 `http://127.0.0.1:8787`
  - `curl http://127.0.0.1:8787/health` 返回 200。
- 整组新增 spec 串行跑过一次：
  - `ORF_REAL_E2E=1 TESTD_INCLUDE_DISABLED_SPECS=1 npm run testd -- testd/comments/admin-create-forbidden/_entry/admin-create-comment-forbidden.spec.ts testd/comments/member-create-forbidden/_entry/member-create-comment-forbidden.spec.ts testd/comments/reply-forbidden/_entry/comment-reply-forbidden.spec.ts testd/comments/edit-forbidden/_entry/comment-edit-forbidden.spec.ts testd/comments/delete-forbidden/_entry/comment-delete-forbidden.spec.ts testd/comments/image-upload-invalid/_entry/comment-image-upload-invalid.spec.ts --workers=1`
  - 结果：12 个测试中 6 个通过、6 个失败。

通过范围：
- 评论编辑-非作者不可编辑：目标、任务均通过。
- 评论删除-非作者不可删除：目标、任务均通过。
- 评论上传图片-非图片文件不可上传：目标、任务均通过。

失败范围和现象：
- 管理员新增评论-普通成员不可评论未参与目标和任务：目标、任务均失败。
- 成员新增评论-非参与成员不可新增评论：目标、任务均失败。
- 评论回复-非参与成员不可回复：目标失败在 S0 的 `api.my_challenges.comment_target.absent`，任务后续出现一次 B-5 `db.ready` 超时，可能是前一个用例拖满 30s 后的环境抖动。
- 失败集中在 `api.my_challenges.comment_target.absent`：
  - Setup 阶段同类 absent 断言曾通过。
  - S0 阶段页面行 `page.comment_target.hidden` 已通过。
  - 随后再次查询 `/api/my-challenges?scope=mine` 的 absent 断言超时。

下一步建议：
1. 先单跑一个最小失败用例，例如：
   `ORF_REAL_E2E=1 TESTD_INCLUDE_DISABLED_SPECS=1 npm run testd -- testd/comments/member-create-forbidden/_entry/member-create-comment-forbidden.spec.ts --workers=1`
2. 临时给 `testd/comments/_support/comment.helpers.ts` 的 `readMyChallenges` / `myChallengesHasTarget` 打日志，记录 response.status、objectives/tasks ids、target id/title、当前 session user。
3. 优先判断这是测试 helper 口径问题还是业务接口问题：
   - `myChallengesLacksTarget` 当前是 `!myChallengesHasTarget`，而 `myChallengesHasTarget` 对非 200 返回 false；这可能让 Setup 阶段把非 200/未稳定响应误判为“缺席”。
   - 如果接口 200 且确实返回了非参与成员未参与的目标/任务，而 UI 行隐藏，则需要继续判断 `/api/my-challenges` 的过滤是否与前端展示不一致。
   - 如果只是测试口径问题，修改用例/helper；如果确认是业务实现问题，按 AGENTS.md 要求提 issue，issue 内容用简短中文并注明 commit hash。
4. 修改任何已 verified 的用例时，必须保持用例文档中的每条步骤与 `case.ts` 的 `StepSpec.source.caseStepId/source.method` 严格一一对应。
```
