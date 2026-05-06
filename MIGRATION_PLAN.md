# MIGRATION_PLAN.md

## 目标

将 `/Users/mac/Desktop/code/osaka` 中的 Chrome Extension 功能，按 **功能单元** 逐个迁移到当前 `murmray` 仓库。

迁移过程严格遵循 `AGENTS.md`：

1. 一次只迁移一个功能。
2. 迁移时允许删除冗余代码，不做无关重构。
3. 函数与关键代码补 `4-10` 个字短注释。
4. 每个功能迁移完成后，必须补测试用例。

## 当前现状

### 源项目 `osaka`

源项目已经是完整可运行的 Chrome Extension，核心功能集中在：

1. `background`
2. `content`
3. `sidepanel`
4. `shared`

已识别出的主要业务能力：

1. 扩展基础入口与消息分发
2. 页面内容采集与分析触发
3. 幽灵模式自动分析
4. 分析结果展示
5. Google 登录与用户态管理
6. 会员状态与套餐读取
7. 钱包连接与链切换
8. 链上购买会员/次卡
9. Polymarket 持仓读取与展示

### 目标项目 `murmray`

当前只是 WXT 初始骨架，只有：

1. `entrypoints/background.ts`
2. `wxt.config.ts`

说明当前迁移应从 **扩展基础框架** 开始，逐层把 `osaka` 的功能重写进来。

## 总体迁移策略

不按目录迁移，按 **用户可感知功能闭环** 迁移。

推荐顺序：

1. 先迁移最小可运行骨架。
2. 再迁移核心分析链路。
3. 再迁移登录与付费能力。
4. 最后迁移钱包、会员、持仓等增强能力。

每个阶段结束后，都要满足：

1. 功能可运行。
2. 关键函数已补短注释。
3. 对应测试已补齐。

## 功能拆分与迁移顺序

### Phase 0：测试与目录基线

目标：先补齐最小可用工程结构，为后续逐功能迁移提供落点。

范围：

1. 明确 `background / content / sidepanel / shared` 在 WXT 下的目录映射。
2. 建立测试基础设施。
3. 建立公共常量、消息类型、测试目录约定。

建议产出：

1. WXT 入口结构落地。
2. 单元测试运行链路可执行。
3. 如有需要，再补最小 E2E 或集成测试骨架。

验收标准：

1. 能本地启动扩展开发环境。
2. 能执行测试命令。
3. 目录结构已能承接后续功能迁移。

测试重点：

1. 测试框架能跑通。
2. 共享工具函数可被测试。

---

### Phase 1：扩展基础骨架

目标：完成最小扩展运行闭环。

范围：

1. `manifest` 对应配置迁移到 WXT。
2. `background` 入口迁移。
3. `content` 入口挂载。
4. `sidepanel` 入口挂载。
5. 基础消息通道打通。

来源参考：

1. `osaka/packages/extension/src/background/index.js`
2. `osaka/packages/extension/src/content/index.js`
3. `osaka/packages/extension/src/sidepanel/index.html`
4. `osaka/manifest.json`

验收标准：

1. 扩展可加载。
2. 点击扩展图标可打开 sidepanel。
3. `background ↔ content ↔ sidepanel` 可通信。

测试重点：

1. 消息分发测试。
2. 配置映射测试。
3. 基础入口加载测试。

---

### Phase 2：共享配置与工具层

目标：先把后续功能依赖的基础能力重写出来。

范围：

1. `shared/config`
2. `shared/utils`
3. `shared/chains`
4. `shared/membership`
5. `shared/insforge`

来源参考：

1. `osaka/packages/extension/src/shared/config.js`
2. `osaka/packages/extension/src/shared/utils.js`
3. `osaka/packages/extension/src/shared/chains.js`
4. `osaka/packages/extension/src/shared/membership.js`
5. `osaka/packages/extension/src/shared/insforge.js`

迁移要求：

1. 只迁移当前已被功能使用的部分。
2. 清理 `osaka` 中不再需要的冗余常量。
3. 统一命名，避免继续沿用 `osaka_*` 旧 key。

验收标准：

1. 后续功能可直接复用这些共享模块。
2. 关键常量、地址、配额、链信息可被稳定读取。

测试重点：

1. 文本处理工具测试。
2. URL 规范化测试。
3. 支付金额换算测试。
4. 链配置选择测试。

---

### Phase 3：页面分析手动链路

