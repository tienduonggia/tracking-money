-- Sổ Tài Sản schema. Chạy lại nhiều lần vẫn an toàn (idempotent).

create table if not exists deposits (
  id             uuid primary key default gen_random_uuid(),
  owner_id       bigint        not null,            -- Telegram user id
  institution    text          not null,
  label          text          not null default '',
  principal      numeric(18,0) not null check (principal > 0),
  rate           numeric(7,3)  not null check (rate >= 0),       -- %/năm
  term_months    integer       not null default 0,               -- 0 = tự nhập ngày đáo hạn
  open_date      date          not null,
  maturity_date  date          not null,
  early_rate     numeric(7,3)  not null default 0.5,             -- lãi không kỳ hạn khi rút trước hạn
  tax_pct        numeric(7,3)  not null default 0,
  note           text          not null default '',
  status         text          not null default 'active' check (status in ('active','closed')),
  close_date     date,
  close_type     text check (close_type in ('matured','early')),
  interest       numeric(18,0),                                  -- lãi nhận trước thuế/phí
  tax            numeric(18,0),
  fee            numeric(18,0),
  renewed_from   uuid references deposits(id) on delete set null,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  constraint maturity_after_open check (maturity_date > open_date),
  constraint closed_has_close_info check (status = 'active' or (close_date is not null and close_type is not null))
);
create index if not exists deposits_owner_idx on deposits (owner_id, status, maturity_date);

create table if not exists holdings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      bigint        not null,
  type          text          not null check (type in ('etf','stock','coin','gold','cash','other')),
  name          text          not null,
  place         text          not null default '',
  qty           numeric(30,10) not null check (qty >= 0),
  unit          text          not null default '',
  cost          numeric(18,0) not null default 0,               -- tổng vốn đã bỏ
  price         numeric(24,6) not null default 0,               -- giá hiện tại / đơn vị (VND)
  price_date    date,
  price_source  text          not null default '',              -- '' = nhập tay, 'coingecko:<id>' = tự động
  note          text          not null default '',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index if not exists holdings_owner_idx on holdings (owner_id);
