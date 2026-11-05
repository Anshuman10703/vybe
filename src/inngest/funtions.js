import { inngest } from "./client";
import { gemini, createAgent } from "@inngest/agent-kit";

const helloWorldAgent = createAgent({
  name: "hello-world-agent",
  description: "An AI assistant that responds to user messages.",

  system: `
    You are a helpful AI assistant.
    Answer questions clearly and accurately.
    Be concise and provide useful explanations.
  `,

  model: gemini({
    model: "gemini-3.5-flash-lite",
  }),
});

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    triggers: {
      event: "agent/hello",
    },
  },
  async ({ event }) => {
    const userPrompt = event.data?.prompt;

    if (typeof userPrompt !== "string" || !userPrompt.trim()) {
      throw new Error("A valid prompt is required.");
    }

    console.log("USER PROMPT:", userPrompt);

    const agentResult = await helloWorldAgent.run(userPrompt);

    console.log("FULL AGENT RESULT:", JSON.stringify(agentResult, null, 2));

    const assistantMessage = [...(agentResult.output ?? [])]
      .reverse()
      .find(
        (message) => message.role === "assistant" && message.type === "text",
      );

    if (!assistantMessage) {
      throw new Error(
        "Agent completed without generating an assistant response.",
      );
    }

    const answer = Array.isArray(assistantMessage.content)
      ? assistantMessage.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n")
      : assistantMessage.content;

    console.log("GENERATED ANSWER:", answer);

    return {
      success: true,
      prompt: userPrompt,
      answer,
    };
  },
);
