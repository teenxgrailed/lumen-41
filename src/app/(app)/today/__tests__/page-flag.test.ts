/**
 * The Today route reads `home_v2` on the server and hands it to Home. Flag off
 * (or unreadable, or signed out) is the current Home: `v2` is false and nothing
 * else about the page changes.
 */
import { createElement } from "react";

import { HomeScreen } from "@/components/needt3/home/HomeScreen";

import { HOME_V2, KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags-keys";

import TodayPage from "../page";

const mockSession = jest.fn();
const mockEnabled = jest.fn();

jest.mock("next-auth", () => ({ getServerSession: () => mockSession() }));
jest.mock("next/headers", () => ({
  cookies: async () => ({ has: () => false }),
}));
jest.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: async () => ({}),
}));
jest.mock("@/lib/feature-flags", () => ({
  homeV2Enabled: (id: string) => mockEnabled(id),
}));
jest.mock("@/lib/onboarding/entry", () => ({
  BANNER_DISMISSED_COOKIE: "d",
  RESUMED_COOKIE: "r",
  todayOnboardingGuard: async () => ({ kind: "none" }),
}));
jest.mock("@/lib/needt3/section-titles", () => ({
  sectionMetadata: () => ({}),
}));
jest.mock("@/components/needt3/home/HomeScreen", () => ({
  HomeScreen: () => null,
}));
jest.mock("@/components/needt3/home/OnboardingResumeBanner", () => ({
  OnboardingResumeProvider: ({ children }: { children: unknown }) => children,
}));

/** The HomeScreen element inside the provider the page returns. */
const homeProps = async () => {
  const tree = (await TodayPage()) as {
    props: { children: { type: unknown; props: { v2: boolean } } };
  };
  const home = tree.props.children;
  expect(home.type).toBe(HomeScreen);
  return home.props;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ user: { id: "u1" } });
});

it("flag off: the current Home (v2 false)", async () => {
  mockEnabled.mockResolvedValue(false);
  expect((await homeProps()).v2).toBe(false);
  expect(mockEnabled).toHaveBeenCalledWith("u1");
});

it("flag on: v2 true", async () => {
  mockEnabled.mockResolvedValue(true);
  expect((await homeProps()).v2).toBe(true);
});

it("an unreadable flag never costs the person their Home", async () => {
  mockEnabled.mockRejectedValue(new Error("db down"));
  expect((await homeProps()).v2).toBe(false);
});

it("signed out: the flag is not even read", async () => {
  mockSession.mockResolvedValue(null);
  expect((await homeProps()).v2).toBe(false);
  expect(mockEnabled).not.toHaveBeenCalled();
});

it("home_v2 is a known flag, so the admin API can switch it", () => {
  expect(HOME_V2).toBe("home_v2");
  expect(KNOWN_FEATURE_FLAGS[HOME_V2]).toBeTruthy();
  void createElement;
});
