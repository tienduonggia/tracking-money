export type DepositStatus = "active" | "closed";
export type CloseType = "matured" | "early";

export interface Deposit {
  id: string;
  institution: string;
  label: string;
  principal: number;
  rate: number; // %/năm
  termMonths: number;
  openDate: string; // YYYY-MM-DD
  maturityDate: string;
  earlyRate: number;
  taxPct: number;
  note: string;
  status: DepositStatus;
  closeDate: string | null;
  closeType: CloseType | null;
  interest: number | null;
  tax: number | null;
  fee: number | null;
  renewedFrom: string | null;
}

export type HoldingType = "etf" | "stock" | "coin" | "gold" | "cash" | "other";

export interface Holding {
  id: string;
  type: HoldingType;
  name: string;
  place: string;
  qty: number;
  unit: string;
  cost: number;
  price: number;
  priceDate: string | null;
  priceSource: string; // '' | 'coingecko:<id>'
  note: string;
}

export type DepositInput = Omit<Deposit, "id">;
export type HoldingInput = Omit<Holding, "id">;
