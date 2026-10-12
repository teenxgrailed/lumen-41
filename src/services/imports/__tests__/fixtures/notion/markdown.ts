/**
 * Hand-written Notion enhanced markdown (the output shape documented at
 * developers.notion.com/guides/data-apis/enhanced-markdown). Tabs indent
 * children, as Notion does.
 */

const md = (...lines: string[]) => lines.join("\n");

export const NOTION_PAGE_URL = (id: string) =>
  `https://www.notion.so/${id.replace(/-/g, "")}`;

export const calloutMd = md(
  "Before",
  '<callout icon="💡" color="blue_bg">',
  "\tShip the **MVP** by Friday.",
  "\tSecond line of the callout.",
  "</callout>",
  "After"
);

export const toggleMd = md(
  "<details>",
  "<summary>More detail</summary>",
  "\tHidden paragraph one.",
  "\t- hidden bullet",
  "</details>",
  '# Open heading {toggle="true"}',
  "\tChild of the toggle heading."
);

export const columnsMd = md(
  "<columns>",
  "\t<column>",
  "\t\tLeft column text.",
  "\t\t- left bullet",
  "\t</column>",
  "\t<column>",
  "\t\tRight column text.",
  "\t</column>",
  "</columns>"
);

export const listsMd = md(
  "- Parent",
  "\t- Child one",
  "\t\t- Grandchild",
  "\t- Child two",
  "1. First",
  "\t1. Nested first",
  "2. Second",
  "- [ ] Open task",
  "- [x] Done task"
);

export const tableMd = md(
  '<table fit-page-width="true" header-row="true">',
  "\t<tr>",
  "\t\t<td>Name</td>",
  "\t\t<td>Qty</td>",
  "\t</tr>",
  "\t<tr>",
  "\t\t<td>**Apples** | red</td>",
  "\t\t<td>3</td>",
  "\t</tr>",
  "</table>"
);

export const codeMd = md(
  "```ts",
  "const html = '<callout>not a tag</callout>';",
  "const price = '$5 and $6';",
  "```",
  "Text after code."
);

export const equationMd = md(
  "$$",
  "E = mc^2",
  "$$",
  "Inline $a+b$ math and \\$5 money."
);

export const mentionsMd = md(
  'Ask <mention-user url="user://abc">Ada</mention-user> about',
  '<mention-page url="PAGE_B_URL">Roadmap</mention-page>, due',
  '<mention-date start="2026-10-20" end="2026-10-22"/> or',
  '<mention-page url="https://www.notion.so/ffffffffffffffffffffffffffffffff">Gone</mention-page>.',
  '<span color="red">Red</span> and <span underline="true">underlined</span> text<br>second line'
);

export const referencesMd = (pageUrl: string, databaseUrl: string) =>
  md(
    `<page url="${pageUrl}">Roadmap</page>`,
    `<database url="${databaseUrl}" inline="false">Tasks DB</database>`,
    '<page url="https://www.notion.so/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee">Unshared child</page>'
  );

export const mediaMd = (imageUrl: string, fileUrl: string) =>
  md(
    `![A diagram](${imageUrl})`,
    `<file src="${fileUrl}">Spec sheet</file>`,
    '<video src="https://example.com/video.mp4">Demo</video>',
    "![Remote](https://images.example.com/photo.jpg)"
  );

export const unknownMd = (bookmarkBlockId: string, embedBlockId: string) =>
  md(
    `<unknown url="https://www.notion.so/page#${bookmarkBlockId.replace(/-/g, "")}" alt="bookmark"/>`,
    `<unknown url="https://www.notion.so/page#${embedBlockId.replace(/-/g, "")}" alt="embed"/>`,
    '<unknown url="https://www.notion.so/page#99999999999999999999999999999999" alt="breadcrumb"/>'
  );

export const syncedMd = md(
  '<synced_block url="https://www.notion.so/x#1">',
  "\tShared text.",
  "</synced_block>",
  "<table_of_contents/>",
  "<empty-block/>",
  '<custom-block definition-id="11111111-1111-4111-8111-111111111111" />'
);
