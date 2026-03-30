"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export function Sheet({ open, onOpenChange, trigger, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl",
            "focus:outline-none"
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
            <div className="space-y-1">
              <Dialog.Title className="text-lg font-semibold text-slate-50">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-sm text-slate-400">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rounded-lg border border-slate-700 p-2 text-slate-300 transition hover:bg-slate-900">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
