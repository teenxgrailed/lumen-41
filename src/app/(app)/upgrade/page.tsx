import { UpgradeRedirect } from "@/components/needt3/paywall/UpgradeRedirect";

export const metadata = { title: "Keep Pro" };

export const dynamic = "force-dynamic";

/** The upgrade card is a sheet over Today; /upgrade opens it. */
export default function UpgradePage() {
  return <UpgradeRedirect />;
}
