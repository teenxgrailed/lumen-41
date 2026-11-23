"use client";

import {
  type ComponentPropsWithRef,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useId,
  useRef,
} from "react";

import { cx } from "./state";

export type FieldVariant = "filled" | "bare" | "search";
export type FieldSize = "md" | "lg";

interface FieldOwnProps {
  /** filled: the field on a ground. bare: no box (a composer). search: a pill with an icon. */
  variant?: FieldVariant;
  /** md is 32 high (the form row), lg 52 (a phone sheet). */
  size?: FieldSize;
  label?: ReactNode;
  hint?: ReactNode;
  /** An error replaces the hint, is announced, and turns the box red. */
  error?: ReactNode;
  icon?: ReactNode;
  /** Draws the focus ring without the focus (/admin/ds only). */
  forceFocus?: boolean;
  className?: string;
}

type InputProps = Omit<ComponentPropsWithRef<"input">, "size" | "className"> &
  FieldOwnProps & { multiline?: false };
type TextareaProps = Omit<
  ComponentPropsWithRef<"textarea">,
  "size" | "className"
> &
  FieldOwnProps & { multiline: true };

export type FieldProps = InputProps | TextareaProps;

/**
 * The one text field: pk-field-input, mau-input, hq-input, hq-field, ha-field,
 * fc-field, pl-field, pp-field, nt-input, tdc-search, ppl-search, cs-search,
 * co-input and the shadcn Input. Label, hint and error are wired by id
 * (`aria-describedby`, `aria-invalid`); a tap anywhere in the 44px box
 * focuses the input; a multiline field grows with its text.
 */
export function Field(props: FieldProps) {
  const {
    variant = "filled",
    size = "md",
    label,
    hint,
    error,
    icon,
    forceFocus,
    className,
    multiline,
    ...rest
  } = props;
  const id = useId();
  const inputId = (rest.id as string | undefined) ?? `${id}-input`;
  const noteId = `${id}-note`;
  const note = error ?? hint;
  const inner = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  function focusInput(event: PointerEvent<HTMLDivElement>) {
    // a tap on the padding, or on the hit area around the box, lands here
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    inner.current?.focus();
  }

  const shared = {
    id: inputId,
    className: "ds-field-input",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": note ? noteId : undefined,
  };
  const setRef = (node: (HTMLInputElement & HTMLTextAreaElement) | null) => {
    inner.current = node;
    const outer = (rest as { ref?: Ref<unknown> }).ref;
    if (typeof outer === "function") outer(node);
    else if (outer) (outer as { current: unknown }).current = node;
  };

  return (
    <div
      className={cx("ds-field", className)}
      data-variant={variant}
      data-size={size}
      data-invalid={error ? "" : undefined}
      data-disabled={rest.disabled ? "" : undefined}
    >
      {label ? (
        <label className="ds-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div
        className="ds-field-box"
        data-force={forceFocus ? "focus" : undefined}
        onPointerDown={focusInput}
      >
        {icon ? <span className="ds-field-icon">{icon}</span> : null}
        {multiline ? (
          <textarea
            {...(rest as ComponentPropsWithRef<"textarea">)}
            {...shared}
            ref={setRef}
            rows={(rest as { rows?: number }).rows ?? 1}
          />
        ) : (
          <input
            {...(rest as ComponentPropsWithRef<"input">)}
            {...shared}
            ref={setRef}
            type={(rest as { type?: string }).type ?? "text"}
          />
        )}
      </div>
      {note ? (
        <p
          id={noteId}
          className="ds-field-hint"
          role={error ? "alert" : undefined}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
