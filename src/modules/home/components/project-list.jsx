"use client";

import { useGetProjects } from "@/modules/projects/hooks/project";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import { FolderKanban, Calendar, ArrowRight } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const ProjectList = () => {
  const { isLoaded, isSignedIn } = useAuth();

  const { data: projects, isLoading, isError } = useGetProjects();

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Don't fetch or display projects for signed-out visitors.
  if (!isLoaded || !isSignedIn) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full mt-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
          Your Projects
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Unable to load your projects. Please refresh the page.
      </p>
    );
  }

  if (!projects || projects.length === 0) {
    return null;
  }

  const ProjectCard = ({ project }) => (
    <Card className="group hover:shadow-xl transition-all duration-300 border-zinc-800/50 hover:border-emerald-500/50 cursor-pointer bg-zinc-900/30 backdrop-blur-sm overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
            <FolderKanban className="w-5 h-5 text-emerald-500" />
          </div>

          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
        </div>

        <CardTitle className="text-lg text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
          {project.name}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="flex items-center text-sm text-zinc-400">
          <Calendar className="w-3.5 h-3.5 mr-2" />
          <span>{formatDate(project.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="w-full mt-16">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
        Your Projects
      </h2>

      <div className="hidden lg:grid grid-cols-3 gap-4 max-w-6xl mx-auto">
        {projects.map((project) => (
          <Link href={`/projects/${project.id}`} key={project.id}>
            <ProjectCard project={project} />
          </Link>
        ))}
      </div>

      <div className="lg:hidden max-w-4xl mx-auto px-4">
        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {projects.map((project) => (
              <CarouselItem key={project.id} className="pl-4 md:basis-1/2">
                <Link href={`/projects/${project.id}`}>
                  <ProjectCard project={project} />
                </Link>
              </CarouselItem>
            ))}
          </CarouselContent>

          <CarouselPrevious className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100" />

          <CarouselNext className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100" />
        </Carousel>
      </div>
    </div>
  );
};

export default ProjectList;
