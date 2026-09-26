# Sổ Tài Sản

Theo dõi sổ tiết kiệm ở nhiều nơi (MB Bank, Timo, Topi…), lãi thực nhận theo năm, thuế/phí khi tất toán, và tổng tài sản gồm ETF, coin, vàng, tiền mặt.

Chạy được ở 2 nơi, dùng chung một database:

- **Website**: đăng nhập bằng nút *Log in with Telegram*.
- **Telegram Mini App**: mở từ nút menu của bot, tự đăng nhập bằng `initData`.

## Kiến trúc

```
Next.js 16 (App Router) trên Vercel
├── UI (React, client)        src/components/*
├── API routes                src/app/api/*
│   ├── auth/webapp  auth/widget   → xác thực HMAC của Telegram → cấp JWT (Bearer, 30 ngày)
│   ├── deposits  holdings         → CRUD, lọc theo owner_id = Telegram user id
│   ├── import  export             → JSON
│   ├── prices/refresh             → giá coin từ CoinGecko
│   └── cron/daily                 → Vercel Cron 08:00 VN: cập nhật giá + nhắn Telegram sổ sắp đáo hạn
└── Postgres (Neon / Supabase / tự host)   db/schema.sql
```

- Logic tính lãi dùng chung client/server: `src/lib/calc.ts` (lãi đơn, cuối kỳ, số ngày thực tế / 365).
- Chỉ Telegram id trong `ALLOWED_TELEGRAM_IDS` mới vào được. Mỗi người có dữ liệu riêng (`owner_id`).

## Deploy lên Vercel (khoảng 15 phút)

### 1. Tạo bot Telegram

Chat với [@BotFather](https://t.me/BotFather):

1. `/newbot` → đặt tên → lưu **token** và **username** của bot.

### 2. Tạo database

Chọn một trong hai:

- **Neon (dễ nhất)**: Vercel project → tab **Storage** → *Create Database* → **Neon**. Vercel tự thêm `DATABASE_URL`.
- **Supabase**: Project Settings → Database → Connection string → **Transaction pooler** (port 6543). Dán vào `DATABASE_URL`.

Bảng được **tự tạo mỗi lần Vercel deploy** (script `vercel-build` chạy `scripts/migrate.mjs` trước `next build`). Muốn tạo tay thì chạy (chạy lại nhiều lần không sao):

```bash
DATABASE_URL="postgres://..." npm run db:migrate
```

Hoặc dán nội dung `db/schema.sql` vào SQL editor của Neon/Supabase.

### 3. Deploy

1. Push code lên GitHub (repo private).
2. Vercel → *Add New Project* → import repo.
3. Thêm Environment Variables (xem `.env.example`):

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | connection string ở bước 2 |
| `TELEGRAM_BOT_TOKEN` | token từ BotFather |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | username bot, không có `@` |
| `ALLOWED_TELEGRAM_IDS` | để trống lúc đầu, xem bước 4 |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 16` |
| `COINGECKO_API_KEY` | tuỳ chọn, demo key miễn phí của CoinGecko |

4. Deploy. Ghi lại domain, ví dụ `so-tai-san.vercel.app`.

### 4. Cấu hình bot và lấy Telegram id

Trong @BotFather:

1. `/setdomain` → chọn bot → nhập `so-tai-san.vercel.app` (bắt buộc cho nút đăng nhập trên website).
2. `/mybots` → chọn bot → *Bot Settings* → *Menu Button* → nhập URL `https://so-tai-san.vercel.app` và tên nút, ví dụ `Sổ Tài Sản`.
3. (Tuỳ chọn, nên làm) `/newapp` → **chọn bot đã tạo** → tên, mô tả, ảnh 640×360, GIF `/empty`, URL app, **short name** (vd `app`). Đặt `NEXT_PUBLIC_TELEGRAM_APP_SHORTNAME=app` trên Vercel rồi Redeploy: trang đăng nhập bằng mã sẽ có nút mở thẳng Mini App, tự điền mã.

Mở bot trong Telegram → bấm **Start** (để bot được phép nhắn nhắc đáo hạn) → bấm nút menu.
Lần đầu app báo *"Tài khoản Telegram này chưa được phép. Thêm 123456789…"*. Copy số đó vào `ALLOWED_TELEGRAM_IDS` trên Vercel → **Redeploy**.

Xong. Mở web hoặc Mini App đều thấy cùng dữ liệu.

### 5. Chuyển dữ liệu từ bản artifact cũ (nếu có)

Bản cũ: *Xuất dữ liệu (JSON)* → bản mới: *Nhập JSON* ở cuối trang. Nhập là thêm mới, không ghi đè.

## Chạy local

```bash
cp .env.example .env.local   # điền biến
npm install
npm run db:migrate
npm run dev
```

Nút đăng nhập Telegram chỉ chạy trên domain đã `/setdomain`. Để test local, dùng tunnel (`cloudflared tunnel --url http://localhost:3000`) rồi đặt domain đó cho bot, hoặc mở qua Mini App với URL tunnel.

```bash
npm test          # unit test: tính lãi, validate, xác thực chữ ký Telegram
npm run typecheck
```

## Lãi bậc thang (Topi Tích luỹ linh hoạt…)

Khi thêm sổ, chọn **Kiểu lãi → Mẫu: Topi** (hoặc *Bậc thang tự nhập*). Mỗi bậc áp lãi suất riêng theo số ngày thực tế của giai đoạn;
rút trước hạn giữ đủ lãi các bậc đã xong, phần ngày của bậc đang dở tính lãi không kỳ hạn. Cột `rate` lưu lãi bình quân nếu giữ đủ kỳ.

## Ghi chú

- **Cron**: Vercel Hobby cho chạy 1 lần/ngày và có thể lệch trong khung 1 giờ. Chạy tay: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily`.
- **Giá**: coin có CoinGecko id (`bitcoin`, `ethereum`…) tự cập nhật. Vàng, ETF, cổ phiếu VN nhập tay (bấm vào ô giá).
- **Thuế**: lãi tiền gửi ngân hàng của cá nhân được miễn thuế TNCN, nên mặc định 0%. Ô thuế dành cho sản phẩm fintech/quỹ có khấu trừ.
- **Bảo mật**: token lưu ở `localStorage` trên web. Trong Mini App, mỗi lần mở đăng nhập lại bằng `initData` (hết hạn sau 24 giờ). Đổi `SESSION_SECRET` là đăng xuất tất cả.
- **Backup**: Neon/Supabase có backup theo gói. Nút *Xuất JSON* để tự giữ một bản.
