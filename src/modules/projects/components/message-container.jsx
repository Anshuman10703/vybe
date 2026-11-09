"use client";

import React, { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  useGetMessages,
  prefetchMessages,
} from "@/modules/messages/hooks/message";

import { MessageRole } from "@/modules/messages/constants";
import { Spinner } from "@/components/ui/spinner";

import MessageCard from "./message-card";
import MessageForm from "./message-form";
import MessageLoading from "./message-loader";

const MessageContainer = ({ projectId, activeFragment, setActiveFragment }) => {
  const queryClient = useQueryClient();

  const bottomRef = useRef(null);
  const lastAssistantMessageIdRef = useRef(null);

  const {
    data: messages,
    isPending,
    isError,
    error,
  } = useGetMessages(projectId);

  useEffect(() => {
    if (!projectId) return;

    prefetchMessages(queryClient, projectId);
  }, [projectId, queryClient]);

  useEffect(() => {
    const lastAssistantMessage = messages?.findLast(
      (message) => message.role === MessageRole.ASSISTANT,
    );

    if (
      lastAssistantMessage?.fragments &&
      lastAssistantMessage.id !== lastAssistantMessageIdRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragments);
      lastAssistantMessageIdRef.current = lastAssistantMessage.id;
    }
  }, [messages, setActiveFragment]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages?.length]);

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-emerald-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error: {error?.message || "Failed to load messages"}
      </div>
    );
  }

  if (!messages?.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          No Messages yet. Start a conversation!
        </div>

        <div className="relative p-3 pt-1">
          <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background" />
          <MessageForm projectId={projectId} />
        </div>
      </div>
    );
  }

  const lastMessage = messages[messages.length - 1];
  const isLastMessageUser = lastMessage.role === MessageRole.USER;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            content={message.content}
            role={message.role}
            fragment={message.fragments}
            createdAt={message.createdAt}
            isActiveFragment={activeFragment?.id === message.fragments?.id}
            onFragmentClick={() => setActiveFragment(message.fragments)}
            type={message.type}
          />
        ))}

        {isLastMessageUser && <MessageLoading />}

        <div ref={bottomRef} />
      </div>

      <div className="relative p-2 pt-1">
        <div className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background" />
        <MessageForm projectId={projectId} />
      </div>
    </div>
  );
};

export default MessageContainer;
