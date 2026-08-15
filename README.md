# Rebirth Football · 重生世界杯

> 一个以 2026 世界杯历史赛程为时间轴的移动端互动决策游戏。

**Online Demo:** https://worldcup-rebirth.pages.dev/

这是一个个人独立项目。我负责产品构思、玩法设计、交互逻辑、数据整理、部署与迭代，并使用 AI / Codex 辅助完成代码实现、调试和工程化工作。

> 本项目仅使用虚拟积分进行历史赛事决策模拟，不提供充值、提现、兑奖或购彩服务。

## 项目简介

玩家带着 **100 初始积分**“重回”2026 世界杯，从小组赛一路推进至淘汰赛与决赛。游戏按照真实赛事日期推进，结合历史赛果与固定奖金数据，让玩家在不知道后续结果的前提下做出每日选择，并通过积分变化解锁不同身份阶段。

项目目前已经覆盖 **104 场世界杯比赛**，并围绕移动端体验、历史数据完整性、用户授权和数字产品交付流程进行了多轮迭代。

## 核心体验

- **1 分钟记忆挑战**：开局展示 104 场赛事与赛果，随后进入“重生”流程。
- **按比赛日推进**：每天可选择参与，也可直接跳过并进入下一比赛日。
- **多玩法决策**：支持胜平负、让球、比分、总进球、半全场等历史玩法。
- **复式选择**：同场支持多选，再次点击可取消；每个选项独立计为一注。
- **动态倍数**：基础单位为 2 积分/注，每场可独立调整倍数或选择“本场全投”。
- **身份成长系统**：积分变化对应“普通球迷 → 足球懂哥 → 世界杯预言家 → 时间旅行者”等阶段。
- **失败与重开**：当余额不足最低投注单位时，本轮重生结束，可重新开始。
- **移动端优先**：页面、交互和信息层级以手机浏览器为主要使用场景设计。

## 数据与完整性

项目内置 2026 世界杯 104 场赛程/赛果，并对历史固定奖金数据进行单独采集、解析和校验。

数据管线包括：

- 104 场赛程与赛果
- 历史赛前 1X2 数据
- 逐分钟比赛事件与半场信息
- 胜平负 / 让球胜平负
- 31 项比分
- 0–7+ 总进球
- 9 项半全场

生成流程要求 **104/104 场完整通过校验** 后才输出正式前端数据，避免以模拟值冒充缺失的历史数据。

## 用户授权与交付

为了验证数字产品交付场景，项目加入了轻量级“重生码”授权系统：

- 每位用户使用独立重生码激活
- 一个重生码最多授权 **3 个浏览器/设备环境**
- 首次激活后保存匿名设备 ID 和会话凭证
- 后续访问可免重复输入重生码
- 管理端支持生成重生码与重置设备绑定
- 不要求手机号、账号或实名信息

敏感管理密钥保存在 Cloudflare Secret 中，不写入前端代码或公开仓库。

## 技术栈

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- LocalStorage / Session Storage

### Serverless & Deployment

- Cloudflare Pages
- Cloudflare Pages Functions
- Cloudflare Workers KV
- GitHub Actions

### Data Engineering

- Python
- 历史网页数据抓取与解析
- CSV / JSON / JavaScript 数据生成
- 104 场完整性校验

### Development Workflow

- Git / GitHub 版本管理
- VS Code
- AI / Codex 辅助需求拆解、代码实现、调试与重构

## 工程架构

```text
Historical match data
        │
        ▼
Python collection / parsing / validation
        │
        ▼
Validated 104-match dataset
        │
        ├──────────────► Frontend game data
        │
        ▼
GitHub repository
        │
        ▼
Cloudflare Pages
        │
        ├── Static game frontend
        └── Pages Functions
               │
               ▼
          Workers KV
          activation codes / sessions
```

## 目录结构

```text
worldcup-rebirth/
├─ index.html                 # 游戏入口
├─ style.css                  # 移动端视觉与交互样式
├─ app.js                     # 核心游戏状态与交互逻辑
├─ auth-client.js             # 玩家端授权逻辑
├─ data-core.js               # 球队与基础数据
├─ data-01.js ... data-07.js  # 104 场赛事数据
├─ sporttery-fixed.js         # 校验后的历史固定奖金数据
├─ functions/                 # Cloudflare Pages Functions
│  ├─ admin.js                # 管理端页面
│  └─ api/                    # 激活、验证、管理接口
├─ data_raw/                  # 原始历史数据归档
├─ *.py                       # 数据抓取 / 解析 / 生成脚本
└─ .github/workflows/         # 数据任务与自动化流程
```

## 我的职责

这是一个 **Individual Project / 独立项目**，主要负责：

1. 从“重生世界杯”概念出发完成产品定位、核心玩法和用户流程设计。
2. 将 104 场历史赛事、赔率与比赛事件整理为可复用的游戏数据结构。
3. 设计移动端多玩法选择、复式投注、倍数控制、每日推进、积分等级等交互逻辑。
4. 使用 Cloudflare Pages + Functions + KV 搭建轻量级无账号授权方案。
5. 使用 Git/GitHub 管理版本，并通过连续 commit 记录问题修复和功能迭代。
6. 使用 AI / Codex 辅助开发，将自然语言需求拆分为代码任务，并进行调试、验证和持续优化。

## 这个项目重点验证了什么

相比“完成一个网页”，这个项目更关注从想法到可运行产品的完整闭环：

- **产品化**：把一个内容创意转化为可连续游玩的交互流程。
- **数据可靠性**：构建历史数据采集、映射与完整性验证流程。
- **用户体验**：针对手机端反复调整页面长度、信息层级和投注交互。
- **工程交付**：从 GitHub 版本管理到 Cloudflare 自动部署与 Serverless API。
- **AI 协作开发**：在非计算机专业背景下，通过需求拆解、验证和迭代完成完整数字产品。

## 项目状态

当前版本仍在持续优化中，重点包括：

- 移动端兼容性与大陆网络访问测试
- 授权与设备管理体验
- 管理后台可视化
- 代码与数据结构进一步整理

## License

Copyright © 2026 You-Lin Zhang.

This repository is provided for portfolio and technical review purposes. Unauthorized copying, redistribution, resale, or commercial reuse is prohibited. See `LICENSE` for details.
