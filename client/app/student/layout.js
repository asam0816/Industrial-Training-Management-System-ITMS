"use client";

import RoleGuard from "../../components/RoleGuard";
import AppShell from "../../components/AppShell";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function Layout({ children }) {
  return (
    <>
      <RoleGuard roles={["STUDENT"]}>
        <AppShell>{children}</AppShell>
      </RoleGuard>

      <SpeedInsights />
    </>
  );
}