目标：先完成最核心的单次分析能力，不先做幽灵模式。

范围：

1. 从当前页面提取标题、URL、正文、选中文本。
2. 发送分析请求到后端函数。
3. 返回并渲染匹配结果。
4. 处理空结果、错误态、受限页面态。

来源参考：

1. `osaka/packages/extension/src/background/api.js`
2. `osaka/packages/extension/src/sidepanel/app.js`
3. `osaka/packages/extension/src/sidepanel/components.js`
4. `osaka/packages/extension/src/content/index.js`

说明：

这是产品主路径，应优先迁移。

验收标准：

1. 在普通网页可手动发起分析。
2. 成功展示匹配市场。
3. 无匹配、报错、黑名单页面均有正确反馈。

测试重点：

1. 页面上下文构建测试。
2. 分析结果合并测试。
3. 错误分支测试。
4. 结果渲染测试。

---

### Phase 4：幽灵模式自动分析

目标：迁移自动监听页面并自动分析的能力。

范围：

1. 幽灵模式开关状态管理。
2. 页面切换监听。
3. 自动触发分析。
4. 分析中状态同步。
5. 结果缓存与并发控制。

来源参考：

1. `osaka/packages/extension/src/background/ghost-mode.js`
2. `osaka/packages/extension/src/content/index.js`
3. `osaka/packages/extension/src/background/storage.js`
4. `osaka/packages/extension/src/sidepanel/app.js`

验收标准：

1. 开启后可自动分析页面。
2. 同一页面不会重复无效请求。
3. 切页后状态能同步到 sidepanel。
4. 黑名单页面不会误触发分析。

测试重点：

1. 页面 key 生成测试。
2. 缓存命中测试。
3. 并发去重测试。
4. 黑名单逻辑测试。

---

### Phase 5：分析结果面板与交互

目标：把 sidepanel 的主界面迁移完整。

范围：

1. `feed / profile / settings` 三个主视图。
2. 分析结果列表展示。
3. 跳转 Polymarket 页面。
4. 幽灵模式状态展示。
5. 基础空态、加载态、错误态。

来源参考：

1. `osaka/packages/extension/src/sidepanel/index.html`
2. `osaka/packages/extension/src/sidepanel/styles.css`
3. `osaka/packages/extension/src/sidepanel/app.js`
4. `osaka/packages/extension/src/sidepanel/components.js`

验收标准：

1. 主面板结构完整。
2. Tab 切换正常。
3. 分析结果交互正常。

测试重点：

1. 组件渲染测试。
2. 交互事件测试。
3. 状态切换测试。

---

### Phase 6：认证功能

目标：迁移登录闭环，优先保留当前主用的 Google 登录。

范围：

1. 读取当前用户。
2. Google 登录。
3. 登录态持久化。
4. 退出登录。
5. 认证过期处理。

来源参考：

1. `osaka/packages/extension/src/background/api.js`
2. `osaka/packages/extension/src/background/storage.js`
3. `osaka/packages/extension/src/sidepanel/auth.js`
4. `osaka/packages/extension/src/sidepanel/app.js`

迁移建议：

1. 优先迁移当前真实在用链路。
2. 邮箱 OTP、旧兼容逻辑先不迁，除非验收明确需要。

验收标准：

1. 未登录时展示登录入口。
2. 登录成功后可进入主面板。
3. 刷新后仍能恢复登录态。
4. token 失效后能正确清理状态。

测试重点：

1. token 存取测试。
2. 用户态恢复测试。
3. 认证失败测试。

---

### Phase 7：会员状态与配额

目标：迁移分析配额和会员状态相关逻辑。

范围：

1. 获取会员状态。
2. 获取价格目录。
3. 分析次数扣减逻辑接入。
4. 在 UI 中展示免费额度 / 会员状态 / 次卡状态。

来源参考：

1. `osaka/packages/extension/src/background/api.js`
2. `osaka/packages/extension/src/shared/membership.js`
3. `osaka/packages/extension/src/sidepanel/payment.js`

验收标准：

1. 可正确读取会员信息。
2. 手动分析与幽灵模式可共用配额判断。
3. UI 能显示当前权益状态。

测试重点：

1. 配额计算测试。
2. 价格目录规范化测试。
3. 状态展示测试。

---

### Phase 8：钱包连接与链切换

目标：迁移链上支付依赖的钱包能力。

