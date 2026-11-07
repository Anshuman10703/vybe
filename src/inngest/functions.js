import { inngest } from "./client";
import {
  gemini,
  createAgent,
  createTool,
  createNetwork,
} from "@inngest/agent-kit";
import { NonRetriableError } from "inngest";
import Sandbox from "@e2b/code-interpreter";
import { z } from "zod";
import { PROMPT } from "@/prompt";
import { lastAssistantTextMessageContent } from "./utils";
import db from "@/lib/db";
import { MessageRole, MessageType } from "@/generated/prisma/client";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in the server environment.");
}

// Use a model ID your key can access (same one that worked for hello-world).
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

// The agent loop can take several minutes; the e2b default timeout is short.
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;

export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    retries: 1,
    // Same trigger format as your working hello-world function.
    triggers: { event: "code-agent/run" },
  },

  async ({ event, step }) => {
    const userInput = event.data?.value;
    if (typeof userInput !== "string" || !userInput.trim()) {
      throw new NonRetriableError(
        "event.data.value must be a non-empty string.",
      );
    }

    const projectId = event.data?.projectId;
    if (typeof projectId !== "string" || !projectId) {
      throw new NonRetriableError(
        "event.data.projectId must be a non-empty string.",
      );
    }

    // Step 1: create the sandbox
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("v0-nextjs-build-new", {
        timeoutMs: SANDBOX_TIMEOUT_MS,
        network: {
          allowPublicTraffic: true,
        },
      });
      return sandbox.sandboxId;
    });

    const codeAgent = createAgent({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: gemini({ model: GEMINI_MODEL, apiKey: GEMINI_API_KEY }),
      tools: [
        // 1. Terminal
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          // step?.run inside a tool handler is correct. It is the agent-kit pattern.
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };

              try {
                const sandbox = await Sandbox.connect(sandboxId);

                const result = await sandbox.commands.run(command, {
                  onStdout: (data) => {
                    buffers.stdout += data;
                  },
                  onStderr: (data) => {
                    buffers.stderr += data;
                  },
                });

                return result.stdout;
              } catch (error) {
                const message = `Command failed: ${error}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`;
                console.log(message);
                return message;
              }
            });
          },
        }),

        // 2. createOrUpdateFiles
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",
          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              }),
            ),
          }),
          handler: async ({ files }, { step, network }) => {
            const newFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const updatedFiles = {
                    ...(network?.state?.data?.files ?? {}),
                  };
                  const sandbox = await Sandbox.connect(sandboxId);

                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);
                    updatedFiles[file.path] = file.content;
                  }

                  return updatedFiles;
                } catch (error) {
                  return `Error: ${error}`;
                }
              },
            );

            // On failure, tell the model what went wrong so it can retry.
            if (typeof newFiles !== "object" || newFiles === null) {
              return newFiles ?? "Error: createOrUpdateFiles did not run.";
            }

            if (network) {
              network.state.data.files = newFiles;
            }
            // Return something so the model sees the tool succeeded.
            return `Wrote ${files.length} file(s): ${files
              .map((f) => f.path)
              .join(", ")}`;
          },
        }),

        // 3. readFiles
        createTool({
          name: "readFiles",
          description: "Read files in the sandbox",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await Sandbox.connect(sandboxId);
                const contents = [];

                for (const file of files) {
                  const content = await sandbox.files.read(file);
                  contents.push({ path: file, content });
                }
                return JSON.stringify(contents);
              } catch (error) {
                return `Error: ${error}`;
              }
            });
          },
        }),
      ],

      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText && network) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork({
      name: "coding-agent-network",
      agents: [codeAgent],
      maxIter: 15,
      router: async ({ network }) => {
        // Stop once the agent has produced its <task_summary>.
        if (network.state.data.summary) {
          return;
        }
        return codeAgent;
      },
    });

    // Do NOT wrap network.run in step.run. agent-kit makes its own steps.
    const result = await network.run(userInput);

    const files = result.state.data.files || {};
    const summary = result.state.data.summary;
    const isError = !summary || Object.keys(files).length === 0;

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await Sandbox.connect(sandboxId);
      return `https://${sandbox.getHost(3000)}`;
    });

    await step.run("save-result", async () => {
      if (isError) {
        return await db.message.create({
          data: {
            projectId,
            content: "Something went wrong. Please try again",
            role: MessageRole.ASSISTANT,
            type: MessageType.ERROR,
          },
        });
      }

      return await db.message.create({
        data: {
          projectId,
          content: summary,
          role: MessageRole.ASSISTANT,
          type: MessageType.RESULT,
          fragments: {
            create: {
              sandboxUrl,
              title: "Untitled",
              files,
            },
          },
        },
      });
    });

    return {
      success: !isError,
      url: sandboxUrl,
      sandboxId,
      title: "Untitled",
      files,
      summary,
    };
  },
);
