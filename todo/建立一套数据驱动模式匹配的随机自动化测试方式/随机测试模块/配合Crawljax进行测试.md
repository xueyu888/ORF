# 目标

使用 Crawljax 完成前端页面的自动探索。

在 Crawljax 之外，补充数据校验模块，用来判断探索过程中产生的接口结果和数据库结果是否符合业务规则。

> Crawljax 负责“走页面”和“记录状态”，数据校验模块负责“判断数据是否正确”。

# 当前接入方式

当前不是直接用 Crawljax CLI，而是通过 Java Runner 调用 Crawljax。

相关文件：
```
.artifacts/crawljax/java-runner/src/main/java/local/orf/OrfCrawljaxRunner.java
.artifacts/crawljax/orf-crawl.env
.artifacts/crawljax/run-orf-java-runner.sh
```

运行命令：
```
.artifacts/crawljax/run-orf-java-runner.sh
```

运行脚本会做三件事：
1. 读取 `.artifacts/crawljax/orf-crawl.env`
2. 组装 Java classpath 并加载 Crawljax 依赖
3. 执行 `local.orf.OrfCrawljaxRunner`

# Crawljax 配置

当前配置入口在 `OrfCrawljaxRunner.java`。

基础配置：
```
CrawljaxConfiguration.builderFor(appUrl + "/bounties");

builder.setBrowserConfig(new BrowserConfiguration(BrowserType.CHROME_HEADLESS, 1));
builder.setOutputDirectory(new File(outputDir));
builder.setMaximumStates(200);
builder.setMaximumDepth(20);
builder.setMaximumRunTime(5, TimeUnit.MINUTES);
```

环境变量配置：
```
ORF_CRAWL_APP_URL='http://127.0.0.1:5173'
ORF_CRAWL_EMAIL='wuyztest@sdr.com'
ORF_CRAWL_PASSWORD='12345678'
ORF_CRAWL_OUTPUT='.artifacts/crawljax/orf-normal-user-output'
ORF_CRAWL_ALLOW_MUTATIONS='true'
```

登录方式：
```
POST /api/auth/login
读取 orf_ory_session
在 Crawljax 浏览器中写入 Cookie
跳转到 /bounties
```

点击范围：
```
clickDefaultElements()
click("button")
click("a")
click("a").withAttribute("href", "/bounties")
click("a").withAttribute("href", "/tasks")
click("a").withAttribute("href", "/feedback")
click("a").withAttribute("href", "/reports")
```

固定禁止点击：
```
退出
退出登录
aria-label=退出登录
title=退出登录
```

`ORF_CRAWL_ALLOW_MUTATIONS=true` 时，Crawljax 可以点击新建、挑战、提交等可能改变数据的按钮。

`ORF_CRAWL_ALLOW_MUTATIONS=false` 时，需要限制探索范围，避免进入成员管理、权限管理、认证页面，并禁止删除、保存、提交、新建、挑战等动作。

# Crawljax 输出内容

每次运行会生成一个 `crawlN` 目录。

常用文件：
```
index.html       总览报告
result.json      状态图结构化结果
config.json      本次运行配置
CrawlPath*.json  探索路径
doms/            每个状态的 DOM 快照
screenshots/     每个状态的截图
states/          每个状态的可视化页面
css/js/img/lib   报告页面资源
```

`result.json` 主要包含：
```
states      Crawljax 发现的页面状态
edges       状态之间的点击转移
statistics 运行统计信息
exitStatus 退出原因
```

`states` 中的单个状态包含：
```
name               状态名，例如 index、state2
url                当前 URL
candidateElements 该状态下还可点击的候选元素
fanIn              有多少条边进入该状态
fanOut             有多少条边离开该状态
failedEvents       失败事件
hasNearDuplicate   是否存在近似重复状态
nearestState       最近似状态
```

`edges` 中的单条边包含：
```
from       来源状态
to         目标状态
text       被点击元素的文本
id         被点击元素的定位方式
element    被点击元素的标签和属性
eventType  事件类型，例如 click
```

`doms/` 用来判断页面实际内容。

`screenshots/` 用来人工观察页面表现。

数据校验模块不要只依赖截图，应优先读取 `result.json`、`CrawlPath*.json`、`doms/` 和后端接口/数据库。

# 数据校验前需要确认什么

写数据校验模块之前，需要先确定校验边界。

必须确认：
1. 校验哪个业务模块
2. 哪些页面动作允许改变数据
3. 哪些接口是关键接口
4. 哪些数据库表是最终状态
5. 每个动作执行前后的合法数据变化是什么
6. 测试账号是否有权限执行这些动作
7. 每次测试是否需要重置数据库或隔离测试数据

以悬赏大厅为例，需要确认：
```
页面：/bounties
关键接口：/api/tasks-page、/api/results/:resultId/challenge
关键表：objectives、results、tasks、comments
关键字段：results.owner、tasks.linkedResultId、objectives.stage
可变动作：我要挑战、新建悬赏、新建目标、新建反馈
禁止动作：退出登录、删除真实数据、修改非测试账号数据
```

