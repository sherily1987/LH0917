# 量衡 Quant

量化研究终端：行情、策略、回测、模拟组合，以及比特币纸上决策。

## 能做什么

- **盘面**：宽基指数、自选涨跌、策略入口
- **BTC 决策**：代码先算比特币指标和策略信号，Jev 给出纸上做多 / 减仓 / 观望，你确认后才改模拟组合
- **行情**：美股 / ETF / 中概 / 加密日线，叠加均线
- **策略**：双均线、EMA、RSI、MACD、布林带、唐奇安、动量，以及买入持有基准
- **回测**：收盘出信号、次日开盘成交，输出收益、夏普、回撤、盈亏比和成交明细
- **模拟组合**：100 万纸上资金，按最新价成交，数据保存在浏览器本地

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

复制 `.env.example` 为 `.env.local`，填入 TypeSafe 密钥后，BTC 决策台才会调用 Jev。没有密钥时仍可看本终端算出的指标，并手动走行情、回测和组合。

## TypeSafe / Jev

Jev 用来给 **BTC 纸上交易**做结构化判断，而不是把一句话路由到某个菜单。

工作流：

1. 代码拉取 `BTC-USD` 日线，计算 RSI、均线、MACD、布林、ATR，以及各策略模板的最新目标仓位。
2. 这份快照作为 TypeSafe `state`。问题和阈值集中在 `src/lib/typesafe/questions.ts`。
3. 一次请求并行问立场（Choice）、更贴近的策略（Choice）、持有周期（Choice）、趋势/震荡/拉伸（Score），以及是否趋势市、是否该回避新风险等（Noul）。
4. `src/lib/typesafe/decision.ts` 用置信和 Noul 门槛组合成可执行的纸上建议。单元测试覆盖组合逻辑，不打真实 API。
5. 页面画出概率条。只有你点「确认纸上买入/卖出」才会改模拟组合。

阈值是这个终端的起始值，不是通用规则。对照实盘快照后再调整。

密钥只在服务端使用。官方对照界面是 [TypeSafe Playground](https://console.typesafe.ai/playground)。

## 技术栈

Next.js App Router、Tailwind CSS、shadcn/ui、SVG 图表、TypeSafe System One（Jev）。
