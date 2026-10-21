// Rows for the scroll scenarios, created for the user that signed in through the
// normal sign-in form. Direct database writes; the app gets no test-only route.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.PROBE_EMAIL ?? "ci-pro@needt.local";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const member = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
  });
  for (let i = 0; i < 30; i++)
    await prisma.task.create({
      data: {
        userId: user.id,
        workspaceId: member?.workspaceId,
        title: `Row ${i + 1}`,
        status: "todo",
        dueDate: new Date(),
      },
    });
  console.log(`seeded 30 tasks for ${email} in ${member?.workspaceId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
