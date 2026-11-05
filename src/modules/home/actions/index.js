"use server";

import { inngest } from "@/inngest/client";

export const onInvoke = async (prompt) => {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("A valid prompt is required.");
  }

  // Event name and data shape must match the code-agent function:
  // triggers: { event: "code-agent/run" } and event.data.value
  const { ids } = await inngest.send({
    name: "code-agent/run",
    data: {
      value: prompt.trim(),
    },
  });

  return {
    success: true,
    eventId: ids[0],
  };
};
