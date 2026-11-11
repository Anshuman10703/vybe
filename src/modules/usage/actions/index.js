"use server";

import { auth } from "@clerk/nextjs/server";
import { DURATION, FREE_POINTS, PRO_POINTS, getUsageStatus } from "@/lib/usage";

export const status = async () => {
  try {
    const { userId, has } = await auth();
    if (!userId) return null;

    const result = await getUsageStatus();
    const hasPro = has({ plan: "pro" });
    const total = hasPro ? PRO_POINTS : FREE_POINTS;

    return {
      remainingPoints: result ? result.remainingPoints : total,
      msBeforeNext: result ? result.msBeforeNext : DURATION * 1000,
      total,
    };
  } catch (error) {
    console.error("usage status failed:", error);
    return null;
  }
};
