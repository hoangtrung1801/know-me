import { describe, expect, test } from "bun:test";
import { router } from "@/ui/router";
import LandingPageDefault, { LandingPage } from "./LandingPage";

describe("LandingPage integration and specification", () => {
  test("LandingPage component is defined and exported as named and default", () => {
    expect(LandingPage).toBeDefined();
    expect(typeof LandingPage).toBe("function");
    expect(LandingPageDefault).toBeDefined();
    expect(LandingPageDefault).toBe(LandingPage);
  });

  test("router has /landing route registered in flat routes table", () => {
    const flatRoutes = router.routesByPath;
    expect(flatRoutes["/landing"]).toBeDefined();
  });
});
