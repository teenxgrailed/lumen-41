export type CalendarProvider = "google" | "outlook";

export interface CalendarConnectionNotice {
  description: string;
  provider?: CalendarProvider;
  title: string;
  tone: "error" | "success";
}

const PROVIDER_NAMES: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  outlook: "Outlook Calendar",
};

export function calendarProviderName(provider: CalendarProvider) {
  return PROVIDER_NAMES[provider];
}

export function calendarConnectionNotice(
  errorCode: string | null,
  successCode: string | null,
  provider: string | null
): CalendarConnectionNotice | null {
  const safeProvider =
    provider === "google" || provider === "outlook" ? provider : undefined;
  const providerName = safeProvider
    ? calendarProviderName(safeProvider)
    : "Calendar";

  if (successCode === "connected") {
    return {
      title: `${providerName} connected`,
      description: "Your calendars are ready to use in Needt.",
      provider: safeProvider,
      tone: "success",
    };
  }

  if (!errorCode) return null;

  if (errorCode === "consent_denied") {
    return {
      title: `${providerName} wasn’t connected`,
      description: "Permission was not granted. You can try connecting again.",
      provider: safeProvider,
      tone: "error",
    };
  }
  if (errorCode === "limit_reached") {
    return {
      title: `${providerName} wasn’t connected`,
      description:
        "Your plan has no room for another calendar account. Disconnect one or upgrade, then try again.",
      provider: safeProvider,
      tone: "error",
    };
  }
  if (errorCode === "missing_code") {
    return {
      title: `${providerName} didn’t finish connecting`,
      description: "The provider did not return a sign-in code. Try again.",
      provider: safeProvider,
      tone: "error",
    };
  }
  if (errorCode === "invalid_state") {
    return {
      title: `${providerName} connection expired`,
      description: "Start the connection again from this browser.",
      provider: safeProvider,
      tone: "error",
    };
  }

  return {
    title: `${providerName} couldn’t connect`,
    description: "Try connecting again. Your existing Needt data is unchanged.",
    provider: safeProvider,
    tone: "error",
  };
}

export function calendarProviderNeedsReconnect(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: { error?: unknown } };
    status?: unknown;
    statusCode?: unknown;
  };
  const status = Number(
    candidate.statusCode ?? candidate.status ?? candidate.response?.status
  );
  if (status === 401) return true;

  const detail = [
    candidate.code,
    candidate.message,
    candidate.response?.data?.error,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /invalid_grant|interaction_required|refresh tokens?|token refresh|token.*revoked|token.*expired|unauthori[sz]ed/.test(
    detail
  );
}
