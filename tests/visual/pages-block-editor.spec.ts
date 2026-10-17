import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";

import { signInVisualUser } from "./helpers";

/* This drives the block editor's own controls (Add icon, slash menu), which the desktop and tablet
 * faces draw. The phone (< 700 px) reads a page in its own face (phone/docs):
 * the editor sits under its floating bar and the database has no view
 * switcher, so these steps do not exist there. The phone face has its own
 * tests (src/components/needt3/phone/docs/__tests__). */
test.skip(
  ({ viewport }) => (viewport?.width ?? 0) < 700,
  "The phone has its own document face."
);

test("Page blocks reconcile by stable ID and slash commands create canonical blocks", async ({
  page,
}) => {
  await signInVisualUser(page);
  const created = await page.request.post("/api/pages", {
    data: { title: "Canonical block regression", isPrivate: true },
  });
  expect(created.ok()).toBeTruthy();
  const createdBody = (await created.json()) as { page: { id: string } };
  const pageId = createdBody.page.id;
  const stableIntroId = `stable-intro-${pageId}`;
  const stableHeadingId = `stable-heading-${pageId}`;
  const stableQuoteId = `stable-quote-${pageId}`;

  const firstSave = await page.request.put(`/api/pages/${pageId}/blocks`, {
    data: {
      blocks: [
        {
          id: stableIntroId,
          type: "PARAGRAPH",
          content: {
            json: {
              type: "paragraph",
              attrs: { blockId: stableIntroId },
              content: [{ type: "text", text: "Persistent intro" }],
            },
          },
          position: 1024,
        },
        {
          id: stableHeadingId,
          type: "HEADING_2",
          content: {
            json: {
              type: "heading",
              attrs: { level: 2, blockId: stableHeadingId },
              content: [{ type: "text", text: "Original heading" }],
            },
          },
          position: 2048,
        },
      ],
    },
  });
  expect(firstSave.ok()).toBeTruthy();

  const reconciled = await page.request.put(`/api/pages/${pageId}/blocks`, {
    data: {
      blocks: [
        {
          id: stableIntroId,
          type: "PARAGRAPH",
          content: {
            json: {
              type: "paragraph",
              attrs: { blockId: stableIntroId },
              content: [{ type: "text", text: "Updated intro" }],
            },
          },
          position: 1024,
        },
        {
          id: stableQuoteId,
          type: "QUOTE",
          content: {
            json: {
              type: "blockquote",
              attrs: { blockId: stableQuoteId },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "New quote" }],
                },
              ],
            },
          },
          position: 2048,
        },
      ],
    },
  });
  expect(reconciled.ok()).toBeTruthy();
  const reconciledBody = (await reconciled.json()) as {
    page: { blocks: Array<{ id: string; type: string }> };
  };
  expect(reconciledBody.page.blocks).toMatchObject([
    { id: stableIntroId, type: "PARAGRAPH" },
    { id: stableQuoteId, type: "QUOTE" },
  ]);

  const revision = await prisma.pageRevision.findFirst({
    where: { pageId },
    orderBy: { createdAt: "desc" },
  });
  expect(revision?.snapshot).toMatchObject({
    blocks: [
      { id: stableIntroId, type: "PARAGRAPH" },
      { id: stableHeadingId, type: "HEADING_2" },
    ],
  });

  await page.goto(`/pages/${pageId}`, { waitUntil: "domcontentloaded" });
  const document = page.getByLabel("Page document");
  await expect(document).toContainText("Updated intro");
  await expect(document).toContainText("New quote");
  await page.getByRole("button", { name: "Add icon" }).click();
  await expect(page.getByRole("button", { name: "Remove icon" })).toBeVisible();

  await document.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/call");
  await expect(page.getByRole("menu", { name: "Page commands" })).toBeVisible();
  await page.getByRole("menuitem", { name: /Callout/ }).click();
  // A callout is a real block: it goes in empty, with the caret inside.
  await page.keyboard.type("Important context");
  await expect(document).toContainText("Important context");
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/pages/${pageId}`);
      const body = (await response.json()) as {
        page: { blocks: Array<{ id: string; type: string }> };
      };
      return body.page.blocks.map((block) => block.type);
    })
    .toContain("CALLOUT");

  const persisted = await page.request.get(`/api/pages/${pageId}`);
  const persistedBody = (await persisted.json()) as {
    page: { blocks: Array<{ id: string }> };
  };
  expect(persistedBody.page.blocks.map((block) => block.id)).toContain(
    stableIntroId
  );

  const assetUpload = await page.request.post(`/api/pages/${pageId}/assets`, {
    multipart: {
      file: {
        name: "private-note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("private page asset"),
      },
    },
  });
  expect(assetUpload.ok()).toBeTruthy();
  const assetBody = (await assetUpload.json()) as {
    asset: { id: string };
    url: string;
  };
  const assetDownload = await page.request.get(assetBody.url);
  expect(await assetDownload.text()).toBe("private page asset");

  const commentResponse = await page.request.post(
    `/api/pages/${pageId}/comments`,
    { data: { body: "Resolve this comment" } }
  );
  expect(commentResponse.ok()).toBeTruthy();
  const commentBody = (await commentResponse.json()) as {
    comment: { id: string };
  };
  const resolved = await page.request.patch(
    `/api/page-comments/${commentBody.comment.id}`,
    { data: { resolved: true } }
  );
  expect(resolved.ok()).toBeTruthy();
  expect((await resolved.json()).comment.resolvedAt).toBeTruthy();

  const templateName = `Template ${crypto.randomUUID().slice(0, 8)}`;
  const templateResponse = await page.request.post("/api/page-templates", {
    data: { pageId, name: templateName },
  });
  expect(templateResponse.ok()).toBeTruthy();
  const templateBody = (await templateResponse.json()) as {
    template: { id: string };
  };
  const instantiated = await page.request.post(
    `/api/page-templates/${templateBody.template.id}/instantiate`,
    { data: { title: "Instantiated regression page", isPrivate: true } }
  );
  expect(instantiated.ok()).toBeTruthy();
  const instantiatedBody = (await instantiated.json()) as {
    page: { id: string; blocks: Array<{ type: string }> };
  };
  expect(instantiatedBody.page.blocks.length).toBeGreaterThan(0);

  const formResponse = await page.request.post(`/api/pages/${pageId}/forms`, {
    data: {
      title: "Authenticated feedback",
      schema: {
        fields: [
          {
            id: "feedback",
            label: "Feedback",
            type: "textarea",
            required: true,
          },
        ],
      },
    },
  });
  expect(formResponse.ok()).toBeTruthy();
  const formBody = (await formResponse.json()) as { form: { id: string } };
  const invalidSubmission = await page.request.post(
    `/api/page-forms/${formBody.form.id}/submissions`,
    { data: { values: {} } }
  );
  expect(invalidSubmission.status()).toBe(400);
  const submission = await page.request.post(
    `/api/page-forms/${formBody.form.id}/submissions`,
    { data: { values: { feedback: "Authenticated response" } } }
  );
  expect(submission.ok()).toBeTruthy();

  await page.request.patch(`/api/pages/${pageId}`, {
    data: { isPrivate: false },
  });
  const proposalResponse = await page.request.post("/api/ai/page-proposals", {
    data: {
      pageId,
      summary: "Append an AI-reviewed note",
      operations: [
        {
          type: "append_block",
          blockType: "PARAGRAPH",
          content: { text: "AI-reviewed note" },
        },
      ],
    },
  });
  expect(proposalResponse.ok()).toBeTruthy();
  const proposalBody = (await proposalResponse.json()) as {
    proposal: { id: string };
  };
  const preview = await page.request.get(
    `/api/ai/page-proposals/${proposalBody.proposal.id}/preview`
  );
  expect((await preview.json()).proposal.status).toBe("PENDING");
  const approved = await page.request.post(
    `/api/ai/page-proposals/${proposalBody.proposal.id}/approve`
  );
  expect(approved.ok()).toBeTruthy();
  const afterAi = await page.request.get(`/api/pages/${pageId}`);
  const afterAiBody = (await afterAi.json()) as {
    page: { blocks: Array<{ id: string; createdBy: string }> };
  };
  expect(afterAiBody.page.blocks.map((block) => block.id)).toContain(
    stableIntroId
  );
  expect(
    afterAiBody.page.blocks.some((block) => block.createdBy === "AI")
  ).toBeTruthy();

  await page.request.delete(assetBody.url);
  await page.request.delete(`/api/page-templates/${templateBody.template.id}`);
  await page.request.delete(`/api/page-forms/${formBody.form.id}`);
  await page.request.delete(`/api/pages/${instantiatedBody.page.id}`);
  await page.request.patch(`/api/pages/${pageId}`, {
    data: { trashed: true },
  });
});
