# MurmRay 0G Product Plan

## 结论

当前 0G Proof 功能能证明一件事：MurmRay 曾经在某个时间生成过一条 AI Signal，内容后来没有被改过。

这个能力还不够强。新闻和市场信号都有时效性。过几天之后，单条 Signal 对交易决策的价值会下降。用户不会因为一条过期新闻被存到 0G 上就觉得产品更有用。

0G 在 MurmRay 里更合适的位置是 **AI Track Record**：记录 AI 每一次市场判断，后续对照市场结果，形成可验证的命中率、来源质量和模型信誉。

一句话定位：

> MurmRay does not just generate market signals. It builds a verifiable track record of AI market judgment.

## 当前链路

现在的 0G 链路已经打通：

1. 用户浏览网页。
2. MurmRay 提取网页内容。
3. AI 判断网页事件和 Polymarket 市场的关系。
4. 系统生成 Signal。
5. 后端把 Signal 写入 0G Storage。
6. 后端把 Signal Hash 登记到 0G Chain。
7. 用户打开 0G Proof 页面，查看 Storage URI、Tx Hash、合约地址和 Explorer 链接。

这个版本适合作为技术底座，不适合作为最终产品卖点。

## 当前问题

### 1. 单条 Signal 会过期

如果一条 Signal 来自新闻，它的价值通常集中在很短的窗口期。市场价格变化后，用户再看这条 Signal，只能知道“当时 AI 说过什么”。

这个信息有审计价值，但没有足够强的用户价值。

### 2. Proof 页面偏工程

Storage URI、Tx Hash、合约地址和 Explorer 链接能证明链路真实存在。普通用户不关心这些字段。

评委会看技术集成，但他们也会问：这对用户有什么用？

### 3. 0G 现在像附加层

如果产品只在分析结束后把结果存一下，0G 会像“为了黑客松接入的证明按钮”。我们需要让 0G 参与 MurmRay 的核心循环。

## 新定位：AI Track Record

MurmRay 应该把每条 Signal 当成一次 AI 判断，而不是一条永久有效的建议。

这条判断有三个阶段：

1. `active`：市场还没结束，Signal 仍可参考。
2. `expired`：市场窗口已经过去，Signal 进入复盘。
3. `resolved`：市场有结果后，系统判断 AI 是否命中。

0G 保存的是判断证据：

- 当时的网页来源
- AI 提取的事件摘要
- 匹配到的市场
- AI 给出的方向
- 置信度
- 理由
- 生成时间
- Signal Hash

后端再补充后续结果：

- 市场是否已结束
- 最终结果是什么
- AI 方向是否命中
- 高置信度 Signal 的命中率
- 哪些来源更容易产生有效 Signal

这样，过期 Signal 不再是废数据。它会进入 MurmRay 的历史账本。

## 用户价值

### 对普通用户

用户不需要看链，也不需要连接钱包。

用户看到的是：

- MurmRay 最近给了哪些信号
- 哪些信号还有效
- 哪些信号已经过期
- 过期信号后来准不准
- 高置信度信号历史表现如何

这比单纯展示 Proof 更容易理解。

### 对高阶用户

高阶用户可以复盘：

- 哪些新闻源更值得看
- 哪些市场类型 AI 判断更准
- 哪些方向性判断更稳定
- 高置信度是否真的更可靠

0G 保证这些历史记录不能被产品方事后改写。

### 对黑客松评委

评委看到的不是“我们把 JSON 存到 0G 上了”。

评委看到的是：

- AI 每次市场判断都有链上登记。
- Signal 原文存在 0G Storage。
- MurmRay 追踪这些 Signal 的结果。
- 用户可以验证历史表现没有被改。

这让 0G 成为 MurmRay 的可验证 AI 记忆层。

## 推荐功能路线

### v1：Signal Ledger

把现在的 0G Proof 页面改成 Signal Ledger。

当前实现进度：已完成最小闭环。新 Signal 会把 `market.endDate` 一起写入 0G Storage；Ledger 会把 Signal 标成 `active`、`expired` 或 `untracked`。`resolved`、`hit`、`miss` 需要等市场结果数据源接入后再计算。

