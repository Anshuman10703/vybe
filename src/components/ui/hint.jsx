"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Hint({ children, label, side = "top", align = "center" }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={children} />

        <TooltipContent side={side} align={align}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
