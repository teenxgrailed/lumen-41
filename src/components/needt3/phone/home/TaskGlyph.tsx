"use client";

import {
  LuBookOpen,
  LuCamera,
  LuCode,
  LuDumbbell,
  LuGraduationCap,
  LuHeartPulse,
  LuListChecks,
  LuMail,
  LuMusic,
  LuPenLine,
  LuPencilRuler,
  LuPhone,
  LuPlane,
  LuShoppingBag,
  LuSparkles,
  LuSquareCheck,
  LuUsers,
  LuUtensils,
  LuWallet,
} from "react-icons/lu";

import {
  type TaskIconKey,
  isTaskIconKey,
  taskIconKey,
} from "@/lib/needt3/task-icon";

export const TASK_GLYPH: Record<TaskIconKey, typeof LuMail> = {
  mail: LuMail,
  call: LuPhone,
  meeting: LuUsers,
  write: LuPenLine,
  code: LuCode,
  design: LuPencilRuler,
  shop: LuShoppingBag,
  money: LuWallet,
  health: LuHeartPulse,
  workout: LuDumbbell,
  clean: LuSparkles,
  travel: LuPlane,
  read: LuBookOpen,
  study: LuGraduationCap,
  cook: LuUtensils,
  camera: LuCamera,
  music: LuMusic,
  plan: LuListChecks,
  generic: LuSquareCheck,
};

/**
 * A task's icon on a flat tile: one step of light from above and a hairline,
 * the one ink at ladder alphas. The glyph comes from the title by keyword
 * (`taskIconKey`), nothing is asked of a model.
 */
export function TaskGlyph({
  title,
  icon,
  size = 18,
}: {
  title: string;
  /** The icon the person chose (`Task.icon`); without one the title decides. */
  icon?: string | null;
  size?: number;
}) {
  const key = isTaskIconKey(icon) ? icon : taskIconKey(title);
  const Icon = TASK_GLYPH[key];
  return (
    <span className="dp-glyph" data-task-icon={key}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
