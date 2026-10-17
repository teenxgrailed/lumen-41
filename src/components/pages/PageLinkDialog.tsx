"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { normalizeLinkInput } from "./page-editor-logic";

/**
 * The address of a link on selected text (selection bar, Mod+K, the Link…
 * row of the context menu). Typing "example.com" is enough; a refused address
 * says so instead of silently doing nothing.
 */
export function PageLinkDialog({
  open,
  initialHref,
  onApply,
  onRemove,
  onClose,
}: {
  open: boolean;
  /** The existing link's address when the selection already has one. */
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialHref);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(initialHref);
      setInvalid(false);
    }
  }, [initialHref, open]);

  const submit = () => {
    const href = normalizeLinkInput(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    onApply(href);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialHref ? "Edit link" : "Add link"}</DialogTitle>
          <DialogDescription>
            The selected text becomes a link to this address.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label htmlFor="page-link-href">Address</Label>
          <Input
            id="page-link-href"
            value={value}
            placeholder="example.com"
            autoFocus
            autoComplete="off"
            aria-invalid={invalid}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
          />
          {invalid && (
            <p role="alert" className="text-[12px] text-[var(--text-muted)]">
              That address cannot be linked. Use a web address, an email or a
              page path.
            </p>
          )}
          <DialogFooter className="pt-2">
            {initialHref && (
              <Button type="button" variant="outline" onClick={onRemove}>
                Remove link
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              {initialHref ? "Update" : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
