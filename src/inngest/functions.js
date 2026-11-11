import { inngest } from "./client";

import {
  gemini,
  createAgent,
  createTool,
  createNetwork,
  createState,
} from "@inngest/agent-kit";

import Sandbox from "@e2b/code-interpreter";
import { z } from "zod";

import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";

import { lastAssistantTextMessageContent } from "./utils";

import db from "@/lib/db";

import { MessageRole, MessageType } from "@/generated/prisma/client";

// ============================================================
// CONFIGURATION
// ============================================================

const SANDBOX_TEMPLATE = "vybe";
const SANDBOX_TIMEOUT = 30 * 60 * 1000;
const PREVIEW_PORT = 3000;
const GEMINI_MODEL = "gemini-3.1-flash-lite";

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const connectToSandbox = async (sandboxId) => {
  if (!sandboxId) {
    throw new Error("Sandbox ID is missing");
  }

  return Sandbox.connect(sandboxId);
};

const extractText = (output, fallback) => {
  const firstOutput = output?.[0];

  if (!firstOutput || firstOutput.type !== "text") {
    return fallback;
  }

  if (Array.isArray(firstOutput.content)) {
    return firstOutput.content.join("");
  }

  return firstOutput.content || fallback;
};

// ============================================================
// CODE AGENT FUNCTION
// ============================================================

