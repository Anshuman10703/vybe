import { auth, currentUser } from "@clerk/nextjs/server";
import db from "@/lib/db";

export const getCurrentUser = async () => {
  try {
    const { userId } = await auth();

    if (!userId) {
      return null;
    }

    // Fast path: return the existing database user.
    const existingUser = await db.user.findUnique({
      where: { clerkId: userId },
    });

    if (existingUser) {
      return existingUser;
    }

    // First sign-in: fetch the Clerk profile.
    const clerkUser = await currentUser();

    if (!clerkUser) {
      return null;
    }

    const email =
      clerkUser.emailAddresses.find(
        (address) => address.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      "";

    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      null;

    // Create the user, handling potential concurrent first sign-ins.
    return await db.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email,
        name,
        image: clerkUser.imageUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching current user:", error);
    throw error;
  }
};
