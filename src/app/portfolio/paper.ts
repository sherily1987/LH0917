export type PaperPosition = { symbol: string; quantity: number; avgPrice: number };
export type PaperOrder = {
  id: string;
  time: number;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
};
export type PaperState = { cash: number; positions: PaperPosition[]; orders: PaperOrder[] };

export const STARTING_CASH = 1_000_000;
export const EMPTY_PAPER: PaperState = { cash: STARTING_CASH, positions: [], orders: [] };
