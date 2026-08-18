"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { lazyOverlay } from "@/components/ui/lazy";

const { Component: CreateProjectDialog, warmUp } = lazyOverlay(() => import("./create-project-dialog"));

export const NewProjectButton = () => {
  const [open, setOpen] = useState(false);
  useEffect(warmUp, []);
  return (
    <>
      <Button variant="secondary" size="small" leadingIcon={<Icon name="plus" size={13} />} onClick={() => setOpen(true)}>
        New project
      </Button>
      {open ? <CreateProjectDialog open onClose={() => setOpen(false)} /> : null}
    </>
  );
};
