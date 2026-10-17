import { csvToImport, parseCsv } from "../import-csv";

const NOW = new Date("2026-10-14T09:00:00.000Z");

describe("parseCsv", () => {
  it("splits cells, honours quotes and doubled quotes, skips blank rows", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n\r\nd;e;f\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["d", "e", "f"],
    ]);
  });
});

describe("csvToImport", () => {
  it("reads the columns the header names", () => {
    const body = csvToImport(
      parseCsv(
        "Task,Due,Project,Minutes\nRenew the domain,2026-11-03,Admin,15\nCall Sam,,Admin,\nWrite brief,not a date,Work,45"
      ),
      NOW
    );
    expect(body.tasks.map((t) => t.title)).toEqual([
      "Renew the domain",
      "Call Sam",
      "Write brief",
    ]);
    expect(body.tasks[0]).toMatchObject({
      status: "todo",
      duration: 15,
      createdAt: NOW.toISOString(),
    });
    expect(body.tasks[0].dueDate).toMatch(/^2026-11-03/);
    // A blank or unreadable cell is left off, not guessed.
    expect(body.tasks[1].dueDate).toBeUndefined();
    expect(body.tasks[1].duration).toBeUndefined();
    expect(body.tasks[2].dueDate).toBeUndefined();
  });

  it("makes one project per name and points tasks at it", () => {
    const body = csvToImport(
      parseCsv("title,project\nA,Admin\nB,Admin\nC,Work"),
      NOW
    );
    expect(body.projects.map((p) => p.name)).toEqual(["Admin", "Work"]);
    expect(body.tasks[0].projectId).toBe(body.tasks[1].projectId);
    expect(body.tasks[2].projectId).toBe(body.projects[1].id);
  });

  it("takes the first column as the title when there is no header", () => {
    const body = csvToImport(parseCsv("Buy milk\nCall Sam"), NOW);
    expect(body.tasks.map((t) => t.title)).toEqual(["Buy milk", "Call Sam"]);
  });

  it("is empty for an empty file", () => {
    expect(csvToImport([], NOW)).toEqual({ tasks: [], projects: [] });
  });
});
