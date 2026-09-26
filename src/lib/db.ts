import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu biến môi trường DATABASE_URL");
  return postgres(url, {
    max: 3, // serverless: giữ ít kết nối; dùng pooled URL của Neon/Supabase
    idle_timeout: 20,
    prepare: false, // an toàn với pgbouncer/transaction pooler
    transform: { undefined: null },
  });
}

/** Lazy singleton, tái sử dụng giữa các lần gọi trong cùng instance. */
export function sql() {
  globalThis.__sql ??= create();
  return globalThis.__sql;
}
