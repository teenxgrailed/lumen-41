import { RouteLoading } from "@/components/needt3/states/RouteLoading";

/**
 * The route boundary for every place in the app frame. Besides showing the
 * skeleton, its existence is what lets Next prefetch a dynamic page's layout
 * chain, so a place switch answers at once instead of waiting for the server.
 */
export default function Loading() {
  return <RouteLoading />;
}
