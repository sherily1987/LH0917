import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BotState } from "@/lib/bot/types";

export type BotStore = {
  kind: "redis" | "file" | "memory";
  load(): Promise<BotState>;
  save(state: BotState): Promise<void>;
  /** Returns false when another run already holds the lock. */
  lock(ttlSeconds: number): Promise<boolean>;
  unlock(): Promise<void>;
};

const STATE_KEY = "lh-quant:bot:state";
const LOCK_KEY = "lh-quant:bot:lock";
const MAX_RUNS = 50;

export const EMPTY_STATE: BotState = { account: null, runs: [] };

function trimmed(state: BotState): BotState {
  return { ...state, runs: state.runs.slice(0, MAX_RUNS) };
}

function parse(raw: string | null | undefined): BotState {
  if (!raw) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(raw) as BotState;
    return { account: parsed.account ?? null, runs: Array.isArray(parsed.runs) ? parsed.runs : [] };
  } catch {
    return EMPTY_STATE;
  }
}

function redisStore(url: string, token: string): BotStore {
  async function command<T>(args: Array<string | number>): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Redis ${args[0]} 失败：HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(`Redis ${args[0]} 失败：${payload.error}`);
    return payload.result as T;
  }
  return {
    kind: "redis",
    load: async () => parse(await command<string | null>(["GET", STATE_KEY])),
    save: async (state) => {
      await command(["SET", STATE_KEY, JSON.stringify(trimmed(state))]);
    },
    lock: async (ttl) => (await command<string | null>(["SET", LOCK_KEY, Date.now(), "NX", "EX", ttl])) === "OK",
    unlock: async () => {
      await command(["DEL", LOCK_KEY]);
    },
  };
}

function fileStore(dir: string): BotStore {
  const statePath = path.join(dir, "bot-state.json");
  const lockPath = path.join(dir, "bot.lock");
  return {
    kind: "file",
    load: async () => parse(await readFile(statePath, "utf8").catch(() => null)),
    save: async (state) => {
      await mkdir(dir, { recursive: true });
      await writeFile(statePath, JSON.stringify(trimmed(state), null, 2));
    },
    lock: async (ttl) => {
      await mkdir(dir, { recursive: true });
      const held = await readFile(lockPath, "utf8").catch(() => null);
      if (held && Date.now() - Number(held) < ttl * 1000) return false;
      await writeFile(lockPath, String(Date.now()));
      return true;
    },
    unlock: async () => {
      await rm(lockPath, { force: true });
    },
  };
}

export function memoryStore(initial: BotState = EMPTY_STATE): BotStore {
  let state = initial;
  let locked = false;
  return {
    kind: "memory",
    load: async () => state,
    save: async (next) => {
      state = trimmed(next);
    },
    lock: async () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    unlock: async () => {
      locked = false;
    },
  };
}

export function getBotStore(): BotStore {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(url, token);
  const dir = process.env.VERCEL ? "/tmp/lh-quant" : path.join(process.cwd(), ".data");
  return fileStore(dir);
}
