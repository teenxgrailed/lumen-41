import {
  candidateDomains,
  deriveUniversityDomains,
  emailDomain,
  isPublicSuffix,
  isUniversityEmail,
  universityDomainFor,
} from "@/lib/students/university-domains";

describe("university email check", () => {
  it("a university address counts", () => {
    expect(universityDomainFor("ana@ethz.ch")).toBe("ethz.ch");
    expect(universityDomainFor("ana@mit.edu")).toBe("mit.edu");
    expect(universityDomainFor("ana@ox.ac.uk")).toBe("ox.ac.uk");
  });

  it("subdomain of a university counts", () => {
    expect(universityDomainFor("name@cs.ethz.ch")).toBe("ethz.ch");
    expect(universityDomainFor("Name@Student.CS.ETHZ.ch ")).toBe("ethz.ch");
  });

  it("gmail address gets no discount", () => {
    expect(isUniversityEmail("someone@gmail.com")).toBe(false);
    expect(isUniversityEmail("someone@outlook.com")).toBe(false);
  });

  it("a public suffix alone never matches, even if a list contains it", () => {
    const poisoned = new Set(["ac.uk", "edu", "edu.au", "com.br"]);
    expect(universityDomainFor("x@anything.ac.uk", poisoned)).toBeNull();
    expect(universityDomainFor("x@made-up.edu", poisoned)).toBeNull();
    expect(universityDomainFor("x@shop.edu.au", poisoned)).toBeNull();
    expect(universityDomainFor("x@loja.com.br", poisoned)).toBeNull();
    expect(isPublicSuffix("ac.uk")).toBe(true);
    expect(isPublicSuffix("edu")).toBe(true);
    expect(isPublicSuffix("ethz.ch")).toBe(false);
  });

  it("an unknown school is not recognised", () => {
    expect(isUniversityEmail("x@not-a-real-school-needt.example")).toBe(false);
  });

  it("rejects what is not an address", () => {
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("a@localhost")).toBeNull();
    expect(emailDomain("")).toBeNull();
    expect(emailDomain(null)).toBeNull();
    expect(isUniversityEmail("@ethz.ch")).toBe(false);
  });

  it("walks parents down to two labels", () => {
    expect(candidateDomains("a.b.ethz.ch")).toEqual([
      "a.b.ethz.ch",
      "b.ethz.ch",
      "ethz.ch",
    ]);
  });

  it("derives a clean, sorted set from the Hipo JSON shape", () => {
    expect(
      deriveUniversityDomains([
        { name: "B", domains: ["Uni-B.edu", "uni-b.edu"] },
        { name: "A", domains: ["a.ac.uk", "ac.uk", "edu", 7] },
        { name: "C", domains: ["gmail.com", "bad domain"] },
        { name: "D" },
        null,
      ])
    ).toEqual(["a.ac.uk", "uni-b.edu"]);
    expect(() => deriveUniversityDomains({ domains: [] })).toThrow();
  });
});
