import { auth, currentUser } from "@clerk/nextjs/server";
import db from "@/lib/db";

export const getCurrentUser = async () => {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const existingUser = await db.user.findUnique({
    where: { clerkId: userId },
  });

  if (existingUser) {
    return existingUser;
  }

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
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  return db.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: {
      clerkId: userId,
      email,
      name,
      image: clerkUser.imageUrl,
    },
  });
};
