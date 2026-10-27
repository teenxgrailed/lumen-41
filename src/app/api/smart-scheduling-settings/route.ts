import { NextRequest, NextResponse } from "next/server";

import {
  Prisma,
  SchedulingEnergyLevel,
  SchedulingPreferences,
} from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "SmartSchedulingSettingsAPI";

const DEFAULT_WORK_HOURS = {
  "1": { start: "09:00", end: "17:00" },
  "2": { start: "09:00", end: "17:00" },
  "3": { start: "09:00", end: "17:00" },
  "4": { start: "09:00", end: "17:00" },
  "5": { start: "09:00", end: "17:00" },
};

const DEFAULT_ENERGY_WINDOWS = [
  { startTime: "09:00", endTime: "12:00", energyLevel: "HIGH", sortOrder: 0 },
  { startTime: "13:00", endTime: "14:30", energyLevel: "LOW", sortOrder: 1 },
  {
    startTime: "15:00",
    endTime: "18:00",
    energyLevel: "MEDIUM",
    sortOrder: 2,
  },
] as const;

type EnergyWindowInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  energyLevel: SchedulingEnergyLevel;
  sortOrder?: number;
};

type PreferencesInput = Partial<
  Pick<
    SchedulingPreferences,
    | "bufferMinutes"
    | "maxDeepWorkPerDay"
    | "minBreakMinutes"
    | "autoRescheduleOnMiss"
    | "enableBodyDoubling"
    | "enableTaskBatching"
    | "hardStopTime"
    | "bufferMultiplier"
  >
> & {
  workHours?: Prisma.InputJsonValue;
};

function isEnergyLevel(value: unknown): value is SchedulingEnergyLevel {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH";
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function sanitizeEnergyWindows(value: unknown): EnergyWindowInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index): EnergyWindowInput | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const dayOfWeek = Number(candidate.dayOfWeek);

      if (
        !Number.isInteger(dayOfWeek) ||
        dayOfWeek < 0 ||
        dayOfWeek > 6 ||
        !isTime(candidate.startTime) ||
        !isTime(candidate.endTime) ||
        !isEnergyLevel(candidate.energyLevel)
      ) {
        return null;
      }

      return {
        dayOfWeek,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        energyLevel: candidate.energyLevel,
        sortOrder: Number.isInteger(candidate.sortOrder)
          ? Number(candidate.sortOrder)
          : index,
      };
    })
    .filter((window): window is EnergyWindowInput => window !== null);
}

function sanitizePreferences(value: unknown): PreferencesInput {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const data: PreferencesInput = {};

  if (typeof input.workHours === "object" && input.workHours !== null) {
    data.workHours = input.workHours as Prisma.InputJsonValue;
  }

  const numberFields = [
    "bufferMinutes",
    "maxDeepWorkPerDay",
    "minBreakMinutes",
  ] as const;

  for (const field of numberFields) {
    const numberValue = Number(input[field]);
    if (Number.isFinite(numberValue) && numberValue >= 0) {
      data[field] = Math.round(numberValue);
    }
  }

  const bufferMultiplier = Number(input.bufferMultiplier);
  if (Number.isFinite(bufferMultiplier) && bufferMultiplier >= 1) {
    data.bufferMultiplier = Number(bufferMultiplier.toFixed(2));
  }

  if (isTime(input.hardStopTime)) {
    data.hardStopTime = input.hardStopTime;
  }

  for (const field of [
    "autoRescheduleOnMiss",
    "enableBodyDoubling",
    "enableTaskBatching",
  ] as const) {
    if (typeof input[field] === "boolean") {
      data[field] = input[field];
    }
  }

  return data;
}

async function ensureSmartSchedulingSettings(userId: string) {
  const preferences = await prisma.schedulingPreferences.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      workHours: DEFAULT_WORK_HOURS,
      bufferMinutes: 15,
      maxDeepWorkPerDay: 180,
      minBreakMinutes: 15,
      autoRescheduleOnMiss: true,
      enableBodyDoubling: false,
      enableTaskBatching: true,
      hardStopTime: "18:00",
      bufferMultiplier: 1.3,
    },
  });

  const existingWindowCount = await prisma.energyProfileWindow.count({
    where: { userId },
  });

  if (existingWindowCount === 0) {
    await prisma.energyProfileWindow.createMany({
      data: [1, 2, 3, 4, 5].flatMap((dayOfWeek) =>
        DEFAULT_ENERGY_WINDOWS.map((window) => ({
          userId,
          dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          energyLevel: window.energyLevel,
          sortOrder: window.sortOrder,
        }))
      ),
      skipDuplicates: true,
    });
  }

  const energyProfile = await prisma.energyProfileWindow.findMany({
    where: { userId },
    orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
  });

  return { preferences, energyProfile };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const settings = await ensureSmartSchedulingSettings(auth.userId);
    return NextResponse.json(settings);
  } catch (error) {
    logger.error(
      "Failed to fetch smart scheduling settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch smart scheduling settings" },
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

    await ensureSmartSchedulingSettings(auth.userId);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const preferences = sanitizePreferences(body.preferences);
    const energyProfile = sanitizeEnergyWindows(body.energyProfile);

    const result = await prisma.$transaction(async (tx) => {
      const updatedPreferences = await tx.schedulingPreferences.upsert({
        where: { userId: auth.userId },
        update: preferences,
        create: {
          userId: auth.userId,
          workHours: DEFAULT_WORK_HOURS,
          bufferMinutes: 15,
          maxDeepWorkPerDay: 180,
          minBreakMinutes: 15,
          autoRescheduleOnMiss: true,
          enableBodyDoubling: false,
          enableTaskBatching: true,
          hardStopTime: "18:00",
          bufferMultiplier: 1.3,
          ...preferences,
        },
      });

      if (energyProfile.length > 0) {
        await tx.energyProfileWindow.deleteMany({
          where: { userId: auth.userId },
        });
        await tx.energyProfileWindow.createMany({
          data: energyProfile.map((window, index) => ({
            userId: auth.userId,
            dayOfWeek: window.dayOfWeek,
            startTime: window.startTime,
            endTime: window.endTime,
            energyLevel: window.energyLevel,
            sortOrder: window.sortOrder ?? index,
          })),
        });
      }

      const updatedEnergyProfile = await tx.energyProfileWindow.findMany({
        where: { userId: auth.userId },
        orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }],
      });

      return {
        preferences: updatedPreferences,
        energyProfile: updatedEnergyProfile,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error(
      "Failed to update smart scheduling settings",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update smart scheduling settings" },
      { status: 500 }
    );
  }
}
