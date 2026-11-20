/**
 * Tasks parked in Someday are out of the plan on purpose: the scheduler must
 * not place them until the person restores them (which clears `somedayAt`).
 */
export const NOT_IN_SOMEDAY = { somedayAt: null } as const;
