import {
  BRIEF_AUTHORS,
  briefAuthor,
} from "@/components/needt/home/brief-types";

/* Authorship is carried by ink and a margin mark, never by a byline. That
 * only works if every author has ink of its own — an id the product does not
 * recognise used to resolve to `you`, which made a connected tool's writing
 * indistinguishable from the person's. */
describe("brief authorship", () => {
  it("gives a named tool its own ink", () => {
    expect(briefAuthor("linear")).toBe(BRIEF_AUTHORS.linear);
    expect(briefAuthor("needt")).toBe(BRIEF_AUTHORS.needt);
  });

  it("never passes an unknown author off as you", () => {
    for (const id of ["notion", "asana", "", "YOU", "agent:7"]) {
      const author = briefAuthor(id);
      expect(author.color).not.toBe(BRIEF_AUTHORS.you.color);
      expect(author.name).not.toBe(BRIEF_AUTHORS.you.name);
    }
  });

  it("uses the name a tool gave when it connected, and its id otherwise", () => {
    expect(briefAuthor("notion", "Notion").name).toBe("Notion");
    expect(briefAuthor("notion").name).toBe("notion");
    expect(briefAuthor("", "  ").name).toBe("Agent");
  });

  it("keeps you silent", () => {
    expect(briefAuthor("you")).toBe(BRIEF_AUTHORS.you);
  });
});
