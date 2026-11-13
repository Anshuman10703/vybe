import { auth, currentUser } from "@clerk/nextjs/server";
import db from "@/lib/db";

/**
 * Checks whether a Prisma error is a unique constraint violation.
 */
function isUniqueConstraintError(error) {
  return error && typeof error === "object" && error.code === "P2002";
}

/**
 * Gets the authenticated Clerk user and synchronizes
 * their account with the PostgreSQL database.
 *
 * Supports:
 * - Existing users
 * - New user creation
 * - Clerk ID changes between instances
 * - Verified email-based account recovery
 * - Concurrent synchronization requests
 */
export const getCurrentUser = async () => {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // 1. Check whether the user already exists by Clerk ID.
  const existingUser = await db.user.findUnique({
    where: {
      clerkId: userId,
    },
  });

  if (existingUser) {
    return existingUser;
  }

  // 2. Retrieve the authenticated Clerk user.
  const clerkUser = await currentUser();

  if (!clerkUser) {
    return null;
  }

  // 3. Only use the verified primary email.
  const primaryEmail = clerkUser.primaryEmailAddress;

  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    throw new Error("A verified primary email address is required.");
  }

  const email = primaryEmail.emailAddress.toLowerCase();

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  const image = clerkUser.imageUrl || null;

  // 4. Check whether this email already exists.
  const existingUserByEmail = await db.user.findUnique({
    where: {
      email,
    },
  });

  // 5. If the email exists under another Clerk ID,
  // reconnect the existing database account.
  if (existingUserByEmail) {
    try {
      return await db.user.update({
        where: {
          id: existingUserByEmail.id,
        },
        data: {
          clerkId: userId,
          name,
          image,
        },
      });
    } catch (error) {
      // Handle concurrent synchronization.
      if (isUniqueConstraintError(error)) {
        const synchronizedUser = await db.user.findUnique({
          where: {
            clerkId: userId,
          },
        });

        if (synchronizedUser) {
          return synchronizedUser;
        }
      }

      throw error;
    }
  }

  // 6. Create a new user if no matching email exists.
  try {
    return await db.user.create({
      data: {
        clerkId: userId,
        email,
        name,
        image,
      },
    });
  } catch (error) {
    // Handle concurrent requests attempting to create
    // the same user.
    if (isUniqueConstraintError(error)) {
      const synchronizedUser = await db.user.findUnique({
        where: {
          clerkId: userId,
        },
      });

      if (synchronizedUser) {
        return synchronizedUser;
      }

      // Another Clerk identity may have claimed the email.
      const conflictingUser = await db.user.findUnique({
        where: {
          email,
        },
      });

      if (conflictingUser) {
        throw new Error(
          "This email is already associated with another account.",
        );
      }
    }

    throw error;
  }
};