范围：

1. 钱包检测。
2. 钱包连接。
3. 链 ID 识别。
4. 切换到 X Layer。
5. 钱包状态展示。

来源参考：

1. `osaka/packages/extension/src/background/wallet.js`
2. `osaka/packages/extension/src/shared/chains.js`
3. `osaka/packages/extension/src/sidepanel/payment.js`

验收标准：

1. 能识别 MetaMask / OKX Wallet。
2. 能连接钱包。
3. 能切换到目标链。

测试重点：

1. provider 选择测试。
2. chainId 解析测试。
3. 切链错误处理测试。

---

### Phase 9：会员购买与次卡购买

目标：迁移完整付费闭环。

范围：

1. 创建会员订单。
2. 创建次卡订单。
3. 发起链上支付。
4. 确认订单。
5. 支付成功后刷新权益状态。

来源参考：

1. `osaka/packages/extension/src/background/api.js`
2. `osaka/packages/extension/src/background/wallet.js`
3. `osaka/packages/extension/src/shared/membership.js`
4. `osaka/packages/extension/src/sidepanel/payment.js`

验收标准：

1. 可发起购买流程。
2. 支付完成后可确认订单。
3. UI 状态可正确更新。

测试重点：

1. 订单参数构建测试。
2. 金额单位换算测试。
3. 支付确认分支测试。

---

### Phase 10：Polymarket 持仓展示

目标：迁移“我的持仓”和结果关联展示能力。

范围：

1. 读取用户持仓。
2. 构建持仓索引。
3. 将持仓和分析结果做关联标记。
4. 在个人页展示持仓摘要。

来源参考：

1. `osaka/packages/extension/src/background/polymarket.js`
2. `osaka/packages/extension/src/sidepanel/payment.js`
3. `osaka/packages/extension/src/sidepanel/app.js`

验收标准：

1. 可读取并展示持仓信息。
2. 命中的市场可显示是否已持仓。

测试重点：

1. 持仓标准化测试。
2. 持仓索引构建测试。
3. 结果关联测试。

## 每个功能的统一执行模板

每次开始一个功能迁移时，必须先补这四项：

1. 功能名称
2. 功能边界
3. 依赖模块
4. 验收结果

每次提交时，必须检查：

1. 是否只迁移了一个功能
2. 是否删掉了明显冗余代码
3. 是否为函数补了短注释
4. 是否为关键逻辑补了短注释
5. 是否补了测试
6. 是否本地通过测试

## 注释约束

迁移后的代码遵循以下规则：

1. 函数前补意图注释。
2. 复杂分支前补意图注释。
3. 关键状态变更处补意图注释。
4. 注释长度控制在 `4-10` 个字。

示例：

```ts
// 构建页面键
function buildPageKey() {}

// 复用缓存结果
function readCachedResult() {}

// 广播状态变更
async function notifyStateChange() {}
```

## 测试策略

### 单元测试

优先覆盖：

1. 工具函数
2. 状态处理函数
3. 参数构建函数
4. 结果归并函数
5. 缓存与配额逻辑

### 集成测试

优先覆盖：

1. background 消息处理
2. sidepanel 与 background 通信
3. content 与 background 通信

### E2E 测试

只在关键闭环后补：

1. 手动分析闭环
2. 幽灵模式闭环
3. 登录闭环
4. 支付闭环

## 第一批建议立即开始的功能

按照当前项目状态，建议立刻开始：

1. `Phase 0` 测试与目录基线
2. `Phase 1` 扩展基础骨架
3. `Phase 2` 共享配置与工具层
4. `Phase 3` 页面分析手动链路

原因：

1. 这是最小可运行主路径。
2. 能尽快在 `murmray` 中看到真实业务结果。
3. 后续幽灵模式、登录、支付都建立在这条链路上。

## 暂不优先迁移的内容

首轮不建议优先迁移：

1. 邮箱 OTP 旧登录流程
2. 源项目中已明显废弃的兼容代码
3. 与主流程无关的样式细节微调
4. 不影响主功能的历史迁移脚本

## 迁移完成定义

整个扩展迁移完成，至少满足：

1. 核心功能均已按功能单元迁移完毕。
2. 每个功能都具备对应测试。
3. 函数与关键代码均已补短注释。
4. 源项目冗余逻辑已在迁移过程中逐步清理。
5. `murmray` 可独立构建、运行、测试。
