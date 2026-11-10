import { credentialsEmail } from "@/lib/auth/credentials-email";

function form(body: string) {
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("credentialsEmail", () => {
  it("takes the last duplicate, as NextAuth does", async () => {
    const email = await credentialsEmail(
      form("email=junk%40x.test&email=Victim%40x.test&password=guess")
    );
    expect(email).toBe("victim@x.test");
  });

  it("reads a JSON body", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: " A@x.test " }),
    });
    expect(await credentialsEmail(request)).toBe("a@x.test");
  });

  it("is empty for a body NextAuth ignores", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "email=a@x.test",
    });
    expect(await credentialsEmail(request)).toBe("");
  });

  it("leaves the request body readable for NextAuth", async () => {
    const request = form("email=a%40x.test&password=p");
    await credentialsEmail(request);
    expect(await request.text()).toContain("password=p");
  });
});
