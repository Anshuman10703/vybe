import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

import ProjectsForm from "@/modules/home/components/project-form";
import ProjectList from "@/modules/home/components/project-list";
import Image from "next/image";

const Page = () => {
  return (
    <div className="relative flex items-center justify-center w-full px-4 py-8">
      {/* Authentication controls */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">
              Sign In
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              Sign Up
            </button>
          </SignUpButton>
        </Show>

        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>

      <div className="max-w-5xl w-full">
        <section className="space-y-8 flex flex-col items-center">
          <div className="flex flex-col items-center">
            <Image
              src="/logo.svg"
              width={100}
              height={100}
              alt="Vybe Logo"
              className="hidden md:block invert dark:invert-0"
            />
          </div>

          <h1 className="text-2xl md:text-5xl font-bold text-center">
            Build Something with ❤️
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground text-center">
            Create apps and websites by chatting with AI
          </p>

          <div className="max-w-3xl w-full">
            <ProjectsForm />
          </div>

          <ProjectList />
        </section>
      </div>
    </div>
  );
};

export default Page;
