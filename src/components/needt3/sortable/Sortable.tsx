"use client";

import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  createContext,
  useContext,
} from "react";

import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { sortableText } from "./order";
import type { SortableController } from "./useSortableList";

const Ctl = createContext<SortableController | null>(null);

const SILENT = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * The frame of a sortable list: the drag context, the sorting strategy and
 * the one live region. Rows are `<SortableItem>`s inside it.
 */
export function SortableList({
  ctl,
  children,
}: {
  ctl: SortableController;
  children: ReactNode;
}) {
  return (
    <Ctl.Provider value={ctl}>
      <DndContext
        sensors={ctl.sensors}
        collisionDetection={ctl.collisionDetection}
        modifiers={ctl.modifiers}
        onDragStart={ctl.onDragStart}
        onDragOver={ctl.onDragOver}
        onDragEnd={ctl.onDragEnd}
        onDragCancel={ctl.onDragCancel}
        // The hook speaks (one region); dnd-kit stays quiet.
        accessibility={{
          announcements: SILENT,
          screenReaderInstructions: { draggable: sortableText.instructions },
        }}
      >
        <SortableContext
          items={ctl.ids}
          strategy={
            ctl.axis === "grid"
              ? rectSortingStrategy
              : verticalListSortingStrategy
          }
          disabled={ctl.disabled}
        >
          {children}
        </SortableContext>
      </DndContext>
      <div
        className="sr-only nx-sort-live"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        {ctl.message}
      </div>
    </Ctl.Provider>
  );
}

/** What a row gets to wear: spread `handleProps` on the grip (or the row). */
export interface SortableItemState {
  handleProps: HTMLAttributes<HTMLElement> & {
    ref: Ref<HTMLElement>;
    "data-sort-handle": "";
  };
  isDragging: boolean;
  isLifted: boolean;
}

export function SortableItem({
  id,
  as: Tag = "div",
  className = "",
  style,
  disabled,
  label,
  self = false,
  children,
  ...rest
}: {
  id: string;
  as?: "div" | "li" | "figure";
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  /** The grip's name: "Reorder Calendar". */
  label?: string;
  /**
   * The whole row is the handle (a card): the handle props go on the row
   * itself, so `children` gets them only for reading state.
   */
  self?: boolean;
  children: (state: SortableItemState) => ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className" | "style">) {
  const ctl = useContext(Ctl);
  const off = disabled || ctl?.disabled;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: off,
    // neighbours slide on a keyboard move too, but a drop is never replayed
    animateLayoutChanges: ({ isSorting, wasDragging }) =>
      !wasDragging && (isSorting || !!ctl?.lifted),
    transition: { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  });
  const isLifted = ctl?.lifted === id;
  const Node = Tag as "div";
  const handleProps: SortableItemState["handleProps"] = {
    ...attributes,
    ...(off ? {} : listeners),
    ref: (el: HTMLElement | null) => {
      setActivatorNodeRef(el);
      ctl?.registerHandle(id, el);
    },
    "data-sort-handle": "",
    "aria-label": label ? `Reorder ${label}` : undefined,
    "aria-pressed": isLifted,
    "aria-disabled": off || undefined,
    onKeyDown: ctl?.onHandleKeyDown(id),
  };
  const own = self
    ? {
        ...handleProps,
        "aria-label": rest["aria-label"],
        "aria-pressed": undefined,
        onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
          handleProps.onKeyDown?.(e);
          if (!e.defaultPrevented) rest.onKeyDown?.(e);
        },
      }
    : null;
  const nodeRef = (el: HTMLElement | null) => {
    setNodeRef(el);
    if (own) (own.ref as (el: HTMLElement | null) => void)(el);
  };
  return (
    <Node
      {...rest}
      {...(own ? { ...own, ref: undefined } : {})}
      ref={nodeRef}
      data-sort-id={id}
      className={`nx-sort-item${isDragging ? " is-dragging" : ""}${
        isLifted ? " is-lifted" : ""
      }${className ? ` ${className}` : ""}`}
      style={{
        ...style,
        // translate only: a rect strategy would otherwise squash the row
        transform: CSS.Translate.toString(transform),
        transition,
      }}
    >
      {children({ handleProps, isDragging, isLifted })}
    </Node>
  );
}
