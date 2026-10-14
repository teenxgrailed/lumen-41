export type TimeFormat = "12h" | "24h";
export type WeekStartDay = "monday" | "sunday";
/**
 * The four themes a person can pick outright. "Drift" is orthogonal to these
 * and is not a theme; it never appears in this union.
 */
export type ResolvedThemeMode = "paper" | "warm" | "dim" | "dark";

/**
 * System is a pair, not a theme: the person chooses which theme fills the
 * light half of the OS preference and which fills the dark half.
 */
export interface SystemThemePair {
  light: ResolvedThemeMode;
  dark: ResolvedThemeMode;
}

export type ThemeMode = ResolvedThemeMode | "system";
export type CalendarView = "day" | "week" | "month" | "agenda";

export interface UserSettings {
  theme: ThemeMode;
  /**
   * Which pair "system" resolves to. Client-only: the Prisma UserSettings row
   * has no column for it, so it is stripped before the settings PATCH and
   * lives in the persisted zustand blob the anti-FOUC script also reads.
   */
  systemTheme?: SystemThemePair;
  defaultView: CalendarView;
  timeZone: string;
  secondaryTimeZone: string | null;
  weekStartDay: WeekStartDay;
  timeFormat: TimeFormat;
}

export interface CalendarSettings {
  defaultCalendarId?: string;
  workingHours: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string; // HH:mm format
    days: number[]; // 0-6, where 0 is Sunday
  };
  eventDefaults: {
    defaultDuration: number; // minutes
    defaultColor: string;
    defaultReminder: number; // minutes before event
  };
  refreshInterval: number; // minutes
}

export interface NotificationSettings {
  emailNotifications: boolean;
  dailyEmailEnabled: boolean; // Controls whether the user receives daily email updates
  notifyFor: {
    eventInvites: boolean;
    eventUpdates: boolean;
    eventCancellations: boolean;
    eventReminders: boolean;
  };
  defaultReminderTiming: number[]; // minutes before event, multiple allowed
  webPushConfigured: boolean;
  webPushEnabled: boolean;
  webPushSubscription?: PushSubscriptionJSON | null;
}

export interface IntegrationSettings {
  googleCalendar: {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // minutes
  };
  outlookCalendar: {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // minutes
  };
}

export interface DataSettings {
  autoBackup: boolean;
  backupInterval: number; // days
  retainDataFor: number; // days
}

export interface AutoScheduleSettings {
  workDays: string; // JSON string of numbers 0-6
  workHourStart: number; // 0-23
  workHourEnd: number; // 0-23
  selectedCalendars: string; // JSON string of calendar IDs
  bufferMinutes: number;
  highEnergyStart: number | null;
  highEnergyEnd: number | null;
  mediumEnergyStart: number | null;
  mediumEnergyEnd: number | null;
  lowEnergyStart: number | null;
  lowEnergyEnd: number | null;
  groupByProject: boolean;
  pushTasksToCalendar?: boolean; // Push scheduled task blocks to calendar
  pushTasksFeedId?: string | null; // Calendar feed ID for pushing tasks
}

// Define a type for log retention periods
export interface LogRetention {
  debug?: number; // days
  info?: number; // days
  warn?: number; // days
  error?: number; // days
}

export interface SystemSettings {
  googleClientId?: string;
  googleClientSecret?: string;
  outlookClientId?: string;
  outlookClientSecret?: string;
  outlookTenantId?: string;
  /* Sign-in providers; the secrets arrive masked (SECRET_MASK). */
  appleClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  discordClientId?: string;
  discordClientSecret?: string;
  twitterClientId?: string;
  twitterClientSecret?: string;
  linkedinClientId?: string;
  linkedinClientSecret?: string;
  openaiSiwcClientId?: string;
  openaiSiwcClientSecret?: string;
  logLevel: "none" | "debug";
  logRetention?: LogRetention; // Retention periods per log level
  logDestination?: string; // "db", "file", or "both"
  disableHomepage?: boolean; // Whether to disable the homepage and redirect to login/calendar
  publicSignup?: boolean; // Whether public signup is enabled
  requireEmailVerificationBeforeAccess?: boolean;
  resendApiKey?: string; // API key for Resend email service
}

export interface Settings {
  user: UserSettings;
  calendar: CalendarSettings;
  notifications: NotificationSettings;
  integrations: IntegrationSettings;
  data: DataSettings;
  autoSchedule: AutoScheduleSettings;
  system: SystemSettings;
}