页面仍保留 Storage URI、Tx Hash 和 Explorer，但主视角改成用户能理解的信息：

- Signal 状态：Active / Expired / Resolved
- Source：来源网页
- Market：匹配市场
- Direction：AI 判断方向
- Confidence：置信度
- Generated At：生成时间
- Proof：链上证明入口

当前已经有两条测试记录。它们应该被解释成 ledger 里的早期 Signal，而不是孤立的 proof。

### v2：Track Record

增加结果追踪。

后端定期读取已登记 Signal，按 marketId 查市场结果。市场 resolved 后，系统给 Signal 标记：

- `hit`
- `miss`
- `unknown`

页面增加统计：

- 总 Signal 数
- Active 数
- Resolved 数
- 命中率
- 高置信度命中率
- 最近命中的 Signal
- 最近失误的 Signal

这个版本最适合黑客松 demo。

### v3：Source Reputation

统计来源质量。

同一个新闻源、推文源或网站可以积累历史表现：

- 产生了多少 Signal
- 多少进入 resolved
- 命中率多少
- 平均置信度多少
- 高质量 Signal 占比多少

用户看到的不是“这个新闻网站可信不可信”，而是“这个来源过去触发的市场信号表现如何”。

### v4：Model Reputation

如果以后 MurmRay 使用多个模型或多个 prompt 版本，可以把模型版本写入 Signal metadata。

后续比较：

- 模型 A 的命中率
- 模型 B 的命中率
- 哪个模型更适合政治市场
- 哪个模型更适合宏观市场
- 哪个 prompt 更稳定

0G 保证模型评测数据没有被事后挑选或改写。

## Demo 讲法

### 当前 demo

1. 打开一条新闻网页。
2. MurmRay 自动识别事件。
3. MurmRay 匹配 Polymarket 市场。
4. AI 生成 Signal。
5. 后端写入 0G Storage，并把 Signal Hash 登记到 0G Chain。
6. 打开 Proof 页面，展示 Storage URI、Tx Hash、合约地址和 Explorer。

这能证明技术链路。

### 更强 demo

1. 打开一条新闻网页。
2. MurmRay 生成 Signal。
3. Signal 进入 Signal Ledger，状态是 Active。
4. 打开一条历史 Signal，状态是 Resolved。
5. 页面展示 AI 当时的判断、链上证明和最终结果。
6. 页面展示 MurmRay 的历史命中率。

这个 demo 能解释产品价值。

## 页面文案建议

### 原页面标题

`0G Proof`

### 建议改成

`Signal Ledger`

### 页面副标题

`Every AI market signal is stored, anchored, and tracked against market outcomes.`

### 小白解释

`MurmRay records each AI market judgment so you can check what it said at the time and whether it later proved useful.`

### 状态文案

- `Active`：市场还没结束，这条 Signal 仍在观察。
- `Expired`：市场窗口已过，这条 Signal 等待复盘。
- `Resolved`：市场已有结果，这条 Signal 已计入历史表现。

## 下一步实现建议

优先做 v2 的最小闭环：

1. 在 Signal metadata 里保存 marketId、marketUrl、generatedAt、modelVersion。
2. Proof 页面改名为 Signal Ledger。
3. 为每条 Signal 增加状态字段。
4. 写一个后台任务，定期查询市场是否 resolved。
5. resolved 后计算 hit / miss / unknown。
6. 页面顶部展示命中率和高置信度命中率。

这比继续美化 Proof 页面更值得做。

## 风险

### 市场结果不一定容易拿

Polymarket 的 market resolved 数据需要稳定来源。没有结果时，Signal 只能停在 Active 或 Expired。

### 方向判断需要定义清楚

`利好`、`利空`、`neutral` 需要映射到市场 outcome。没有清晰映射时，不应该强行算 hit / miss。

### 不能承诺投资收益

页面要强调 track record 和复盘，不要写成收益承诺。

## 最终判断

0G 不应该只保存过期新闻 Signal。

MurmRay 应该用 0G 保存 AI 判断历史，再用市场结果证明这些判断的质量。这样，0G 才会从“技术接入项”变成产品核心能力。
