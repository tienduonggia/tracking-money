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

/** Một lần mua / bán tài sản. price = giá mỗi đơn vị (VND), fee = phí giao dịch. */
export interface HoldingTxn {
  id: string;
  date: string;
  kind: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  note: string;
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
  priceSource: string; // '' | 'coingecko:<id>' | 'vangtoday:<CODE>:<chi|luong>'
  txns: HoldingTxn[]; // rỗng = tài sản nhập kiểu cũ (qty/cost nhập tay)
  priceKey: string; // liên kết dòng Giá thị trường; '' = giá riêng nhập tay
  note: string;
}

export type DepositInput = Omit<Deposit, "id">;
export type HoldingInput = Omit<Holding, "id">;

/* ---------- Tích luỹ không kỳ hạn ---------- */
export type Compounding = "daily" | "monthly" | "none"; // lãi nhập gốc hằng ngày / hằng tháng / chỉ trả khi rút

export interface FlexRate {
  from: string; // YYYY-MM-DD, áp dụng từ ngày này
  rate: number; // %/năm
}

export type FlexTxnKind = "deposit" | "withdraw" | "adjust";

export interface FlexTxn {
  id: string;
  date: string;
  kind: FlexTxnKind;
  amount: number; // deposit/withdraw: > 0; adjust: +/- (khớp số dư với app ngân hàng, tính vào lời)
  external: boolean; // true = tiền mới vào / đem đi tiêu; false = chuyển nội bộ (tiền chờ, sổ khác)
  note: string;
}

export interface FlexAccount {
  id: string;
  institution: string;
  name: string;
  compounding: Compounding;
  taxPct: number;
  rates: FlexRate[]; // tăng dần theo from
  txns: FlexTxn[];
  note: string;
}
export type FlexInput = Omit<FlexAccount, "id">;

/** Giá thị trường dùng chung cho các tài sản cùng loại. */
export interface MarketPrice {
  id: string;
  key: string;
  label: string;
  unit: string;
  source: string; // '' nhập tay | 'vangtoday:CODE:chi|luong' | 'coingecko:id'
  price: number;
  priceDate: string | null;
}
export type MarketPriceInput = Omit<MarketPrice, "id">;
