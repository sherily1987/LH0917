# 量衡 Quant

量化研究终端：行情、策略、回测和模拟组合放在同一个网页里。

## 能做什么

- **盘面**：宽基指数、自选涨跌、策略入口
- **研究**：用一句话描述意图，服务端 TypeSafe 判断接到行情、回测或模拟组合
- **行情**：美股 / ETF / 中概 / 加密日线，叠加均线
- **策略**：双均线、EMA、RSI、MACD、布林带、唐奇安、动量，以及买入持有基准
- **回测**：收盘出信号、次日开盘成交，输出收益、夏普、回撤、盈亏比和成交明细
- **模拟组合**：100 万纸上资金，按最新价成交，数据保存在浏览器本地
- **交易台**：`/desk` 上的规则引擎只用公开 BTC 行情做模拟多单

行情默认走 Yahoo Finance。若上游不可用，会回退到可复现的演示数据，页面上会标明来源。

这是研究工具，不是投资建议，也不会把订单发到真实券商。

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

## AI 模拟交易台

打开 [http://localhost:3000/desk](http://localhost:3000/desk)。

这是研究用的纸面交易，不是投资建议。亏损很常见，页面不会承诺收益，也不展示胜率。代理按公开 BTC 行情在浏览器里的模拟账本上开平多单。默认不会把订单发到交易所。

- 初始资金默认 10,000 USDT。修改后要点「重置」才会重建账本。
- 默认最多一笔持仓，仓位不超过当时净值的 20%。
- 硬止损默认离入场价 2%，止盈默认 4%。代理运行时每个行情节拍都会检查；停止后如果还有持仓，仍会继续检查这两项。
- 当日亏损达到当日起始净值的 5% 后，停止开新仓，直到下一个 UTC 日，或你手动重置。
- 「停止」会立刻不再开新仓。「立即平仓」按最新公开价卖掉模拟多单。
- 账本在这台浏览器的 localStorage 里。换浏览器或清除站点数据会丢失。`/api/desk/step` 不保存账户；Vercel 上没有共享磁盘，所以也不写服务器账本。`data/paper-ledger.json` 已忽略，留给以后的本地实验。
- 交易所密钥是可选项，只放在服务端环境变量。未配置密钥，或没有把 `DESK_LIVE_ARM` 设为 `1` 时，实盘适配器会拒绝下单。即便两项都有，当前版本也不会向交易所发单，也没有提币。

## 技术栈

Next.js App Router、Tailwind CSS、shadcn/ui、SVG 图表、TypeSafe System One。
