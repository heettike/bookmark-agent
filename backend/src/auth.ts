import type { Context, Next } from "hono";

type Bindings = {
  DB: D1Database;
  AUTH_SECRET: string;
};

// simple API key auth
export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ ok: false, error: "missing api key" }, 401);
  }

  const apiKey = authHeader.slice(7);
  const keyHash = await hashKey(apiKey);

  const user = await c.env.DB.prepare(
    "SELECT id FROM users WHERE api_key_hash = ?"
  ).bind(keyHash).first();

  if (!user) {
    return c.json({ ok: false, error: "invalid api key" }, 401);
  }

  c.set("userId" as never, user.id as never);
  await next();
}

export async function handleRegister(c: Context<{ Bindings: Bindings }>) {
  const { email } = await c.req.json();

  if (!email || !email.includes("@")) {
    return c.json({ ok: false, error: "valid email required" }, 400);
  }

  // check if exists
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email).first();

  if (existing) {
    return c.json({ ok: false, error: "email already registered" }, 409);
  }

  const id = crypto.randomUUID();
  const apiKey = generateApiKey();
  const keyHash = await hashKey(apiKey);

  await c.env.DB.prepare(
    "INSERT INTO users (id, email, api_key_hash, created_at) VALUES (?, ?, ?, ?)"
  ).bind(id, email, keyHash, Math.floor(Date.now() / 1000)).run();

  return c.json({ ok: true, api_key: apiKey });
}

export async function handleLogin(c: Context<{ Bindings: Bindings }>) {
  const { email } = await c.req.json();

  if (!email) {
    return c.json({ ok: false, error: "email required" }, 400);
  }

  const user = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email).first();

  if (!user) {
    return c.json({ ok: false, error: "not found" }, 404);
  }

  // generate new API key (invalidates old one)
  const apiKey = generateApiKey();
  const keyHash = await hashKey(apiKey);

  await c.env.DB.prepare(
    "UPDATE users SET api_key_hash = ? WHERE id = ?"
  ).bind(keyHash, user.id).run();

  return c.json({ ok: true, api_key: apiKey });
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "bma_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
