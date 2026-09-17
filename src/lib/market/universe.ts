export type AssetClass = "index" | "equity" | "china" | "crypto";

export type Instrument = {
  symbol: string;
  name: string;
  nameZh: string;
  sector: string;
  assetClass: AssetClass;
  basePrice: number;
};

export const UNIVERSE: Instrument[] = [
  { symbol: "SPY", name: "SPDR S&P 500", nameZh: "标普500 ETF", sector: "宽基", assetClass: "index", basePrice: 560 },
  { symbol: "QQQ", name: "Invesco QQQ", nameZh: "纳指100 ETF", sector: "宽基", assetClass: "index", basePrice: 490 },
  { symbol: "DIA", name: "SPDR Dow Jones", nameZh: "道指 ETF", sector: "宽基", assetClass: "index", basePrice: 420 },
  { symbol: "IWM", name: "iShares Russell 2000", nameZh: "罗素2000 ETF", sector: "宽基", assetClass: "index", basePrice: 220 },
  { symbol: "AAPL", name: "Apple", nameZh: "苹果", sector: "科技", assetClass: "equity", basePrice: 230 },
  { symbol: "MSFT", name: "Microsoft", nameZh: "微软", sector: "科技", assetClass: "equity", basePrice: 430 },
  { symbol: "NVDA", name: "NVIDIA", nameZh: "英伟达", sector: "半导体", assetClass: "equity", basePrice: 140 },
  { symbol: "GOOGL", name: "Alphabet", nameZh: "谷歌", sector: "科技", assetClass: "equity", basePrice: 175 },
  { symbol: "AMZN", name: "Amazon", nameZh: "亚马逊", sector: "消费", assetClass: "equity", basePrice: 200 },
  { symbol: "META", name: "Meta Platforms", nameZh: "Meta", sector: "科技", assetClass: "equity", basePrice: 580 },
  { symbol: "TSLA", name: "Tesla", nameZh: "特斯拉", sector: "汽车", assetClass: "equity", basePrice: 250 },
  { symbol: "AMD", name: "Advanced Micro Devices", nameZh: "超威", sector: "半导体", assetClass: "equity", basePrice: 160 },
  { symbol: "NFLX", name: "Netflix", nameZh: "奈飞", sector: "传媒", assetClass: "equity", basePrice: 900 },
  { symbol: "AVGO", name: "Broadcom", nameZh: "博通", sector: "半导体", assetClass: "equity", basePrice: 180 },
  { symbol: "JPM", name: "JPMorgan Chase", nameZh: "摩根大通", sector: "金融", assetClass: "equity", basePrice: 220 },
  { symbol: "XOM", name: "Exxon Mobil", nameZh: "埃克森美孚", sector: "能源", assetClass: "equity", basePrice: 115 },
  { symbol: "BABA", name: "Alibaba", nameZh: "阿里巴巴", sector: "互联网", assetClass: "china", basePrice: 90 },
  { symbol: "PDD", name: "PDD Holdings", nameZh: "拼多多", sector: "互联网", assetClass: "china", basePrice: 120 },
  { symbol: "JD", name: "JD.com", nameZh: "京东", sector: "电商", assetClass: "china", basePrice: 40 },
  { symbol: "NIO", name: "NIO", nameZh: "蔚来", sector: "汽车", assetClass: "china", basePrice: 5.4 },
  { symbol: "BTC-USD", name: "Bitcoin", nameZh: "比特币", sector: "加密", assetClass: "crypto", basePrice: 68000 },
  { symbol: "ETH-USD", name: "Ethereum", nameZh: "以太坊", sector: "加密", assetClass: "crypto", basePrice: 3500 },
  { symbol: "SOL-USD", name: "Solana", nameZh: "索拉纳", sector: "加密", assetClass: "crypto", basePrice: 160 },
];

export const INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
export const WATCHLIST_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "META", "AMZN", "BABA", "BTC-USD"] as const;

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  index: "指数",
  equity: "美股",
  china: "中概",
  crypto: "加密",
};

export function getInstrument(symbol: string): Instrument {
  const normalized = decodeURIComponent(symbol).toUpperCase();
  const found = UNIVERSE.find((item) => item.symbol.toUpperCase() === normalized);
  if (found) return found;
  return {
    symbol: normalized,
    name: normalized,
    nameZh: normalized,
    sector: "其他",
    assetClass: "equity",
    basePrice: 100,
  };
}

export function isAllowedSymbol(symbol: string): boolean {
  const normalized = decodeURIComponent(symbol).toUpperCase();
  return UNIVERSE.some((item) => item.symbol.toUpperCase() === normalized);
}
