import { signupLocaleSettings } from "@/lib/needt3/locale-defaults";

/**
 * The settings rows every new email account starts with, whether it was made
 * by a password (/api/auth/register) or by a mailed code (email-code-service).
 * One place, so the two sign-ups cannot drift apart.
 */
export function newAccountDefaults(browser: {
  timeZone?: unknown;
  locale?: unknown;
}) {
  return {
    userSettings: {
      create: {
        theme: "dark",
        timeZone: "UTC",
        ...signupLocaleSettings(browser),
      },
    },
    autoScheduleSettings: {
      create: {
        workDays: "[1,2,3,4,5]",
        workHourStart: 9,
        workHourEnd: 17,
        bufferMinutes: 15,
      },
    },
  };
}
