"use server";

import { inngest } from "@/inngest/client";
import db from "@/lib/db";
import { consumeCredits } from "@/lib/usage";
import { getCurrentUser } from "@/modules/auth/actions";
import { MessageRole, MessageType } from "@/generated/prisma/client";
import { generateSlug } from "random-word-slugs";

export const createProject = async (value) => {
  const user = await getCurrentUser();

  if (!user) throw new Error("Unauthorized");

  if (!value || !value.trim()) throw new Error("Prompt cannot be empty");

  try {
    await consumeCredits();
  } catch (error) {
    console.error("consumeCredits failed:", error);

    if (error instanceof Error) {
      // Real failure (DB, config, auth, etc.)
      throw new Error(`Credit check failed: ${error.message}`);
    }

    // rate-limiter-flexible rejects with a plain RateLimiterRes object
    // (not an Error) when the user is out of credits
    throw new Error("You have run out of credits. Please try again later.");
  }

  try {
    const newProject = await db.project.create({
      data: {
        name: generateSlug(2, { format: "kebab" }),
        userId: user.id,
        messages: {
          create: {
            content: value,
            role: MessageRole.USER,
            type: MessageType.RESULT,
          },
        },
      },
    });

    await inngest.send({
      name: "code-agent/run",
      data: {
        value: value,
        projectId: newProject.id,
      },
    });

    return newProject;
  } catch (error) {
    console.error("createProject failed:", error);
    throw new Error(
      error instanceof Error ? error.message : "Something went wrong",
    );
  }
};

export const getProjects = async () => {
  const user = await getCurrentUser();

  if (!user) throw new Error("Unauthorized");

  const projects = await db.project.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return projects;
};

export const getProjectById = async (projectId) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const project = await db.project.findUnique({
    where: {
      id: projectId,
      userId: user.id,
    },
  });

  if (!project) throw new Error("Project not found");

  return project;
};
