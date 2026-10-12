"use client";

import { useEffect, useRef, useState } from "react";

import { FiCheck } from "react-icons/fi";

import { useNeedtReducedMotion } from "@/components/providers/MotionRuntime";

export interface TaskCheckProps {
  on: boolean;
  onClick?: () => void;
  hue?: string;
  touch?: boolean;
  size?: number;
  disabled?: boolean;
}

export function TaskCheck({
  on,
  onClick,
  hue,
  touch,
  size = 20,
  disabled,
}: TaskCheckProps) {
  const previous = useRef(on);
  const [tick, setTick] = useState(false);
  const reduced = useNeedtReducedMotion();
  useEffect(() => {
    if (previous.current !== on) setTick(on && !reduced);
    previous.current = on;
  }, [on, reduced]);
  const state = `${on ? " is-on" : ""}${tick && !reduced ? " is-ticking" : ""}`;
  const boxStyle = {
    background: on ? hue || "var(--text-primary)" : undefined,
  };
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      className={
        touch ? "mb-press tk-check-touch" : `nx-check tk-check${state}`
      }
      aria-pressed={on}
      aria-label={on ? "Mark not done" : "Mark done"}
      style={touch ? undefined : boxStyle}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {touch ? (
        <span
          aria-hidden="true"
          className={`tk-check-touch-box${state}`}
          style={{
            ...boxStyle,
            width: size,
            height: size,
            borderRadius: size * 0.32,
          }}
        >
          {on ? <FiCheck size={Math.round(size * 0.62)} /> : null}
        </span>
      ) : on ? (
        <FiCheck aria-hidden="true" size={11} />
      ) : null}
    </button>
  );
}
