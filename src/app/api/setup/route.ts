import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";

import { logger } from "@/lib/logger";
import { signupLocaleSettings } from "@/lib/needt3/locale-defaults";
import { prisma } from "@/lib/prisma";
import { migrateExistingData } from "@/lib/setup-migration";
import { sealSystemSettingsSecrets } from "@/lib/system-settings-secrets";

const LOG_SOURCE = "SetupAPI";

/**
 * POST /api/setup
 * Creates the initial admin user and migrates existing data
 */
export async function POST(request: Request) {
  try {
    // Check if any users already exist
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      logger.warn("Setup attempted when users already exist", {}, LOG_SOURCE);
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, email, password } = body;

    // Validate input
    if (!name || !email || !password) {
      logger.warn(
        "Invalid setup request - missing required fields",
        {},
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await hash(password, 10);

    // Create the admin user
    const adminUser = await prisma.user.create({
      data: {
        name,
        email,
        role: "admin",
        // Store the hashed password in a way that's compatible with NextAuth
        // This assumes you'll be using the credentials provider in the future
        accounts: {
          create: {
            type: "credentials",
            provider: "credentials",
            providerAccountId: email,
            // Store the hashed password in a field that won't conflict with OAuth providers
            id_token: hashedPassword,
          },
        },
      },
    });

    logger.info("Created admin user", { userId: adminUser.id }, LOG_SOURCE);

    // Migrate existing data to the admin user
    await migrateExistingData(adminUser.id);

    // Create default settings for the admin user
    const { resendApiKey: setupResendApiKey } = sealSystemSettingsSecrets({
      resendApiKey: process.env.RESEND_API_KEY || null,
    });

    await Promise.all([
      // Create user settings
      prisma.userSettings.create({
        data: {
          userId: adminUser.id,
          theme: "dark",
          defaultView: "week",
          // The schema defaults until the form sends the browser's zone and
          // language; without them the first signed-in load fills them in.
          timeZone: "UTC",
          weekStartDay: "sunday",
          timeFormat: "12h",
          ...signupLocaleSettings({
            timeZone: body.timeZone,
            locale: body.locale,
          }),
        },
      }),

      // Create calendar settings
      prisma.calendarSettings.create({
        data: {
          userId: adminUser.id,
          workingHoursEnabled: true,
          workingHoursStart: "09:00",
          workingHoursEnd: "17:00",
          workingHoursDays: "[1,2,3,4,5]",
          defaultDuration: 60,
          defaultColor: "#6366F1",
          defaultReminder: 30,
          refreshInterval: 5,
        },
      }),

      // Create notification settings
      prisma.notificationSettings.create({
        data: {
          userId: adminUser.id,
          emailNotifications: true,
          eventInvites: true,
          eventUpdates: true,
          eventCancellations: true,
          eventReminders: true,
          defaultReminderTiming: "[30]",
        },
      }),

      // Create integration settings
      prisma.integrationSettings.create({
        data: {
          userId: adminUser.id,
          googleCalendarEnabled: true,
          googleCalendarAutoSync: true,
          googleCalendarInterval: 5,
          outlookCalendarEnabled: true,
          outlookCalendarAutoSync: true,
          outlookCalendarInterval: 5,
        },
      }),

      // Create data settings
      prisma.dataSettings.create({
        data: {
          userId: adminUser.id,
          autoBackup: true,
          backupInterval: 7,
          retainDataFor: 365,
        },
      }),

      prisma.systemSettings.upsert({
        where: { id: "default" },
        update: {
          publicSignup: true,
          resendApiKey: setupResendApiKey,
        },
        create: {
          id: "default",
          logLevel: "error",
          logDestination: "db",
          logRetention: {
            error: 30,
            warn: 14,
            info: 7,
            debug: 3,
          },
          publicSignup: true,
          resendApiKey: setupResendApiKey,
        },
      }),
    ]);

    logger.info("Created default settings for admin user", {}, LOG_SOURCE);

    return NextResponse.json(
      { success: true, message: "Setup completed successfully" },
      { status: 200 }
    );
  } catch (error) {
    logger.error(
      "Setup process failed",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        {
          error:
            "Database is not reachable. Start Postgres and run `prisma migrate deploy`, then try setup again.",
          detail: error.message,
        },
        { status: 503 }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: `Database setup failed (${error.code}). ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to complete setup for an unknown reason",
      },
      { status: 500 }
    );
  }
}
