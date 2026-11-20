// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/cn";

export default function PageSection({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
  headingLevel = 2,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Use 1 for the page's main section so every page has a single h1. */
  headingLevel?: 1 | 2;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{eyebrow}</p> : null}
          <div>
            <CardTitle as={headingLevel === 1 ? "h1" : "h2"}>{title}</CardTitle>
            {description ? <CardDescription className="mt-2 max-w-3xl">{description}</CardDescription> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
