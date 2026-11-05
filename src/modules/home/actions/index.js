"use server";

import { inngest } from "@/inngest/client";

export const onInvoke = async (prompt) => {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("A valid prompt is required.");
  }

  const { ids } = await inngest.send({
    name: "agent/hello",
    data: {
      prompt: prompt.trim(),
    },
  });

  return {
    success: true,
    eventId: ids[0],
  };
};
