import { auth } from "@clerk/nextjs/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";

import db from "@/lib/db";

export const FREE_POINTS = 5;
export const PRO_POINTS = 100;

export const DURATION = 30 * 24 * 60 * 60;

export const GENERATION_COST = 1;

export async function getUsageTracker() {
  const { userId, has } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const hasPro = has({ plan: "pro" });

  return new RateLimiterPrisma({
    storeClient: db,
    tableName: "Usage",
    points: hasPro ? PRO_POINTS : FREE_POINTS,
    duration: DURATION,
  });
}

export async function consumeCredits() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("User not authenticated");
  }

  const tracker = await getUsageTracker();

  return tracker.consume(userId, GENERATION_COST);
}

export async function getUsageStatus() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const tracker = await getUsageTracker();

  return tracker.get(userId);
}
