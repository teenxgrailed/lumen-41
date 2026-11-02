import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import SignInPage from "@/app/(app)/auth/signin/page";

import { settingsSectionFromUrl } from "@/components/needt3/settings/derive";

import { safeCallbackPath } from "@/lib/auth/callback-url";
import {
  rememberPostAuthPath,
  takePostAuthPath,
} from "@/lib/auth/post-auth-path";
import {
  STUDENT_OFFER_PATH,
  signInCallbackFor,
  studentOfferFromSearch,
} from "@/lib/students/offer";

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/lib/needt3/request-phone-ui", () => ({
  requestPhoneUi: jest
    .fn()
    .mockResolvedValue({ initialUi: "desktop", uiForced: false }),
}));
jest.mock("@/components/needt3/auth/SignInRoute", () => ({
  V3SignInRoute: () => null,
}));

/** A cookie jar that behaves like `document.cookie` for one cookie name. */
function jar() {
  const store = new Map<string, string>();
  return {
    get cookie() {
      return [...store].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair, ...attrs] = line.split(";").map((p) => p.trim());
      const [name, value] = [
        pair.slice(0, pair.indexOf("=")),
        pair.slice(pair.indexOf("=") + 1),
      ];
      if (attrs.includes("Max-Age=0")) store.delete(name);
      else store.set(name, value);
    },
  };
}

describe("plan=student", () => {
  beforeEach(() => jest.clearAllMocks());

  it("plan=student survives the sign-in redirect", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const element = (await SignInPage({
      searchParams: Promise.resolve({ plan: "student" }),
    })) as { props: { callbackUrl?: string } };

    // The sign-in screen gets it as its callbackUrl: credentials and every
    // OAuth provider's callbackUrl carry it from there.
    expect(element.props.callbackUrl).toBe(STUDENT_OFFER_PATH);
    expect(safeCallbackPath(element.props.callbackUrl)).toBe(
      STUDENT_OFFER_PATH
    );

    // An OAuth sign-up, the 16+ step, onboarding and email confirmation drop
    // the callbackUrl; the post-auth cookie brings it back, once.
    const cookies = jar();
    rememberPostAuthPath(element.props.callbackUrl, cookies);
    expect(takePostAuthPath(cookies)).toBe(STUDENT_OFFER_PATH);
    expect(takePostAuthPath(cookies)).toBeNull();

    // And Settings opens on Plan with the offer.
    const search = new URL(STUDENT_OFFER_PATH, "https://needt.invalid").search;
    expect(settingsSectionFromUrl("", search)).toBe("plan");
    expect(studentOfferFromSearch(search)).toBe(true);
  });

  it("someone already signed in goes straight to the offer", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: "u1" } });

    await SignInPage({ searchParams: Promise.resolve({ plan: "student" }) });

    expect(redirect).toHaveBeenCalledWith(STUDENT_OFFER_PATH);
  });

  it("an explicit callbackUrl still wins, and other plans change nothing", () => {
    expect(signInCallbackFor("student", "/settings#plan")).toBe(
      "/settings#plan"
    );
    expect(signInCallbackFor("pro", undefined)).toBeUndefined();
    expect(signInCallbackFor(" Student ", null)).toBe(STUDENT_OFFER_PATH);
  });
});
