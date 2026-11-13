"use server";

import { inngest } from "@/inngest/client";
import db from "@/lib/db";
import { consumeCredits } from "@/lib/usage";
import { getCurrentUser } from "@/modules/auth/actions";

import { MessageRole, MessageType } from "@/generated/prisma/client";

import { generateSlug } from "random-word-slugs";

async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  return user;
}

function validatePrompt(value) {
  if (typeof value !== "string") {
    throw new Error("Invalid prompt.");
  }

  const prompt = value.trim();

  if (!prompt) {
    throw new Error("Prompt cannot be empty.");
  }

  if (prompt.length > 20000) {
    throw new Error("Prompt is too long.");
  }

  return prompt;
}

function validateProjectId(projectId) {
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Invalid project ID.");
  }

  return projectId.trim();
}

export async function createProject(value) {
  const user = await requireAuthenticatedUser();
  const prompt = validatePrompt(value);

  await consumeCredits();

  const project = await db.project.create({
    data: {
      name: generateSlug(2, {
        format: "kebab",
      }),
      userId: user.id,
      messages: {
        create: {
          content: prompt,
          role: MessageRole.USER,
          type: MessageType.RESULT,
        },
      },
    },
  });

  try {
    await inngest.send({
      name: "code-agent/run",
      data: {
        value: prompt,
        projectId: project.id,
      },
    });
  } catch (error) {
    console.error("Inngest dispatch failed:", error);

    throw new Error("Project created, but AI generation could not start.");
  }

  return project;
}

export async function getProjects() {
  const user = await requireAuthenticatedUser();

  return db.project.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getProjectById(projectId) {
  const user = await requireAuthenticatedUser();
  const validatedProjectId = validateProjectId(projectId);

  const project = await db.project.findFirst({
    where: {
      id: validatedProjectId,
      userId: user.id,
    },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  return project;
}
