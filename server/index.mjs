import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { openDatabase } from "./db.mjs";
import { createApp } from "./app.mjs";
const db = await openDatabase();
const app = await createApp(db);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(Number(process.env.PORT || 5174), "0.0.0.0", () =>
  console.log(`Wecapp ready at http://localhost:${process.env.PORT || 5174}`),
);
async function shutdown() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
