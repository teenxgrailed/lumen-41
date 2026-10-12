import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  notificationSettingsV3FieldsSchema,
  parseV3Fields,
} from "@/lib/needt3/api-fields";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

const LOG_SOURCE = "NotificationSettingsAPI";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const webPushConfigured = getVapidConfiguration().configured;

    // Get the notification settings or create default ones if they don't exist
    const settings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        emailNotifications: true,
        dailyEmailEnabled: true,
        eventInvites: true,
        eventUpdates: true,
        eventCancellations: true,
        eventReminders: true,
        defaultReminderTiming: "[30]",
        webPushEnabled: false,
      },
    });

    // Transform the response to match the store's structure
    return NextResponse.json({
      emailNotifications: settings.emailNotifications,
      dailyEmailEnabled: settings.dailyEmailEnabled,
      notifyFor: {
        eventInvites: settings.eventInvites,
        eventUpdates: settings.eventUpdates,
        eventCancellations: settings.eventCancellations,
        eventReminders: settings.eventReminders,
      },
      defaultReminderTiming: JSON.parse(settings.defaultReminderTiming),
      webPushConfigured,
      webPushEnabled: settings.webPushEnabled,
      webPushSubscription: settings.webPushSubscription,
      dailyPlan: settings.dailyPlan,
      dailyPlanTime: settings.dailyPlanTime,
      mailPlan: settings.mailPlan,
      nudges: settings.nudges,
      weeklyReview: settings.weeklyReview,
    });
  } catch (error) {
    logger.error(
      "Failed to fetch notification settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch notification settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const updates = await request.json();
    const v3 = parseV3Fields(notificationSettingsV3FieldsSchema, updates);
    if (!v3.ok) {
      return NextResponse.json({ error: v3.error }, { status: 400 });
    }
    const webPushConfigured = getVapidConfiguration().configured;

    // Transform the updates to match the database schema
    const dbUpdates = {
      emailNotifications: updates.emailNotifications,
      dailyEmailEnabled: updates.dailyEmailEnabled,
      eventInvites: updates.eventInvites,
      eventUpdates: updates.eventUpdates,
      eventCancellations: updates.eventCancellations,
      eventReminders: updates.eventReminders,
      defaultReminderTiming: updates.defaultReminderTiming
        ? JSON.stringify(updates.defaultReminderTiming)
        : undefined,
      webPushEnabled: updates.webPushEnabled,
      webPushSubscription: updates.webPushSubscription,
      ...v3.data,
    };

    const settings = await prisma.notificationSettings.upsert({
      where: { userId },
      update: dbUpdates,
      create: {
        userId,
        ...dbUpdates,
      },
    });

    // Transform the response to match the store's structure
    return NextResponse.json({
      emailNotifications: settings.emailNotifications,
      dailyEmailEnabled: settings.dailyEmailEnabled,
      notifyFor: {
        eventInvites: settings.eventInvites,
        eventUpdates: settings.eventUpdates,
        eventCancellations: settings.eventCancellations,
        eventReminders: settings.eventReminders,
      },
      defaultReminderTiming: JSON.parse(settings.defaultReminderTiming),
      webPushConfigured,
      webPushEnabled: settings.webPushEnabled,
      webPushSubscription: settings.webPushSubscription,
      dailyPlan: settings.dailyPlan,
      dailyPlanTime: settings.dailyPlanTime,
      mailPlan: settings.mailPlan,
      nudges: settings.nudges,
      weeklyReview: settings.weeklyReview,
    });
  } catch (error) {
    logger.error(
      "Failed to update notification settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update notification settings" },
      { status: 500 }
    );
  }
}
