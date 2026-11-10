import { inngest } from "./client";

import {
  gemini,
  createAgent,
  createTool,
  createNetwork,
} from "@inngest/agent-kit";

import Sandbox from "@e2b/code-interpreter";
import z from "zod";

import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";

import { lastAssistantTextMessageContent } from "./utils";
import db from "@/lib/db";

import { MessageRole, MessageType } from "@/modules/messages/constants";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const SANDBOX_TEMPLATE = "vybe";
const PREVIEW_PORT = 3000;
const GEMINI_MODEL = "gemini-3.1-flash-lite";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const extractTextOutput = (output, fallback) => {
  const textOutput = output?.find((item) => item.type === "text");

  if (!textOutput) {
    return fallback;
  }

  if (Array.isArray(textOutput.content)) {
    return textOutput.content
      .map((part) => (typeof part === "string" ? part : (part?.text ?? "")))
      .join("");
  }

  return textOutput.content || fallback;
};

const createGeminiAgent = ({ name, description, system }) => {
  return createAgent({
    name,
    description,
    system,
    model: gemini({
      model: GEMINI_MODEL,
    }),
  });
};

// --------------------------------------------------
// Inngest Function
// --------------------------------------------------

export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    triggers: {
      event: "code-agent/run",
    },
  },

  async ({ event, step }) => {
    // --------------------------------------------------
    // Step 1: Create E2B Sandbox
    // --------------------------------------------------

    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create(SANDBOX_TEMPLATE, {
        network: {
          allowPublicTraffic: true,
        },
      });

      return sandbox.sandboxId;
    });

    // --------------------------------------------------
    // Step 2: Create Coding Agent
    // --------------------------------------------------

    const codeAgent = createAgent({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,

      model: gemini({
        model: GEMINI_MODEL,
      }),

      tools: [
        // ----------------------------------------------
        // Terminal Tool
        // ----------------------------------------------

        createTool({
          name: "terminal",
          description: "Execute terminal commands inside the E2B sandbox.",

          parameters: z.object({
            command: z.string(),
          }),

          handler: async ({ command }, { step }) => {
            return await step.run("terminal", async () => {
              const buffers = {
                stdout: "",
                stderr: "",
              };

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

                return JSON.stringify({
                  stdout: result.stdout || buffers.stdout,
                  stderr: result.stderr || buffers.stderr,
                  exitCode: result.exitCode,
                });
              } catch (error) {
                console.error("Sandbox terminal execution failed:", error);

                return JSON.stringify({
                  error: error.message,
                  stdout: buffers.stdout,
                  stderr: buffers.stderr,
                });
              }
            });
          },
        }),

        // ----------------------------------------------
        // Create / Update Files Tool
        // ----------------------------------------------

        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the E2B sandbox.",

          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              }),
            ),
          }),

          handler: async ({ files }, { step, network }) => {
            const updatedFiles = await step.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const sandbox = await Sandbox.connect(sandboxId);

                  const existingFiles = network?.state?.data?.files || {};

                  const newFiles = {
                    ...existingFiles,
                  };

                  for (const file of files) {
                    await sandbox.files.write(file.path, file.content);

                    newFiles[file.path] = file.content;
                  }

                  return newFiles;
                } catch (error) {
                  console.error("File creation/update failed:", error);

                  throw error;
                }
              },
            );

            if (network) {
              network.state.data.files = updatedFiles;
            }

            return JSON.stringify({
              success: true,
              updatedFiles: Object.keys(updatedFiles),
            });
          },
        }),

        // ----------------------------------------------
        // Read Files Tool
        // ----------------------------------------------

        createTool({
          name: "readFiles",
          description: "Read files from the E2B sandbox.",

          parameters: z.object({
            files: z.array(z.string()),
          }),

          handler: async ({ files }, { step }) => {
            return await step.run("readFiles", async () => {
              try {
                const sandbox = await Sandbox.connect(sandboxId);

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

                throw error;
              }
            });
          },
        }),
      ],

      // ----------------------------------------------
      // Agent Lifecycle
      // ----------------------------------------------

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

    // --------------------------------------------------
    // Step 3: Create Agent Network
    // --------------------------------------------------

    const network = createNetwork({
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

    // --------------------------------------------------
    // Step 4: Run Coding Agent
    // --------------------------------------------------

    const result = await network.run(event.data.value);

    const summary = result.state.data.summary;
    const files = result.state.data.files || {};

    // --------------------------------------------------
    // Step 5: Generate Fragment Title
    // --------------------------------------------------

    const fragmentTitleGenerator = createGeminiAgent({
      name: "fragment-title-generator",
      description: "Generate a concise title for the generated project.",
      system: FRAGMENT_TITLE_PROMPT,
    });

    // --------------------------------------------------
    // Step 6: Generate Assistant Response
    // --------------------------------------------------

    const responseGenerator = createGeminiAgent({
      name: "response-generator",
      description: "Generate a response explaining the generated project.",
      system: RESPONSE_PROMPT,
    });

    const [fragmentTitleResult, responseResult] = await Promise.all([
      fragmentTitleGenerator.run(summary || "Untitled project"),
      responseGenerator.run(summary || "Project generation completed"),
    ]);

    const fragmentTitle = extractTextOutput(
      fragmentTitleResult.output,
      "Untitled",
    );

    const response = extractTextOutput(responseResult.output, "Here you go!");

    // --------------------------------------------------
    // Step 7: Determine Generation Status
    // --------------------------------------------------

    const isError = !summary || Object.keys(files).length === 0;

    // --------------------------------------------------
    // Step 8: Generate Preview URL
    // --------------------------------------------------

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await Sandbox.connect(sandboxId);

      const host = sandbox.getHost(PREVIEW_PORT);

      return `https://${host}`;
    });

    // --------------------------------------------------
    // Step 9: Save Result to Database
    // --------------------------------------------------

    await step.run("save-result", async () => {
      if (isError) {
        return await db.message.create({
          data: {
            projectId: event.data.projectId,

            content: "Something went wrong. Please try again.",

            role: MessageRole.ASSISTANT,

            type: MessageType.ERROR,
          },
        });
      }

      return await db.message.create({
        data: {
          projectId: event.data.projectId,

          content: response,

          role: MessageRole.ASSISTANT,

          type: MessageType.RESULT,

          fragments: {
            create: {
              sandboxUrl,

              title: fragmentTitle,

              files,
            },
          },
        },
      });
    });

    // --------------------------------------------------
    // Step 10: Return Result
    // --------------------------------------------------

    return {
      url: sandboxUrl,
      title: fragmentTitle,
      files,
      summary,
      sandboxId,
    };
  },
);
