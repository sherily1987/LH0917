# 量衡 Quant

量化研究终端：行情、策略、回测和模拟组合放在同一个网页里。

## 能做什么

- **盘面**：宽基指数、自选涨跌、策略入口
- **研究**：用一句话描述意图，服务端 TypeSafe 判断接到行情、回测或模拟组合
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

复制 `.env.example` 为 `.env.local`，填入 TypeSafe 密钥后，盘面上的研究输入才会解析意图。没有密钥时仍可手动走行情、回测和组合。

## TypeSafe

研究路由把自然语言映射到本终端已有的页面，而不是再生成一段说明。

1. 在 [console.typesafe.ai](https://console.typesafe.ai) 创建 API 密钥。
2. 本地写入 `.env.local` 的 `TYPESAFE_API_KEY`。生产环境加到 Vercel 项目环境变量，不要提交密钥。
3. 问题和阈值集中在 `src/lib/typesafe/questions.ts`。组合逻辑在 `src/lib/typesafe/route.ts`，用单元测试覆盖，不打真实 API。
4. 阈值是这个终端的起始值，不是通用规则。换一批真实问法后再调整。

密钥只在服务端使用。客户端表单以 GET 提交到 `/research?q=`。

## 技术栈

Next.js App Router、Tailwind CSS、shadcn/ui、SVG 图表、TypeSafe System One。
