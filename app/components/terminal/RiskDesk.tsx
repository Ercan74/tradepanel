import { InfoBox, Panel, RiskBar } from "./Panel";

export default function RiskDesk({
  exposure,
  openPnl,
  openCount,
}: {
  exposure: number;
  openPnl: number;
  openCount: number;
}) {
  return (
    <Panel title="Risk Desk" sub="Pozisyon yoğunluğu, risk ve bias">
      <div className="space-y-4">
        <RiskBar label="Exposure" value={exposure} />
        <RiskBar label="Capacity" value={(openCount / 5) * 100} />

        <div className="grid grid-cols-2 gap-3">
          <InfoBox
            label="Risk Level"
            value={exposure >= 80 ? "HIGH" : exposure >= 40 ? "NORMAL" : "LOW"}
            tone={exposure >= 80 ? "warn" : "good"}
          />

          <InfoBox
            label="PnL Bias"
            value={openPnl >= 0 ? "POSITIVE" : "NEGATIVE"}
            tone={openPnl >= 0 ? "good" : "bad"}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-xs text-slate-500">Automation Policy</p>
          <p className="mt-2 text-sm text-slate-300">
            Max 5 açık pozisyon. Exposure %80 üzeri olduğunda yeni sinyaller risk
            filtresine alınmalı.
          </p>
        </div>
      </div>
    </Panel>
  );
}