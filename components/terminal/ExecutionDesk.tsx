import type { Trade } from "./types";
import { pnlColor } from "./helpers";

type ExtendedTrade = Trade & {
  current?: number;
  pnlAmount?: number;
  quantity?: number;
  remainingQuantity?: number;
  realizedPartialAmount?: number;
  trailingStage?: string;
  tp1Hit?: boolean;
  tp1Price?: number;
  stopPrice?: number;
  liveSource?: string;
  liveUpdatedAt?: string | null;
  rawStatus?: string;
};

export default function ExecutionDesk({ trades }: { trades: Trade[] }) {
  const openTrades = (trades as ExtendedTrade[]).filter((trade) => {
    const status = String(trade.rawStatus ?? trade.status ?? "").toUpperCase();
    return status === "OPEN";
  });

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0b1220] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-4xl font-bold">Execution Desk</div>
          <div className="text-slate-400">
            Top 10 skor · 10.000 TL pozisyon bütçesi · %3 SL · TP1 +%6 / %50 realize · trailing state
          </div>
        </div>

        <div className="rounded-full bg-cyan-500/20 px-4 py-1 text-cyan-300">
          MATRIKS LIVE
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="text-left text-sm text-slate-500">
            <tr>
              <th>SYMBOL</th>
              <th>SIDE</th>
              <th>STRATEGY</th>
              <th>ENTRY</th>
              <th>CURRENT</th>
              <th>LOT</th>
              <th>REMAIN</th>
              <th>TP1</th>
              <th>STOP</th>
              <th>TRAIL</th>
              <th>PNL ₺</th>
              <th>PNL %</th>
              <th>DATA</th>
            </tr>
          </thead>

          <tbody>
            {openTrades.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-8 text-center text-slate-500">
                  Açık pozisyon yok.
                </td>
              </tr>
            ) : (
              openTrades.map((trade) => {
                const pnlPct = Number((trade as any).pnl ?? 0);
                const pnlAmount = Number(trade.pnlAmount ?? 0);

                return (
                  <tr key={String((trade as any).id ?? trade.symbol)} className="border-t border-white/5">
                    <td className="py-5 text-xl font-bold">{trade.symbol}</td>

                    <td>
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${
                          trade.side === "SHORT"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>

                    <td>{trade.strategy}</td>
                    <td>{formatPrice((trade as any).entry)}</td>
                    <td>{formatPrice(trade.current ?? (trade as any).exit)}</td>
                    <td>{trade.quantity ?? 1}</td>
                    <td>{trade.remainingQuantity ?? trade.quantity ?? 1}</td>
                    <td>{formatPrice(trade.tp1Price ?? (trade as any).takeProfit)}</td>
                    <td>{formatPrice(trade.stopPrice ?? (trade as any).stop)}</td>
                    <td>{trade.trailingStage ?? "INITIAL"}</td>

                    <td className={pnlColor(pnlAmount)}>{formatMoney(pnlAmount)} ₺</td>

                    <td className={pnlColor(pnlPct)}>
                      {pnlPct >= 0 ? "+" : ""}
                      {pnlPct.toFixed(2)}%
                    </td>

                    <td className="text-xs text-slate-400">
                      <div>{trade.liveSource ?? "POSITIONS"}</div>
                      <div>{formatTime(trade.liveUpdatedAt)}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPrice(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoney(value: number) {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
