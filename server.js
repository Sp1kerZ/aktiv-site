import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.disable("x-powered-by");

app.use(express.static(".", { extensions: ["html"] }));

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error("DATABASE_URL is not set");
    err.statusCode = 500;
    throw err;
  }
  return url;
}

app.get("/api/logs", async (_req, res) => {
  let pool;
  try {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    });

    const { rows } = await pool.query(`
      select
        group_id,
        message_id as "messageId",
        user_id as "userId",
        name,
        username,
        timestamp,
        type,
        text,
        caption
      from logs
      order by timestamp desc
      limit 1000
    `);

    const groups = { "1": [], "2": [] };
    for (const row of rows) {
      const g = String(row.group_id ?? "");
      if (!groups[g]) groups[g] = [];
      groups[g].push({
        messageId: row.messageId ?? null,
        userId: row.userId ?? null,
        name: row.name ?? null,
        username: row.username ?? null,
        timestamp: row.timestamp ?? null,
        type: row.type ?? null,
        text: row.text ?? null,
        caption: row.caption ?? null,
      });
    }

    res.json({ groups });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({
      error: "DB_ERROR",
      message,
      hint:
        "Проверьте DATABASE_URL (в env на Railway) и схему таблицы. По умолчанию ожидается таблица logs.",
    });
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`[aktiv-2.0] http://localhost:${port}`);
});
