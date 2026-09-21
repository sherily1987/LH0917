import {
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
  TypeSafeClient,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import { buildBtcQuestions } from "@/lib/typesafe/questions";
import type { BtcSnapshot } from "@/lib/typesafe/snapshot";

export function getTypeSafeClient(): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
  });
}

export async function judgeBtcSnapshot(snapshot: BtcSnapshot) {
  const client = getTypeSafeClient();
  const { answers } = await client.systemOne({
    state: snapshot,
    questions: buildBtcQuestions(),
  });
  return answers;
}

export function describeTypeSafeError(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return "TypeSafe 密钥无效。请检查服务端的 TYPESAFE_API_KEY。";
  }
  if (error instanceof RateLimitError) {
    return "TypeSafe 请求过于频繁，请稍后再试。";
  }
  if (error instanceof APIConnectionError) {
    return "无法连接 TypeSafe，请稍后重试。";
  }
  if (error instanceof TypeSafeError) {
    return "TypeSafe 无法判断这次行情快照，请稍后重试。";
  }
  return "BTC 决策失败，请稍后重试。";
}
