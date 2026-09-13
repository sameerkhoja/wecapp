import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

function postgresQuery(sqlText) {
  let index = 0;
  return sqlText.replace(/\?/g, () => `$${++index}`);
}

function postgresAdapter(sql) {
  return {
    dialect: "postgres",
    prepare(statement) {
      const query = postgresQuery(statement);
      return {
        async get(...params) {
          return (await sql.unsafe(query, params))[0] || undefined;
        },
        async all(...params) {
          return [...(await sql.unsafe(query, params))];
        },
        async run(...params) {
          const result = await sql.unsafe(query, params);
          return { changes: result.count ?? result.length };
        },
      };
    },
    async exec(statement) {
      await sql.unsafe(statement);
    },
    async transaction(callback) {
      return sql.begin(async (tx) => callback(postgresAdapter(tx)));
    },
    async close() {
      await sql.end();
    },
  };
}

async function sqliteAdapter(filePath) {
  const { DatabaseSync } = await import("node:sqlite");
  if (filePath !== ":memory:")
    mkdirSync(dirname(filePath), { recursive: true });
  const sqlite = new DatabaseSync(filePath);
  sqlite.exec(
    "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  let queue = Promise.resolve();
  const adapter = {
    dialect: "sqlite",
    prepare(statement) {
      return sqlite.prepare(statement);
    },
    exec(statement) {
      return sqlite.exec(statement);
    },
    async transaction(callback) {
      let release;
      const before = queue;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await before;
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await callback(adapter);
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      } finally {
        release();
      }
    },
    close() {
      sqlite.close();
    },
  };
  return adapter;
}

export async function openDatabase(
  path = process.env.DATABASE_PATH || "data/wecapp.sqlite",
) {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
    throw new Error("Production requires DATABASE_URL");
  return process.env.DATABASE_URL
    ? postgresAdapter(
        postgres(process.env.DATABASE_URL, {
          ssl: "require",
          max: 5,
          prepare: false,
        }),
      )
    : sqliteAdapter(path);
}
