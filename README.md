# 量衡 Quant

量化研究终端：行情、策略、回测和模拟组合放在同一个网页里。

## 能做什么

- **盘面**：宽基指数、自选涨跌、策略入口
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

## 技术栈

Next.js App Router、Tailwind CSS、shadcn/ui、TradingView Lightweight Charts。
