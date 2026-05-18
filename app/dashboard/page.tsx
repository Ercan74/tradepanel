"use client";

import InstitutionalOperatingShell from "@/components/terminal/InstitutionalOperatingShell";
import { useTradingIntelligence } from "@/components/terminal/useTradingIntelligence";

export default function DashboardPage() {
  const intelligence = useTradingIntelligence();

  return <InstitutionalOperatingShell {...intelligence} />;
}