以注册登录为例，需要确认：
```
页面：/auth
关键接口：/api/auth/login、/api/auth/register、/api/auth/session
关键表：用户表、会话表
关键字段：email、name、role、session
合法数据：符合邮箱格式、密码长度满足要求
非法数据：非法邮箱、过短密码、重复账号
最终要求：非法账号不能入库，合法账号可以登录，密码不能明文存储
```

# 数据校验模块如何配合 Crawljax

数据校验模块不替代 Crawljax，也不控制浏览器点击。

它围绕 Crawljax 做前置检查、过程记录和后置校验。

整体流程：
```
准备测试环境
  -> 前置数据快照
  -> 运行 Crawljax
  -> 读取 Crawljax 输出
  -> 根据路径识别业务动作
  -> 查询接口和数据库
  -> 执行业务断言
  -> 生成测试结论
```

## 前置检查

运行 Crawljax 前，先确认被测系统可用。

需要检查：
```
前端可访问
后端可访问
登录接口可用
/api/tasks-page 返回 200
数据库 schema 与代码一致
测试账号存在
测试数据存在
```

如果 `/api/tasks-page` 已经报错，Crawljax 仍然可以截到页面，但这个页面可能只是初始模板或浏览器缓存状态，不能作为业务正确性的依据。

## 前置数据快照

运行前记录关键数据。

例如悬赏模块：
```
查询 results 表
记录 owner 为空、User、未分配的悬赏
记录当前用户信息
记录当前任务数量
记录当前评论数量
```

这份快照用于和 Crawljax 运行后的数据库状态做对比。

## 运行 Crawljax

Crawljax 负责探索页面并生成输出。

运行后重点读取：
```
result.json
CrawlPath*.json
doms/*.html
logs/orf-crawljax-*.log
```

`result.json` 用来知道 Crawljax 走到了哪些页面。

`CrawlPath*.json` 用来知道某条路径执行了哪些动作。

`doms/*.html` 用来检查页面上是否出现关键文案。

日志中的 `[ORF-CANDIDATE]`、`Event fired=true`、`[ORF-NEW-STATE]` 用来确认候选元素、点击事件和新状态是否真实发生。

## 识别业务动作

从 Crawljax 输出中识别业务动作。

可以根据这些信息匹配：
```
URL
事件文本
元素标签
元素 href
元素 xpath
状态变化前后的 DOM
```

例如：
```
text=计划 href=/tasks
表示从悬赏大厅进入计划页

text=我要挑战
表示尝试接受一个悬赏

text=新建反馈
表示打开新建反馈流程
```

如果只靠 xpath 不稳定，可以在前端关键按钮上补充稳定属性：
```
data-testid
data-action
data-entity-id
```

这样数据校验模块可以更准确地把 Crawljax 的点击事件映射到业务动作。

## 后置数据校验

运行后再次查询接口和数据库。

以“我要挑战”为例：
```
运行前：某 result.owner 为 User 或未分配
Crawljax 点击：我要挑战
运行后：该 result.owner 应该变成当前测试用户
运行后：同一个 result 不能产生重复领取记录
运行后：无关 result 不能被修改
运行后：/api/tasks-page 应该返回 200
```

以“新建反馈”为例：
```
运行前：记录 feedback 数量
Crawljax 点击：新建反馈并提交
运行后：feedback 增加 1 条
运行后：linkedObjectiveId、linkedResultId、owner、causeCategories 符合输入
运行后：页面可以进入反馈详情或反馈列表
```

以“注册登录”为例：
```
非法注册输入后：用户表不能新增账号
合法注册输入后：用户表新增账号
重复账号输入后：用户表不能新增第二条
错误密码登录后：不能生成有效登录态
正确密码登录后：/api/auth/session 返回当前用户
```

# 校验结论

数据校验模块最终输出一份结论。

结论应包含：
```
Crawljax 输出目录
执行到的 URL 列表
执行过的关键业务动作
动作前数据快照
动作后数据快照
接口校验结果
数据库校验结果
失败原因
复现路径
```

失败时需要能回答：
```
是哪条 Crawljax 路径触发的
点击了哪个元素
页面当时在哪个状态
接口返回了什么
数据库多了什么或少了什么
违反了哪条业务规则
```

# 模块边界

Crawljax 承担：
```
自动打开页面
自动发现候选元素
自动点击和探索
记录 DOM 状态
记录状态图
保存截图和路径
```

数据校验模块承担：
```
准备测试数据
记录前置快照
读取 Crawljax 输出
识别业务动作
查询接口和数据库
执行断言
生成测试报告
```

业务规则不写在 Crawljax 配置里。

Crawljax 配置只决定“能点什么、不能点什么、从哪里开始、跑多久”。

业务规则写在数据校验模块里。
