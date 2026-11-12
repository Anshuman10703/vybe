"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

import { status } from "../actions";

export const useStatus = () => {
  const { isLoaded, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["status"],
    queryFn: status,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
};

// Optional alias for newer components
export const useGetUsageStatus = useStatus;
