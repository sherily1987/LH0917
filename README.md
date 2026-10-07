# 量衡 Quant

量化研究终端：行情、策略、回测和模拟组合放在同一个网页里。

## 能做什么

- **盘面**：宽基指数、自选涨跌、策略入口
- **研究**：用一句话描述意图，服务端 TypeSafe 判断接到行情、回测或模拟组合
- **行情**：美股 / ETF / 中概 / 加密日线，叠加均线
- **策略**：双均线、EMA、RSI、MACD、布林带、唐奇安、动量，以及买入持有基准
- **回测**：收盘出信号、次日开盘成交，输出收益、夏普、回撤、盈亏比和成交明细
- **模拟组合**：100 万纸上资金，按最新价成交，数据保存在浏览器本地
- **自动交易**：Grok 全权决定加密货币买卖，代码只做硬性风控；默认模拟盘，可切换到交易所实盘

行情默认走 Yahoo Finance。若上游不可用，会回退到可复现的演示数据，页面上会标明来源。

研究、回测和组合页面不会把订单发到真实券商；只有自动交易在 `BOT_MODE=live` 时会真实下单。以上都不是投资建议。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

```bash
npm test
npm run build
```

复制 `.env.example` 为 `.env.local`，填入 TypeSafe 密钥后，盘面上的研究输入才会解析意图。没有密钥时仍可手动走行情、回测和组合。

## TypeSafe

研究路由把自然语言映射到本终端已有的页面，而不是再生成一段说明。

1. 在 [console.typesafe.ai](https://console.typesafe.ai) 创建 API 密钥。
2. 本地写入 `.env.local` 的 `TYPESAFE_API_KEY`。生产环境加到 Vercel 项目环境变量，不要提交密钥。
3. 问题和阈值集中在 `src/lib/typesafe/questions.ts`。组合逻辑在 `src/lib/typesafe/route.ts`，用单元测试覆盖，不打真实 API。
4. 阈值是这个终端的起始值，不是通用规则。换一批真实问法后再调整。

密钥只在服务端使用。客户端表单以 GET 提交到 `/research?q=`。解析后页面会画出 Choice 概率条和 Noul 点名程度，再点「前往」进入对应页。官方对照界面是 [TypeSafe Playground](https://console.typesafe.ai/playground)。

## 自动交易机器人

`/bot` 页面和 `/api/bot/tick` 是一个全自动的加密货币交易循环，不需要人工确认：

1. 拉取 9 个币种的日线，算出涨跌幅、RSI、均线偏离、波动率、30 日高低点和量比。
2. 把账户、持仓、最近几轮决策和这些特征交给 Grok（`BOT_MODEL`，默认 `spacexai/grok-4.7`，走 Vercel AI Gateway）。
3. Grok 自己决定买什么、卖什么、各买卖多少，或者这一轮不动。
4. 代码只做硬性风控：单笔上限、单币持仓上限、最低现金比例，以及当日亏损或净值回撤超限后禁止买入（卖出始终允许）。超出的部分会被截断，不会替 AI 改方向。
5. 执行并记录：模拟盘按最新价加手续费和滑点成交；实盘用 ccxt 下市价单，下单后从交易所同步余额。

### 上线步骤

1. 先跑模拟盘（默认 `BOT_MODE=paper`）。本地设置 `AI_GATEWAY_API_KEY` 后，在 `/bot` 点「立即运行一轮」。
2. 部署到 Vercel：在 Marketplace 接入 Upstash Redis（自动注入 `KV_REST_API_URL` / `KV_REST_API_TOKEN`），设置 `CRON_SECRET`。`vercel.json` 每天 00:05 UTC 触发一次；Hobby 计划最多每天一次，Pro 可以改得更频繁。
3. 交易所测试网：`BOT_MODE=live`，`BOT_EXCHANGE_SANDBOX=true`（默认），填测试网的 `EXCHANGE_API_KEY` / `EXCHANGE_API_SECRET`（OKX 还要 `EXCHANGE_API_PASSWORD`）。
4. 小额实盘：`BOT_EXCHANGE_SANDBOX=false`。API 密钥只开交易权限，关闭提现，绑定 IP 白名单。

`BOT_ENABLED=false` 立即停止所有自动交易。全部变量和默认值见 `.env.example`。

默认交易所是 OKX：币安对美国 IP 返回 451，而 Vercel 函数默认在美国区域运行。实盘模式下手动按钮会隐藏，只有带 `CRON_SECRET` 的请求能触发下单。

大模型训练时见过历史行情，回测会偏乐观，判断它好不好只能看向前跑出来的模拟盘结果。

## 技术栈

Next.js App Router、Tailwind CSS、shadcn/ui、SVG 图表、TypeSafe System One。
