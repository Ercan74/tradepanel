import type { Trade } from "./types";
import { Badge, Empty } from "./Panel";
import { shortTime } from "./helpers";

const heatmap = [
  ["ASELS", 3.4],
  ["AKBNK", 2.1],
  ["GARAN", 1.8],
  ["THYAO", -1.2],
  ["KCHOL", 0.6],
  ["SAHOL", -0.8],
  ["EREGL", 1.1],
  ["TUPRS", -1.6],
  ["SISE", 0.9],
];

export default function Sidebar({ trades }: { trades: Trade[] }) {
  return (
    <aside className="space-y-5">
      <TerminalIdentity />
      <Watchlist trades={trades} />
      <Heatmap />
      <SignalFlow trades={trades} />
    </aside>
  );
}

function TerminalIdentity() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">
          ∿
        </div>

        <div>
          <div className="text-xl font-bold">TradePanel</div>
          <div className="text-xs text-cyan-300">Institutional v6</div>
        </div>
      </div>

      <div className="rounded-2xl bg-black/30 p-4">
        <div className="flex justify-between text-xs text-slate-400">
          <span>ENGINE</span>
          <span className="text-emerald-300">LIVE</span>
        </div>

        <div className="mt-3 text-lg font-bold text-emerald-300">BORSA PY</div>
        <div className="mt-1 text-xs text-slate-400">
          Realtime signal monitor active
        </div>
      </div>
    </div>
  );
}

function Watchlist({ trades }: { trades: Trade[] }) {
  const rows = trades.slice(0, 6);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Watchlist Intelligence</h2>
      <p className="mb-4 text-sm text-slate-400">Son sinyal yoğunluğu</p>

      <div className="space-y-2">
        {rows.length ? (
          rows.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl bg-black/25 p-3"
            >
              <div>
                <div className="font-bold">{t.symbol}</div>
                <div className="text-xs text-slate-500">{t.strategy}</div>
              </div>

              <Badge tone={t.side === "LONG" ? "good" : "bad"}>{t.side}</Badge>
            </div>
          ))
        ) : (
          <Empty text="Henüz sinyal yok." />
        )}
      </div>
    </div>
  );
}

function Heatmap() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Market Heatmap</h2>
      <p className="mb-4 text-sm text-slate-400">Sektör / momentum matrisi</p>

      <div className="grid grid-cols-3 gap-2">
        {heatmap.map(([symbol, value]) => {
          const v = Number(value);

          return (
            <div
              key={String(symbol)}
              className={`rounded-2xl p-3 text-center text-xs ${
                v >= 0
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-rose-400/10 text-rose-300"
              }`}
            >
              <div className="font-bold">{symbol}</div>
              <div>
                {v > 0 ? "+" : ""}
                {v}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalFlow({ trades }: { trades: Trade[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-2xl">
      <h2 className="text-lg font-bold">Signal Flow</h2>
      <p className="mb-4 text-sm text-slate-400">Canlı TradingView akışı</p>

      <div className="space-y-2">
        {trades.slice(0, 7).map((t) => (
          <div key={t.id} className="rounded-2xl bg-black/25 p-3">
            <div className="flex justify-between">
              <span className="font-bold">{t.symbol}</span>
              <span
                className={
                  t.side === "LONG" ? "text-emerald-300" : "text-rose-300"
                }
              >
                {t.side}
              </span>
            </div>

            <div className="mt-1 text-xs text-slate-500">
              {shortTime(t.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}