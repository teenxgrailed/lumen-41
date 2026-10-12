import { notFound } from "next/navigation";

import { TaskFixtures } from "@/components/needt3/task/TaskFixtures";

import { APP_NAME } from "@/lib/app-config";
import { isAdmin } from "@/lib/auth/is-admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `${APP_NAME} v3 task fixtures`,
};

/** T06 fixture sheet: <Task> row / card / block × the eight states. */
export default async function V3TaskFixturesPage() {
  if (process.env.NODE_ENV === "production" && !(await isAdmin())) {
    notFound();
  }

  return <TaskFixtures />;
}
