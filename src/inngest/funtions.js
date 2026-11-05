import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import { gemini, createAgent } from "@inngest/agent-kit";
import Sandbox from "@e2b/code-interpreter";

// Fail fast if the key is missing.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in the server environment.");
}

// Set GEMINI_MODEL in .env.local to override. Use a model ID your key can access.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const helloWorldAgent = createAgent({
  name: "hello-world-agent",
  description: "An AI assistant that responds to user messages.",
  system: `
    You are a helpful AI assistant.
    Answer questions clearly and accurately.
    Be concise and provide useful explanations.
  `,
  model: gemini({
    model: GEMINI_MODEL,
    apiKey: GEMINI_API_KEY,
  }),
});

export const helloWorld = inngest.createFunction(
  {
    id: "hello-world",
    retries: 1,
    triggers: {
      event: "agent/hello",
    },
  },
  async ({ event, step }) => {
    // Validate first so we don't create a sandbox for a bad request.
    const userPrompt = event.data?.prompt;
    if (typeof userPrompt !== "string" || !userPrompt.trim()) {
      throw new NonRetriableError("A valid prompt is required.");
    }

    const { sandboxId, sandboxUrl } = await step.run(
      "create-sandbox",
      async () => {
        const sandbox = await Sandbox.create("vybe", {
          network: { allowPublicTraffic: true },
          timeoutMs: 10 * 60 * 1000,
        });
        return {
          sandboxId: sandbox.sandboxId,
          sandboxUrl: `https://${sandbox.getHost(3000)}`,
        };
      },
    );

    // Do NOT wrap this in step.run: agent-kit already makes each model call
    // a durable Inngest step, and nesting steps makes the run hang.
    let agentResult;
    try {
      agentResult = await helloWorldAgent.run(userPrompt);
    } catch (err) {
      console.error("run-agent failed:", err);
      throw err;
    }

    const assistantMessage = [...(agentResult.output ?? [])]
      .reverse()
      .find((m) => m.role === "assistant" && m.type === "text");

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

    return {
      success: true,
      prompt: userPrompt,
      answer,
      sandboxId,
      sandboxUrl,
    };
  },
);
