"use server";

import { revalidatePath } from "next/cache";
import { readBotConfig } from "@/lib/bot/config";
import { runBotTick } from "@/lib/bot/run";
import { getBotStore } from "@/lib/bot/store";

/** Manual runs are limited to paper mode so a page visitor cannot trigger real orders. */
export async function runPaperTickAction() {
  if (readBotConfig().mode !== "paper") return;
  await runBotTick();
  revalidatePath("/bot");
}

export async function resetPaperBotAction() {
  if (readBotConfig().mode !== "paper") return;
  const store = getBotStore();
  await store.save({ account: null, runs: [] });
  revalidatePath("/bot");
}