export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",

    triggers: [
      {
        event: "code-agent/run",
      },
    ],
  },

  async ({ event, step }) => {
    const { projectId, value } = event.data;

    // ========================================================
    // STEP 1: CREATE PUBLIC E2B SANDBOX
    // ========================================================

    const sandboxId = await step.run("create-public-sandbox-v7", async () => {
      const sandbox = await Sandbox.create(SANDBOX_TEMPLATE, {
        timeoutMs: SANDBOX_TIMEOUT,

        network: {
          allowPublicTraffic: true,
        },
      });

      console.log("Created public E2B sandbox:", sandbox.sandboxId);

      return sandbox.sandboxId;
    });

    // ========================================================
    // STEP 2: FETCH PREVIOUS MESSAGES
    // ========================================================

    const previousMessages = await step.run(
      "get-previous-messages",
      async () => {
        const messages = await db.message.findMany({
          where: {
            projectId,
          },

          orderBy: {
            createdAt: "asc",
          },
        });

        return messages.map((message) => ({
          type: "text",

          role: message.role === MessageRole.ASSISTANT ? "assistant" : "user",

          content: message.content,
        }));
      },
    );

    // ========================================================
    // STEP 3: INITIALIZE AGENT STATE
    // ========================================================

    const state = createState(
      {
        summary: "",
        files: {},
      },
      {
        messages: previousMessages,
      },
    );

    // ========================================================
    // STEP 4: CREATE CODE AGENT
    // ========================================================

    const codeAgent = createAgent({
      name: "code-agent",

      description: "An expert coding agent",

      system: PROMPT,

      model: gemini({
        model: GEMINI_MODEL,
      }),

      tools: [
        // ====================================================
        // TOOL 1: TERMINAL
        // ====================================================

        createTool({
          name: "terminal",

          description: "Use the terminal to run commands",

          parameters: z.object({
            command: z.string(),
          }),

          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = {
                stdout: "",
                stderr: "",
              };

              try {
                const sandbox = await connectToSandbox(sandboxId);

                const result = await sandbox.commands.run(command, {
                  onStdout: (data) => {
                    buffers.stdout += data;
                  },

                  onStderr: (data) => {
                    buffers.stderr += data;
                  },
                });

                return [
                  result.stdout || "",
                  result.stderr ? `\nSTDERR:\n${result.stderr}` : "",
                ].join("");
              } catch (error) {
                console.error("Terminal command failed:", error);

                return [
                  `Command failed: ${error.message}`,
                  `stdout: ${buffers.stdout}`,
                  `stderr: ${buffers.stderr}`,
                ].join("\n");
              }
            });
          },
        }),

        // ====================================================
        // TOOL 2: CREATE OR UPDATE FILES
        // ====================================================

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
            const updatedFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const existingFiles = {
                    ...(network?.state?.data.files || {}),
                  };

                  const sandbox = await connectToSandbox(sandboxId);

                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);

                    existingFiles[file.path] = file.content;
                  }

                  return existingFiles;
                } catch (error) {
                  console.error("File creation failed:", error);

                  return {
                    error: error.message,
                  };
                }
              },
            );

            if (
              updatedFiles &&
              typeof updatedFiles === "object" &&
              !Array.isArray(updatedFiles) &&
              !updatedFiles.error
            ) {
              network.state.data.files = updatedFiles;
            }

            return updatedFiles;
          },
        }),

        // ====================================================
        // TOOL 3: READ FILES
        // ====================================================

        createTool({
          name: "readFiles",

          description: "Read files from the sandbox",

          parameters: z.object({
            files: z.array(z.string()),
          }),

          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await connectToSandbox(sandboxId);

                const contents = [];

                for (const file of files) {
                  const content = await sandbox.files.read(file);

                  contents.push({
                    path: file,
                    content,
                  });
                }

                return JSON.stringify(contents);
              } catch (error) {
                console.error("File reading failed:", error);

                return `Error reading files: ${error.message}`;
              }
            });
          },
        }),
      ],

      // ======================================================
      // AGENT LIFECYCLE
      // ======================================================

      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (
            lastAssistantMessageText &&
            lastAssistantMessageText.includes("<task_summary>")
          ) {
            network.state.data.summary = lastAssistantMessageText;
          }

          return result;
        },
      },
    });

    // ========================================================
    // STEP 5: CREATE AGENT NETWORK
    // ========================================================

    const agentNetwork = createNetwork({
      name: "coding-agent-network",

      agents: [codeAgent],

      maxIter: 10,

      router: async ({ network }) => {
        const summary = network.state.data.summary;

        if (summary) {
          return;
        }

        return codeAgent;
      },
    });

    // ========================================================
    // STEP 6: RUN AGENT NETWORK
    // ========================================================

    const result = await agentNetwork.run(value, {
      state,
    });

    // ========================================================
    // STEP 7: CREATE FRAGMENT TITLE GENERATOR
    // ========================================================

    const fragmentTitleGenerator = createAgent({
      name: "fragment-title-generator",

      description: "Generate a title for the fragment",

      system: FRAGMENT_TITLE_PROMPT,

      model: gemini({
        model: GEMINI_MODEL,
      }),
    });

    // ========================================================
    // STEP 8: CREATE RESPONSE GENERATOR
    // ========================================================

    const responseGenerator = createAgent({
      name: "response-generator",

      description: "Generate a response for the fragment",

      system: RESPONSE_PROMPT,

      model: gemini({
        model: GEMINI_MODEL,
      }),
    });

    // ========================================================
    // STEP 9: GENERATE TITLE AND RESPONSE
    // ========================================================

    const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(
      result.state.data.summary,
    );

    const { output: responseOutput } = await responseGenerator.run(
      result.state.data.summary,
    );

    // ========================================================
    // STEP 10: FORMAT GENERATED OUTPUT
    // ========================================================

    const fragmentTitle = extractText(fragmentTitleOutput, "Untitled");

    const generatedResponse = extractText(responseOutput, "Here you go");

    // ========================================================
    // STEP 11: CHECK GENERATION STATUS
    // ========================================================

    const generatedFiles = result.state.data.files || {};

    const isError =
      !result.state.data.summary || Object.keys(generatedFiles).length === 0;

    // ========================================================
    // STEP 12: GET PUBLIC SANDBOX PREVIEW URL
    // ========================================================

    const sandboxUrl = await step.run("get-sandbox-url-v7", async () => {
      const sandbox = await connectToSandbox(sandboxId);

      const host = sandbox.getHost(PREVIEW_PORT);

      return `https://${host}`;
    });

    // ========================================================
    // STEP 13: SAVE RESULT TO DATABASE
    // ========================================================

    await step.run("save-result", async () => {
      if (isError) {
        return db.message.create({
          data: {
            projectId,

            content: "Something went wrong. Please try again",

            role: MessageRole.ASSISTANT,

            type: MessageType.ERROR,
          },
        });
      }

      return db.message.create({
        data: {
          projectId,

          content: generatedResponse,

          role: MessageRole.ASSISTANT,

          type: MessageType.RESULT,

          fragments: {
            create: {
              sandboxUrl,

              title: fragmentTitle,

              files: generatedFiles,
            },
          },
        },
      });
    });

    // ========================================================
    // STEP 14: RETURN FINAL RESULT
    // ========================================================

    return {
      url: sandboxUrl,

      title: fragmentTitle,

      files: generatedFiles,

      summary: result.state.data.summary,
    };
  },
);
