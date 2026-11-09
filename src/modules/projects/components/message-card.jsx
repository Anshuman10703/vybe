"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MessageRole, MessageType } from "@/modules/messages/constants";

import { format } from "date-fns";
import { ChevronRightIcon, Code2Icon } from "lucide-react";
import Image from "next/image";

const FragmentCard = ({ fragment, isActiveFragment, onFragmentClick }) => {
  return (
    <button
      type="button"
      aria-label={`Preview ${fragment.title}`}
      aria-pressed={isActiveFragment}
      className={cn(
        "flex w-fit items-start gap-2 rounded-lg border bg-muted p-2 text-start transition-colors hover:bg-secondary",
        isActiveFragment &&
          "border-primary bg-primary text-primary-foreground hover:bg-primary",
      )}
      onClick={() => onFragmentClick(fragment)}
    >
      <Code2Icon className="mt-0.5 size-4 shrink-0" />

      <div className="flex flex-1 flex-col">
        <span className="line-clamp-1 text-sm font-medium">
          {fragment.title}
        </span>

        <span className="text-sm">Preview</span>
      </div>

      <ChevronRightIcon className="mt-0.5 size-4 shrink-0" />
    </button>
  );
};

const UserMessage = ({ content }) => {
  return (
    <div className="flex justify-end pb-4 pl-10 pr-2">
      <Card className="max-w-[80%] break-words rounded-lg border-none bg-muted p-2 shadow-none">
        {content}
      </Card>
    </div>
  );
};

const AssistantMessage = ({
  content,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
}) => {
  return (
    <div
      className={cn(
        "group flex flex-col px-2 pb-4",
        type === MessageType.ERROR && "text-red-700 dark:text-red-500",
      )}
    >
      <div className="mb-2 flex items-center gap-2 pl-2">
        <Image
          src="/logo.svg"
          alt="Vybe"
          height={30}
          width={30}
          className="invert dark:invert-0"
        />

        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(new Date(createdAt), "HH:mm 'on' MMM dd, yyyy")}
        </span>
      </div>

      <div className="flex flex-col gap-y-4 pl-8">
        <span>{content}</span>

        {fragment && type === MessageType.RESULT && (
          <FragmentCard
            fragment={fragment}
            isActiveFragment={isActiveFragment}
            onFragmentClick={onFragmentClick}
          />
        )}
      </div>
    </div>
  );
};

const MessageCard = (props) => {
  const {
    content,
    role,
    fragment,
    createdAt,
    isActiveFragment,
    onFragmentClick,
    type,
  } = props;

  if (role === MessageRole.ASSISTANT) {
    return (
      <AssistantMessage
        content={content}
        fragment={fragment}
        createdAt={createdAt}
        isActiveFragment={isActiveFragment}
        onFragmentClick={onFragmentClick}
        type={type}
      />
    );
  }

  return (
    <div className="mt-5">
      <UserMessage content={content} />
    </div>
  );
};

export default MessageCard;
