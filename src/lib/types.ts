/** Một bậc lãi: áp lãi suất `rate` từ mốc bậc trước đến hết tháng thứ `upToMonth` kể từ ngày gửi. */
export interface Tier {
  upToMonth: number;
  rate: number; // %/năm
}

export type DepositStatus = "active" | "closed";
export type CloseType = "matured" | "early";

export interface Deposit {
  id: string;
  institution: string;
  label: string;
  principal: number;
  rate: number; // %/năm (sổ bậc thang: lãi bình quân nếu giữ đủ kỳ)
  tiers: Tier[] | null; // null = lãi cố định
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
  payout: "cash" | "none" | null; // tiền nhận về khi tất toán đã ghi chưa
  newMoney: number | null; // phần gốc là vốn mới bỏ vào; null = suy ra (tái tục → 0, còn lại → cả gốc)
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
