请检查并修正本次指定的 testd 数据化测试用例文档和对应代码。

工作范围：
- 先阅读：
  - ORF/testd-doc/规范/数据化测试方法论.md
  - ORF/testd-doc/规范/数据化测试步骤语言规范.md
  - ORF/testd-doc/规范/数据化测试代码生成约束.md
  - ORF/testd-doc/规范/数据化测试用例模板.md
- 再阅读我指定的 testd-doc/cases/**/*.md
- 找到并阅读对应的 testd/**/*.case.ts
- 如有必要，再阅读对应 operators/helpers，但不要扩大到无关用例。

检查目标：
1. 文档格式是否符合规范：
   - 是否包含测试目标、边界、状态模型。
   - 阶段是否为 B、Setup、S0、Action、S1、Clean。
   - 步骤格式是否为 `- [阶段-序号] [playwright|api|prisma|mock] 描述。`
   - 阶段编号是否连续、顺序是否正确。
   - 每句话是否单句单意、主语明确、业务优先、状态和动作分离。
   - 是否混入实现层术语，例如 capture、response、saveAs、runtime、waitForResponse、urlEndsWith、StepSpec、接口响应捕获等。
   - B 阶段是否只描述稳定基准状态，不引入具体测试账号、成员关系或业务对象。
   - Setup、Action、S1、Clean 的职责是否混淆。

2. 文档和代码对应关系是否正确：
   - 文档每条步骤必须在 case.ts 中有且只有一个 StepSpec 对应。
   - StepSpec.source.caseStepId 必须和文档步骤编号一致。
   - StepSpec.source.method 必须和文档执行手段一致。
   - StepSpec.title 必须和文档步骤描述一致。
   - case.ts 不允许存在文档没有的业务步骤。
   - 文档不允许存在 case.ts 没有实现的步骤。
   - 顺序、阶段、数量必须一致。
   - traceability 为 verified 的用例必须严格一一对应。

修改原则：
- 先报告发现的问题和根因。
- 如果只是语言不规范，优先改文档句子，并同步 case.ts title。
- 如果文档语义和 case.ts 行为不一致，先指出冲突，不要替我选择业务方向。
- 不要改无关文件。
- 不要为了通过检查引入新抽象、新流程或无关重构。
- 实现细节应留在 case.ts 的 object/operator/params 中，文档步骤只写业务可读语言。

输出要求：
- 说明核心修改内容。
- 说明为什么修改后更符合规范。
- 说明文档和代码如何保持一一对应。
- 说明做过哪些自检。
- 说明仍未处理的风险点。