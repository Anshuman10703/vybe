"use client";

import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { ChevronDownIcon, ChevronLeftIcon, SunMoonIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useGetProjectById } from "../hooks/project";
import { Spinner } from "@/components/ui/spinner";

const ProjectHeader = ({ projectId }) => {
  const { data: project, isPending } = useGetProjectById(projectId);
  const { setTheme, theme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b p-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium outline-none transition-all hover:bg-muted hover:opacity-75 focus-visible:ring-0">
          <Image
            src="/logo.svg"
            alt="Vybe"
            width={28}
            height={28}
            className="shrink-0 invert dark:invert-0"
          />

          <span className="text-sm font-medium">
            {isPending ? <Spinner /> : project?.name || "Untitled Project"}
          </span>

          <ChevronDownIcon className="ml-2 size-4" />
        </DropdownMenuTrigger>

        <DropdownMenuContent side="bottom" align="start">
          <DropdownMenuItem asChild>
            <Link href="/">
              <ChevronLeftIcon className="size-4" />
              <span>Go to Dashboard</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <SunMoonIcon className="size-4 text-muted-foreground" />
              <span>Appearance</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={5}>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light">
                    Light
                  </DropdownMenuRadioItem>

                  <DropdownMenuRadioItem value="dark">
                    Dark
                  </DropdownMenuRadioItem>

                  <DropdownMenuRadioItem value="system">
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
};

export default ProjectHeader;
