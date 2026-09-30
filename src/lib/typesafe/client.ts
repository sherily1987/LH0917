import {
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
  TypeSafeClient,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import { asDirectionLean, type DirectionAnswers } from "@/lib/jev/decide";
import { buildDirectionQuestions } from "@/lib/jev/questions";
import type { DirectionTape } from "@/lib/jev/tape";
import { buildResearchQuestions, buildResearchState } from "@/lib/typesafe/questions";

export function getTypeSafeClient(): TypeSafeClient {
  return new TypeSafeClient({
    apiKey: process.env.TYPESAFE_API_KEY,
  });
}

export async function classifyResearchRequest(query: string) {
  const client = getTypeSafeClient();
  const { answers } = await client.systemOne({
    state: buildResearchState(query),
    questions: buildResearchQuestions(),
  });
  return answers;
}

export async function judgeDirection(tape: DirectionTape): Promise<DirectionAnswers> {
  const client = getTypeSafeClient();
  const { answers } = await client.systemOne({
    state: { tape },
    questions: buildDirectionQuestions(),
  });
  return {
    lean: {
      choice: asDirectionLean(answers.lean.choice),
      confidence: answers.lean.confidence,
      probabilities: answers.lean.probabilities,
    },
    factsAgree: { noul: answers.factsAgree.noul },
    conflict: { noul: answers.conflict.noul },
    stretched: { noul: answers.stretched.noul },
  };
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
    return "TypeSafe 无法解析这次请求，请换种说法再试。";
  }
  return "研究意图解析失败，请稍后重试。";
}
