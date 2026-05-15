const market = [
  ["BIST100", "+1.42%", "good"],
  ["BANKS", "+2.08%", "good"],
  ["INDUSTRIAL", "-0.36%", "bad"],
  ["USDTRY", "32.21", "neutral"],
  ["VOL", "NORMAL", "neutral"],
  ["REGIME", "RISK-ON", "good"],
];

export default function MarketBar() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.035] px-4 py-2 shadow-xl">
      <div className="mr-2 text-[11px] font-bold tracking-[0.35em] text-cyan-300">
        MARKET BAR
      </div>

      {market.map(([name, value, tone]) => (
        <div
          key={name}
          className="flex items-center gap-2 rounded-xl bg-black/35 px-3 py-1.5 text-xs"
        >
          <span className="text-slate-400">{name}</span>
          <span
            className={
              tone === "good"
                ? "font-bold text-emerald-300"
                : tone === "bad"
                ? "font-bold text-rose-300"
                : "font-bold text-white"
            }
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}