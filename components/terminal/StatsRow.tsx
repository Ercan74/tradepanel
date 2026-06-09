import { pnlColor } from "./helpers";

type Stats = {
  openPnlAmount: number;
  totalPnlAmount: number;
  openPositions: number;
  longCount: number;
  shortCount: number;
  winRate: number;
  exposurePct: number;
  livePriceCount: number;
  stalePriceCount: number;
};

export default function StatsRow({ stats }: { stats?: Stats }) {
  const safe = stats ?? {
    openPnlAmount: 0,
    totalPnlAmount: 0,
    openPositions: 0,
    longCount: 0,
    shortCount: 0,
    winRate: 0,
    exposurePct: 0,
    livePriceCount: 0,
    stalePriceCount: 0,
  };

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
      <Card
        title="Open PnL"
        value={`${money(safe.openPnlAmount)} ₺`}
        numeric={safe.openPnlAmount}
      />
      <Card
        title="Total PnL"
        value={`${money(safe.totalPnlAmount)} ₺`}
        numeric={safe.totalPnlAmount}
      />
      <Card title="Open Positions" value={String(safe.openPositions)} />
      <Card title="Long / Short" value={`${safe.longCount} / ${safe.shortCount}`} />
      <Card title="Win Rate" value={`%${safe.winRate}`} />
      <Card title="Live Prices" value={`${safe.livePriceCount}`} />
    </div>
  );
}

function Card({
  title,
  value,
  numeric,
}: {
  title: string;
  value: string;
  numeric?: number;
}) {
  const hasNumeric = typeof numeric === "number";

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-5">
      <div className="text-sm text-slate-400">{title}</div>

      <div
        className={`mt-3 text-3xl font-bold ${
          hasNumeric ? pnlColor(numeric) : "text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function money(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}