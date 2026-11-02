import { TaskStatus } from "@/types/task";

import { FieldMapper } from "../field-mapper";
import { FieldMapping } from "../types";

const toDate = (value: unknown) =>
  value ? new Date(value as string | number | Date) : null;

/**
 * GoogleFieldMapper
 *
 * Field mappings between our internal task model and Google Tasks, following
 * the selective field sync in ../README.md:
 *
 * - External-owned, overwritten on every sync, including when Google cleared
 *   them: title, notes (our description), status, due date, completion time.
 * - Local-owned, never touched by an import: start date, duration, priority,
 *   energy level, preferred time, scheduling.
 *
 * Google's own fields take the place of the defaults for the same internal
 * field, so the first mapping for a field is the one that governs it.
 */
export class GoogleFieldMapper extends FieldMapper {
  constructor() {
    const googleMappings: FieldMapping[] = [
      {
        internalField: "status",
        externalField: "status",
        preserveLocalValue: false,
        transformToExternal: (value: unknown) => {
          const status = value as TaskStatus | null | undefined;
          return status === TaskStatus.COMPLETED ? "completed" : "needsAction";
        },
        transformToInternal: (value: unknown) =>
          String(value ?? "").toLowerCase() === "completed"
            ? TaskStatus.COMPLETED
            : TaskStatus.TODO,
      },
      // Google calls the description `notes`; the provider hands it over as
      // `description`. A note removed in Google is removed here.
      {
        internalField: "description",
        externalField: "description",
        preserveLocalValue: false,
      },
      {
        internalField: "dueDate",
        externalField: "dueDate",
        preserveLocalValue: false,
        transformToExternal: toDate,
        transformToInternal: toDate,
      },
      // Open again in Google clears the completion time here.
      {
        internalField: "completedAt",
        externalField: "completedDate",
        preserveLocalValue: false,
        transformToExternal: toDate,
        transformToInternal: toDate,
      },
    ];

    super(googleMappings);

    const overridden = new Set(googleMappings.map((m) => m.internalField));
    this.fieldMappings = [
      ...googleMappings,
      ...this.fieldMappings.filter(
        (m) => !googleMappings.includes(m) && !overridden.has(m.internalField)
      ),
    ];
  }
}
