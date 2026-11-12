"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { createProject, getProjectById, getProjects } from "../actions";

export const useGetProjects = () => {
  const { isLoaded, isSignedIn, userId } = useAuth();

  return useQuery({
    queryKey: ["projects", userId],
    queryFn: getProjects,
    enabled: isLoaded && !!isSignedIn,
    retry: false,
  });
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProject,

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["projects"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["status"],
        }),
      ]);
    },
  });
};

export const useGetProjectById = (projectId) => {
  const { isLoaded, isSignedIn, userId } = useAuth();

  return useQuery({
    queryKey: ["project", projectId, userId],
    queryFn: () => getProjectById(projectId),
    enabled: isLoaded && !!isSignedIn && !!projectId,
    retry: false,
  });
};
