"use client";

import type { ReactNode } from "react";
import type {
  BrokerBridgeStatus,
  PositionLifecycle,
  Trade,
  TradingSignal,
} from "./types";

const ACCOUNT_CAPITAL = 100_000;
const MAX_OPEN_POSITIONS = 10;
const POSITION_BUDGET = 10_000;

const MARKET_LABELS: Record<string, string> = {
  FDJI: "DOW",
  FSPX: "S&P",
  FDAX: "DAX",
  VIX: "VIX",
  DXY: "DXY",
  XU100: "BIST 100",
  XU030: "BIST 30",
  XBANK: "BANKA",
  XULAS: "ULAŞTIRMA",
  XUMAL: "MALİ",
  XUTEK: "TEKNO",
  XUSIN: "SANAYİ",
  XHOLD: "HOLDİNG",
  XGMYO: "GMYO",
};

type GlobalMarketItem = {
  symbol: string;
  price: number;
  changePct: number;
};

type Props = {
  trades: Trade[];
  signals: TradingSignal[];
  positions: PositionLifecycle[];
  bridge: BrokerBridgeStatus;
  source: "SUPABASE" | "MOCK";
  globalContext?: GlobalMarketItem[] | { data?: unknown[] };
};

type PortfolioRow = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "-";
  entry: number;
  current: number;
  pnl: number;
  pnlPct: number;
  riskPct: number;
  lockedPct: number;
  allocated: number;
  trail: string;
  stop: number;
  tp1: number;
  slDistancePct: number | null;
  status: string;
  data: string;
  age: string;
  score: number;
};

type AlertItem = {
  tone: "danger" | "warn" | "info" | "good";
  title: string;
  body: string;
  time: string;
};

export default function DashboardCommandCenter({
  trades,
  signals,
  positions,
  bridge,
  source,
  globalContext = [],
}: Props) {
  const markets = normalizeGlobalContext(globalContext);
  const rows = buildPortfolioRows(positions, trades);
  const openRows = rows
    .filter((row) => row.status !== "CLOSED")
    .slice(0, MAX_OPEN_POSITIONS);
  const closedTrades = trades.filter((trade) => isClosedTrade(trade));
  const realizedPnl = closedTrades.reduce(
    (sum, trade) => sum + safeNumber(getAny(trade, "pnl")),
    0,
  );
  const openPnl = openRows.reduce((sum, row) => sum + row.pnl, 0);
  const totalPnl = openPnl + realizedPnl;
  const exposurePct = Math.min(
    100,
    Math.round((openRows.length / MAX_OPEN_POSITIONS) * 100),
  );
  const longCount = openRows.filter((row) => row.side === "LONG").length;
  const shortCount = openRows.filter((row) => row.side === "SHORT").length;
  const winners = rows.filter((row) => row.pnl > 0).length;
  const losers = rows.filter((row) => row.pnl < 0).length;
  const winRate = rows.length ? Math.round((winners / rows.length) * 100) : 0;
  const availableCash = Math.max(
    0,
    ACCOUNT_CAPITAL - openRows.length * POSITION_BUDGET,
  );
  const best = bestRow(openRows);
  const worst = worstRow(openRows);
  const alerts = buildAlerts(openRows, signals, markets, exposurePct);
  const recentEvents = buildRecentEvents(rows, signals);
  const regime = getRegime(markets, exposurePct, openPnl);

  return (
    <div className="grid h-full min-h-0 grid-rows-[138px_minmax(0,1fr)_30px] overflow-hidden bg-[#03050a] p-3">
      <MarketRegimeBar markets={markets} regime={regime} />

      <section className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)_330px] gap-3 overflow-hidden py-3">
        <PortfolioRail
          openPnl={openPnl}
          realizedPnl={realizedPnl}
          totalPnl={totalPnl}
          winRate={winRate}
          winners={winners}
          losers={losers}
          exposurePct={exposurePct}
          longCount={longCount}
          shortCount={shortCount}
          openCount={openRows.length}
          availableCash={availableCash}
          source={source}
        />

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_92px] gap-3 overflow-hidden">
          <OpenPositionsBoard rows={openRows} />
          <PortfolioSummaryStrip
            openPnl={openPnl}
            realizedPnl={realizedPnl}
            best={best}
            worst={worst}
            openRisk={openRows.reduce((sum, row) => sum + riskAmount(row), 0)}
          />
        </main>

        <RightOperationsRail
          signals={signals}
          alerts={alerts}
          recentEvents={recentEvents}
          bridge={bridge}
          openCount={openRows.length}
          exposurePct={exposurePct}
        />
      </section>

      <StatusFooter
        source={source}
        bridge={bridge}
        signals={signals.length}
        openCount={openRows.length}
        markets={markets}
      />
    </div>
  );
}

function MarketRegimeBar({
  markets,
  regime,
}: {
  markets: GlobalMarketItem[];
  regime: { label: string; tone: "good" | "warn" | "bad"; description: string };
}) {
  const globalMarkets = pickMarkets(markets, ["FSPX", "FDJI", "FDAX", "VIX"]);
  const bistMarkets = pickMarkets(markets, [
    "XU100",
    "XU030",
    "XBANK",
    "XUTEK",
    "XUMAL",
    "XULAS",
  ]);

  return (
    <section className="grid min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-3">
      <div className="grid min-h-0 grid-rows-2 gap-2 rounded-2xl border border-white/10 bg-[#07101a] p-3">
        <div className="grid min-h-0 grid-cols-[92px_minmax(0,1fr)] gap-3">
          <div className="flex items-center text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">
            Global
          </div>
          <div className="grid grid-cols-4 gap-2">
            {globalMarkets.length ? (
              globalMarkets.map((item) => <MarketTile key={item.symbol} item={item} />)
            ) : (
              <>
                <MarketSkeleton label="S&P" />
                <MarketSkeleton label="DOW" />
                <MarketSkeleton label="DAX" />
                <MarketSkeleton label="VIX" />
              </>
            )}
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-[92px_minmax(0,1fr)] gap-3 border-t border-white/10 pt-2">
          <div className="flex items-center text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300">
            BIST
          </div>
          <div className="grid grid-cols-6 gap-2">
            {bistMarkets.length ? (
              bistMarkets.map((item) => <MarketTile key={item.symbol} item={item} />)
            ) : (
              <>
                <MarketSkeleton label="BIST100" />
                <MarketSkeleton label="BIST30" />
                <MarketSkeleton label="BANKA" />
                <MarketSkeleton label="TEKNO" />
                <MarketSkeleton label="MALİ" />
                <MarketSkeleton label="ULAŞ" />
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`rounded-2xl border p-4 ${toneClasses(regime.tone)}`}>
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] opacity-70">
          Piyasa Rejimi
        </div>
        <div className="mt-3 text-2xl font-black">{regime.label}</div>
        <div className="mt-1 text-xs leading-relaxed opacity-75">{regime.description}</div>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] opacity-90">
          {regime.tone === "good"
            ? "BIST + Global destekli"
            : regime.tone === "bad"
              ? "Risk azalt / stop takip"
              : "Seçici portföy yönetimi"}
        </div>
      </div>
    </section>
  );
}

function PortfolioRail({
  openPnl,
  realizedPnl,
  totalPnl,
  winRate,
  winners,
  losers,
  exposurePct,
  longCount,
  shortCount,
  openCount,
  availableCash,
  source,
}: {
  openPnl: number;
  realizedPnl: number;
  totalPnl: number;
  winRate: number;
  winners: number;
  losers: number;
  exposurePct: number;
  longCount: number;
  shortCount: number;
  openCount: number;
  availableCash: number;
  source: "SUPABASE" | "MOCK";
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <Panel title="Portföy Özeti" badge={source}>
        <div className="space-y-3">
          <BigNumber
            label="Open PnL"
            value={`${money(openPnl)} ₺`}
            tone={openPnl >= 0 ? "good" : "bad"}
          />
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric
              label="Realized"
              value={`${money(realizedPnl)} ₺`}
              tone={realizedPnl >= 0 ? "good" : "bad"}
            />
            <MiniMetric label="Win Rate" value={`%${winRate}`} tone="cyan" />
            <MiniMetric
              label="W / L"
              value={`${winners} / ${losers}`}
              tone="neutral"
            />
            <MiniMetric
              label="Total PnL"
              value={`${money(totalPnl)} ₺`}
              tone={totalPnl >= 0 ? "good" : "bad"}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Pozisyon Kapasitesi"
        badge={`${openCount}/${MAX_OPEN_POSITIONS}`}
      >
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <Donut value={openCount} max={MAX_OPEN_POSITIONS} />
          <div className="space-y-2 text-xs">
            <Legend label="Long" value={longCount} tone="good" />
            <Legend label="Short" value={shortCount} tone="bad" />
            <Legend
              label="Boş Kapasite"
              value={Math.max(0, MAX_OPEN_POSITIONS - openCount)}
              tone="neutral"
            />
          </div>
        </div>
      </Panel>

      <Panel title="Maruziyet" badge={exposurePct >= 90 ? "RISK" : "OK"}>
        <div className="space-y-3">
          <Bar
            label="Toplam Maruziyet"
            value={exposurePct}
            tone={
              exposurePct >= 90 ? "bad" : exposurePct >= 75 ? "warn" : "good"
            }
          />
          <Bar
            label="Long Yük"
            value={Math.min(100, longCount * 15)}
            tone="good"
          />
          <Bar
            label="Short Yük"
            value={Math.min(100, shortCount * 25)}
            tone="bad"
          />
        </div>
      </Panel>

      <Panel title="Nakit & Sermaye" badge="CAPITAL" className="min-h-0">
        <div className="space-y-3 text-sm">
          <CapitalLine
            label="Kullanılabilir Nakit"
            value={`${money(availableCash)} ₺`}
            tone="good"
          />
          <CapitalLine
            label="Toplam Sermaye"
            value={`${money(ACCOUNT_CAPITAL)} ₺`}
            tone="neutral"
          />
          <CapitalLine
            label="Kullanılan Sermaye"
            value={`${money(ACCOUNT_CAPITAL - availableCash)} ₺`}
            tone="warn"
          />
          <CapitalLine
            label="Pozisyon Başı"
            value={`${money(POSITION_BUDGET)} ₺`}
            tone="cyan"
          />
        </div>
      </Panel>
    </aside>
  );
}

function OpenPositionsBoard({ rows }: { rows: PortfolioRow[] }) {
  return (
    <Panel
      title="Açık Pozisyonlar"
      badge={`${rows.length} / ${MAX_OPEN_POSITIONS}`}
      className="min-h-0"
    >
      <div className="grid h-full min-h-0 grid-rows-[32px_minmax(0,1fr)]">
        <div className="grid grid-cols-[1.5fr_0.7fr_0.85fr_0.85fr_0.95fr_0.85fr_0.85fr_0.85fr_0.9fr_0.9fr] border-b border-white/10 px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          <div>Pozisyon</div>
          <div>Yön</div>
          <div>Giriş</div>
          <div>Güncel</div>
          <div>PnL ₺</div>
          <div>PnL %</div>
          <div>Risk</div>
          <div>Trail</div>
          <div>SL Mesafe</div>
          <div>Durum</div>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          {rows.map((row) => (
            <PositionLine key={row.id} row={row} />
          ))}
          {!rows.length && (
            <div className="grid h-full place-items-center rounded-2xl border border-white/10 bg-black/20 text-sm text-zinc-500">
              Açık pozisyon yok.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function PositionLine({ row }: { row: PortfolioRow }) {
  const danger = row.slDistancePct !== null && row.slDistancePct <= 1.5;
  const watch = row.slDistancePct !== null && row.slDistancePct <= 3;

  return (
    <div
      className={`grid grid-cols-[1.5fr_0.7fr_0.85fr_0.85fr_0.95fr_0.85fr_0.85fr_0.85fr_0.9fr_0.9fr] items-center border-b border-white/10 px-2 py-3 text-sm transition hover:bg-white/[0.03] ${
        danger ? "bg-red-400/[0.06]" : watch ? "bg-amber-400/[0.04]" : ""
      }`}
    >
      <div className="min-w-0 border-l-2 border-cyan-400/60 pl-3">
        <div className="truncate text-base font-black text-white">
          {row.symbol}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-zinc-500">
          EMA100 · {row.age}
        </div>
      </div>

      <div className={sideClass(row.side)}>{row.side}</div>
      <div className="font-black text-white">{money(row.entry)}</div>
      <div className="font-black text-cyan-200">{money(row.current)}</div>
      <div
        className={
          row.pnl >= 0
            ? "font-black text-emerald-300"
            : "font-black text-red-300"
        }
      >
        {moneySigned(row.pnl)}
      </div>
      <div
        className={
          row.pnlPct >= 0
            ? "font-black text-emerald-300"
            : "font-black text-red-300"
        }
      >
        {pct(row.pnlPct)}
      </div>
      <div
        className={
          row.riskPct <= 2
            ? "font-black text-red-300"
            : row.riskPct <= 4
              ? "font-black text-amber-300"
              : "font-black text-zinc-200"
        }
      >
        %{row.riskPct.toFixed(1)}
      </div>
      <div>
        <TrailBadge value={row.trail} />
      </div>
      <div
        className={
          danger
            ? "font-black text-red-300"
            : watch
              ? "font-black text-amber-300"
              : "font-black text-emerald-300"
        }
      >
        {row.slDistancePct === null ? "-" : `%${row.slDistancePct.toFixed(1)}`}
      </div>
      <div
        className={
          row.pnl >= 0
            ? "font-black text-emerald-300"
            : "font-black text-red-300"
        }
      >
        {row.pnl >= 0 ? "KARDA" : "ZARARDA"}
      </div>
    </div>
  );
}

function PortfolioSummaryStrip({
  openPnl,
  realizedPnl,
  openRisk,
  best,
  worst,
}: {
  openPnl: number;
  realizedPnl: number;
  openRisk: number;
  best?: PortfolioRow;
  worst?: PortfolioRow;
}) {
  return (
    <section className="grid min-h-0 grid-cols-5 gap-3">
      <SummaryCell
        label="Open PnL"
        value={`${money(openPnl)} ₺`}
        tone={openPnl >= 0 ? "good" : "bad"}
      />
      <SummaryCell
        label="Realized PnL"
        value={`${money(realizedPnl)} ₺`}
        tone={realizedPnl >= 0 ? "good" : "bad"}
      />
      <SummaryCell
        label="Stop'a Kadar Risk"
        value={`${money(openRisk)} ₺`}
        tone={openRisk > 0 ? "bad" : "neutral"}
      />
      <SummaryCell
        label="En İyi"
        value={best ? `${best.symbol} ${pct(best.pnlPct)}` : "-"}
        tone="good"
      />
      <SummaryCell
        label="En Zayıf"
        value={worst ? `${worst.symbol} ${pct(worst.pnlPct)}` : "-"}
        tone="bad"
      />
    </section>
  );
}

function RightOperationsRail({
  alerts,
  recentEvents,
  bridge,
  openCount,
  exposurePct,
}: {
  signals: TradingSignal[];
  alerts: AlertItem[];
  recentEvents: AlertItem[];
  bridge: BrokerBridgeStatus;
  openCount: number;
  exposurePct: number;
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[minmax(0,1fr)_230px] gap-3 overflow-hidden">
      <Panel
        title="Risk & Uyarılar"
        badge={`${alerts.length} AKTİF`}
        className="min-h-0"
      >
        <div className="h-full min-h-0 space-y-3 overflow-y-auto pr-1">
          {alerts.map((alert, index) => (
            <AlertCard key={`${alert.title}-${index}`} alert={alert} />
          ))}
          {!alerts.length && (
            <EmptyText>
              Aktif risk uyarısı yok. Portföy sağlıklı izleniyor.
            </EmptyText>
          )}
        </div>
      </Panel>

      <Panel title="Sistem Durumu" badge="OPS" className="min-h-0">
        <div className="space-y-2">
          <SystemLine label="Supabase" value="Bağlı" tone="good" />
          <SystemLine
            label="Bridge"
            value={bridge.health}
            tone={bridge.health === "OK" ? "good" : "warn"}
          />
          <SystemLine label="Risk Monitor" value="Aktif" tone="good" />
          <SystemLine label="Telegram" value="Bağlı" tone="good" />
          <SystemLine
            label="Kapasite"
            value={`${openCount}/${MAX_OPEN_POSITIONS}`}
            tone={exposurePct >= 90 ? "warn" : "good"}
          />
          {recentEvents.slice(0, 3).map((event, index) => (
            <SystemLine
              key={index}
              label={event.title}
              value={event.body}
              tone={
                event.tone === "danger"
                  ? "bad"
                  : event.tone === "warn"
                    ? "warn"
                    : "good"
              }
            />
          ))}
        </div>
      </Panel>
    </aside>
  );
}


function StatusFooter({
  source,
  bridge,
  signals,
  openCount,
  markets,
}: {
  source: "SUPABASE" | "MOCK";
  bridge: BrokerBridgeStatus;
  signals: number;
  openCount: number;
  markets: GlobalMarketItem[];
}) {
  const now = new Date();

  return (
    <footer className="flex items-center justify-between border-t border-white/10 px-3 text-[11px] text-zinc-500">
      <div className="flex items-center gap-5">
        <FooterItem
          label="Supabase"
          value={source === "SUPABASE" ? "BAĞLI" : "MOCK"}
          tone={source === "SUPABASE" ? "good" : "warn"}
        />
        <FooterItem
          label="Bridge"
          value={bridge.health}
          tone={bridge.health === "OK" ? "good" : "warn"}
        />
        <FooterItem label="Sinyaller" value={String(signals)} tone="cyan" />
        <FooterItem
          label="Pozisyon"
          value={`${openCount}/${MAX_OPEN_POSITIONS}`}
          tone={openCount >= MAX_OPEN_POSITIONS ? "warn" : "cyan"}
        />
        <FooterItem
          label="Piyasa Veri"
          value={markets.length ? "AKTİF" : "WAIT"}
          tone={markets.length ? "good" : "warn"}
        />
      </div>
      <div>
        Son Güncelleme{" "}
        {now.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </div>
    </footer>
  );
}

function SignalCard({ signal }: { signal: TradingSignal }) {
  const score = safeNumber(
    getAny(signal, "score") ?? getAny(signal, "quality_score"),
    100,
  );
  const side = normalizeSide(
    getAny(signal, "side") ??
      getAny(signal, "orderSide") ??
      getAny(signal, "action"),
  );

  return (
    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
      <div className="flex items-center justify-between">
        <div className="text-base font-black text-cyan-200">
          {String(signal.symbol ?? "-").replace("BIST:", "")}
        </div>
        <div className={sideClass(side)}>{side}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Tag>MOMENTUM</Tag>
        <Tag>ELITE</Tag>
        <Tag>DÜŞÜK RİSK</Tag>
      </div>
      <div
        className="mt-3 h-1 rounded-full bg-cyan-400"
        style={{ width: `${Math.min(100, score)}%` }}
      />
      <div className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
        <SmallData
          label="RSI"
          value={fmt(safeNullable(getAny(signal, "rsi")))}
        />
        <SmallData
          label="MACD"
          value={fmt(safeNullable(getAny(signal, "macd")))}
        />
        <SmallData
          label="DIST"
          value={fmt(
            safeNullable(
              getAny(signal, "distAtr") ?? getAny(signal, "dist_atr"),
            ),
          )}
        />
        <SmallData label="SKOR" value={`%${score.toFixed(0)}`} />
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const dot = {
    danger: "bg-red-400",
    warn: "bg-amber-400",
    info: "bg-cyan-400",
    good: "bg-emerald-400",
  }[alert.tone];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="truncate text-sm font-black text-white">
              {alert.title}
            </div>
            <div className="text-[10px] text-zinc-500">{alert.time}</div>
          </div>
          <div className="mt-1 text-xs leading-relaxed text-zinc-400">
            {alert.body}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  badge,
  className,
  children,
}: {
  title: string;
  badge: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#07101a] p-3 shadow-[0_0_40px_rgba(0,0,0,0.25)] ${className ?? ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-300">
          {title}
        </h2>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[9px] font-black text-cyan-300">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

function MarketTile({ item }: { item: GlobalMarketItem }) {
  const label = MARKET_LABELS[item.symbol] ?? item.symbol;
  const positive = item.changePct >= 0;

  return (
    <div className="min-w-0 border-r border-white/10 px-2 last:border-r-0">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate text-base font-black text-white">
        {compactNumber(item.price)}
      </div>
      <div
        className={
          positive
            ? "text-xs font-black text-emerald-300"
            : "text-xs font-black text-red-300"
        }
      >
        {positive ? "+" : ""}%{item.changePct.toFixed(2)}
      </div>
    </div>
  );
}

function MarketSkeleton({ label }: { label: string }) {
  return (
    <div className="min-w-0 border-r border-white/10 px-2 last:border-r-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-base font-black text-zinc-600">WAIT</div>
      <div className="text-xs text-zinc-700">--</div>
    </div>
  );
}

function BigNumber({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </div>
      <div
        className={
          tone === "good"
            ? "mt-2 text-3xl font-black text-emerald-300"
            : "mt-2 text-3xl font-black text-red-300"
        }
      >
        {value}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClasses(tone)}`}>
      <div className="text-[9px] uppercase tracking-[0.18em] opacity-60">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black">{value}</div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  return (
    <div className={`rounded-2xl border p-3 ${toneClasses(tone)}`}>
      <div className="text-[9px] uppercase tracking-[0.22em] opacity-60">
        {label}
      </div>
      <div className="mt-2 truncate text-lg font-black">{value}</div>
    </div>
  );
}

function CapitalLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-300"
          : tone === "cyan"
            ? "text-cyan-300"
            : "text-zinc-200";
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-2 last:border-b-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`font-black ${cls}`}>{value}</span>
    </div>
  );
}

function Legend({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : "text-zinc-400";
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-black ${cls}`}>{value}</span>
    </div>
  );
}

function Donut({ value, max }: { value: number; max: number }) {
  const pctValue = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className="relative grid h-24 w-24 place-items-center rounded-full"
      style={{
        background: `conic-gradient(rgb(52,211,153) ${pctValue}%, rgba(255,255,255,.1) ${pctValue}% 100%)`,
      }}
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#07101a] text-center">
        <div>
          <div className="text-lg font-black text-white">
            {value}/{max}
          </div>
          <div className="text-[9px] text-zinc-500">AÇIK</div>
        </div>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "warn" | "cyan";
}) {
  const color =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "bad"
        ? "bg-red-400"
        : tone === "warn"
          ? "bg-amber-400"
          : "bg-cyan-400";
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-zinc-500">{label}</span>
        <span className="font-black text-zinc-200">%{Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, Math.round(value)))}%` }}
        />
      </div>
    </div>
  );
}

function TrailBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const cls =
    normalized.includes("BREAKEVEN") || normalized.includes("BE")
      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
      : normalized.includes("INITIAL")
        ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
        : normalized.includes("CLOSED")
          ? "border-zinc-400/30 bg-zinc-400/10 text-zinc-300"
          : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-black ${cls}`}
    >
      {displayTrail(value)}
    </span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] text-zinc-400">
      {children}
    </span>
  );
}

function SmallData({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1">
      <div className="text-[8px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      <div className="text-[10px] font-bold text-zinc-200">{value}</div>
    </div>
  );
}

function SystemLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-300"
          : tone === "cyan"
            ? "text-cyan-300"
            : "text-zinc-300";
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="truncate text-zinc-400">{label}</span>
      <span className={`truncate text-right font-black ${cls}`}>{value}</span>
    </div>
  );
}

function FooterItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "warn" | "cyan" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-300"
          : tone === "cyan"
            ? "text-cyan-300"
            : "text-zinc-300";
  return (
    <div className="flex items-center gap-2">
      <span className="text-zinc-600">{label}</span>
      <span className={`font-black ${cls}`}>{value}</span>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-xs text-zinc-500">
      {children}
    </div>
  );
}

function buildPortfolioRows(
  positions: PositionLifecycle[],
  trades: Trade[],
): PortfolioRow[] {
  const sourceRows = positions.length ? positions : trades;

  return sourceRows.map((item, index) => {
    const symbol = String(getAny(item, "symbol") ?? "-").replace("BIST:", "");
    const side = normalizeSide(getAny(item, "side"));
    const entry = safeNumber(
      getAny(item, "entry") ?? getAny(item, "entry_price"),
    );
    const current = safeNumber(
      getAny(item, "current") ??
        getAny(item, "current_price") ??
        getAny(item, "last_price"),
      entry,
    );
    const qty = safeNumber(
      getAny(item, "remaining_quantity") ??
        getAny(item, "remain") ??
        getAny(item, "quantity") ??
        getAny(item, "lot"),
    );
    const rawPnl = getAny(item, "pnl");
    const rawPnlPct = getAny(item, "pnlPct") ?? getAny(item, "pnl_pct");
    const pnlPct =
      rawPnlPct === undefined || rawPnlPct === null
        ? calcPnlPct(side, entry, current)
        : safeNumber(rawPnlPct);
    const pnl =
      rawPnl === undefined || rawPnl === null
        ? calcPnlAmount(side, entry, current, qty)
        : safeNumber(rawPnl);
    const stop = safeNumber(
      getAny(item, "stop") ??
        getAny(item, "stop_price") ??
        getAny(item, "trailing_stop_price"),
    );
    const tp1 = safeNumber(
      getAny(item, "takeProfit") ??
        getAny(item, "take_profit") ??
        getAny(item, "tp1") ??
        getAny(item, "tp1_price"),
    );
    const allocated = safeNumber(
      getAny(item, "allocated") ?? getAny(item, "allocated_amount"),
      entry * qty || POSITION_BUDGET,
    );
    const status = String(
      getAny(item, "rawStatus") ?? getAny(item, "status") ?? "OPEN",
    ).toUpperCase();
    const trail = String(
      getAny(item, "trail") ??
        getAny(item, "trail_state") ??
        getAny(item, "trailing_stage") ??
        (status === "CLOSED" ? "CLOSED" : "INITIAL"),
    );
    const openedAt = String(
      getAny(item, "opened_at") ??
        getAny(item, "createdAt") ??
        getAny(item, "created_at") ??
        "",
    );
    const data = String(
      getAny(item, "data") ??
        getAny(item, "source") ??
        getAny(item, "price_source") ??
        "MATRIKS_DDE",
    );
    const score = safeNumber(
      getAny(item, "aiScore") ??
        getAny(item, "score") ??
        getAny(item, "quality_score"),
      100,
    );
    const riskPct =
      stop > 0 && current > 0
        ? Math.abs(((current - stop) / current) * 100)
        : 0;
    const lockedPct = lockedProfitPct(side, entry, stop);
    const slDistancePct =
      stop > 0 && current > 0
        ? Math.abs(((current - stop) / current) * 100)
        : null;

    return {
      id: String(getAny(item, "id") ?? `${symbol}-${index}`),
      symbol,
      side,
      entry,
      current,
      pnl,
      pnlPct,
      riskPct,
      lockedPct,
      allocated,
      trail,
      stop,
      tp1,
      slDistancePct,
      status,
      data,
      age: ageText(openedAt),
      score,
    };
  });
}

function buildAlerts(
  rows: PortfolioRow[],
  signals: TradingSignal[],
  markets: GlobalMarketItem[],
  exposurePct: number,
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const now = new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  rows
    .filter((row) => row.slDistancePct !== null && row.slDistancePct <= 1.5)
    .slice(0, 3)
    .forEach((row) => {
      alerts.push({
        tone: "danger",
        title: row.symbol,
        body: `Stop-loss seviyesine %${row.slDistancePct?.toFixed(1)} mesafede. Pozisyon izlenmeye alındı.`,
        time: now,
      });
    });

  if (exposurePct >= 90) {
    alerts.push({
      tone: "warn",
      title: "Toplam Maruziyet",
      body: `%${exposurePct} seviyesinde. Yeni pozisyon açarken dikkatli olun.`,
      time: now,
    });
  }

  const best = bestRow(rows);
  if (best && best.pnlPct >= 6) {
    alerts.push({
      tone: "info",
      title: best.symbol,
      body: `${pct(best.pnlPct)} ile güçlü performans. Trail / kısmi kar kontrolü uygun olabilir.`,
      time: now,
    });
  }

  const vix = markets.find((item) => item.symbol === "VIX");
  if (vix && vix.changePct <= -3) {
    alerts.push({
      tone: "good",
      title: "Global Risk İştahı",
      body: `VIX ${pct(vix.changePct)}. Küresel risk iştahı destekleyici.`,
      time: now,
    });
  } else if (vix && vix.changePct >= 3) {
    alerts.push({
      tone: "warn",
      title: "VIX Uyarısı",
      body: `VIX ${pct(vix.changePct)}. Volatilite yükseliyor.`,
      time: now,
    });
  }

  const xu100 = markets.find((item) => item.symbol === "XU100");
  const xbank = markets.find((item) => item.symbol === "XBANK");
  const xutek = markets.find((item) => item.symbol === "XUTEK");
  const xulas = markets.find((item) => item.symbol === "XULAS");

  if (xu100 && xu100.changePct <= -1) {
    alerts.push({
      tone: "warn",
      title: "BIST100 Zayıflıyor",
      body: `XU100 ${pct(xu100.changePct)}. Yeni pozisyonlarda seçicilik artırılmalı.`,
      time: now,
    });
  } else if (xu100 && xu100.changePct >= 1) {
    alerts.push({
      tone: "good",
      title: "BIST100 Pozitif",
      body: `XU100 ${pct(xu100.changePct)}. Portföy momentumunu destekliyor.`,
      time: now,
    });
  }

  if (xbank && Math.abs(xbank.changePct) >= 1.5) {
    alerts.push({
      tone: xbank.changePct > 0 ? "good" : "warn",
      title: "XBANK Rejim Sinyali",
      body: `Bankacılık endeksi ${pct(xbank.changePct)}. Piyasa yönü için lider gösterge olarak izlenmeli.`,
      time: now,
    });
  }

  if (xutek && xutek.changePct >= 2) {
    alerts.push({
      tone: "good",
      title: "Teknoloji Güçlü",
      body: `XUTEK ${pct(xutek.changePct)}. Teknoloji pozisyonları göreceli güçlü olabilir.`,
      time: now,
    });
  }

  if (xulas && xulas.changePct <= -1.5) {
    alerts.push({
      tone: "warn",
      title: "Ulaştırma Baskı Altında",
      body: `XULAS ${pct(xulas.changePct)}. Ulaştırma hisselerinde risk izlenmeli.`,
      time: now,
    });
  }

  const rejected = signals.filter((signal) =>
    String(getAny(signal, "decision") ?? "")
      .toUpperCase()
      .includes("REJECT"),
  ).length;
  if (rejected > 0) {
    alerts.push({
      tone: "info",
      title: "Sinyal Filtresi",
      body: `${rejected} sinyal risk / kalite filtresiyle reddedildi.`,
      time: now,
    });
  }

  return alerts.slice(0, 8);
}

function buildRecentEvents(
  rows: PortfolioRow[],
  signals: TradingSignal[],
): AlertItem[] {
  const now = new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const tradeEvents = rows.slice(0, 3).map(
    (row): AlertItem => ({
      tone: row.pnl >= 0 ? "good" : "danger",
      title: row.symbol,
      body: row.pnl >= 0 ? `${money(row.pnl)} ₺` : `${money(row.pnl)} ₺`,
      time: now,
    }),
  );

  const signalEvents = signals.slice(0, 2).map(
    (signal): AlertItem => ({
      tone: "info",
      title: String(signal.symbol ?? "SIGNAL"),
      body: String(getAny(signal, "side") ?? getAny(signal, "action") ?? "NEW"),
      time: now,
    }),
  );

  return [...tradeEvents, ...signalEvents];
}

function normalizeGlobalContext(
  input: Props["globalContext"],
): GlobalMarketItem[] {
  const raw = Array.isArray(input)
    ? input
    : Array.isArray(input?.data)
      ? input.data
      : [];

  return raw
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        symbol: String(
          record.symbol ?? record.ticker ?? record.name ?? "N/A",
        ).toUpperCase(),
        price: safeNumber(
          record.price ??
            record.last_price ??
            record.lastPrice ??
            record.close ??
            record.value,
        ),
        changePct: safeNumber(
          record.changePct ??
            record.change_pct ??
            record.changePercent ??
            record.dailyChange ??
            record.change,
        ),
      };
    })
    .filter((item) => item.symbol !== "N/A" && item.price > 0);
}

function pickMarkets(markets: GlobalMarketItem[], order: string[]) {
  return order
    .map((symbol) => markets.find((item) => item.symbol === symbol))
    .filter((item): item is GlobalMarketItem => Boolean(item));
}

function prioritizeMarkets(markets: GlobalMarketItem[]) {
  const order = [
    "FSPX",
    "FDJI",
    "FDAX",
    "VIX",
    "XU100",
    "XU030",
    "XBANK",
    "XULAS",
    "XUMAL",
    "XUTEK",
    "XUSIN",
    "XHOLD",
    "DXY",
  ];
  return [...markets]
    .sort((a, b) => {
      const ai = order.indexOf(a.symbol);
      const bi = order.indexOf(b.symbol);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .slice(0, 10);
}

function getRegime(
  markets: GlobalMarketItem[],
  exposurePct: number,
  openPnl: number,
) {
  const vix = markets.find((item) => item.symbol === "VIX");
  const xu100 = markets.find((item) => item.symbol === "XU100");
  const xbank = markets.find((item) => item.symbol === "XBANK");
  const xutek = markets.find((item) => item.symbol === "XUTEK");
  const bistScore = [xu100, xbank, xutek].filter(
    (item) => item && item.changePct >= 0,
  ).length;
  const globalPositive = markets.filter(
    (item) =>
      ![
        "VIX",
        "XU100",
        "XU030",
        "XBANK",
        "XULAS",
        "XUMAL",
        "XUTEK",
        "XUSIN",
        "XHOLD",
      ].includes(item.symbol) && item.changePct >= 0,
  ).length;
  const vixSupportive = !vix || vix.changePct <= 0;

  if (exposurePct >= 90) {
    return {
      label: "KAPASİTE DOLU",
      tone: "warn" as const,
      description:
        "Maruziyet yüksek; yeni işlem için önce risk azaltımı izlenmeli.",
    };
  }

  if (vix && vix.changePct > 3) {
    return {
      label: "VOLATİL",
      tone: "bad" as const,
      description:
        "VIX yükseliyor; stop mesafeleri ve pozisyon yükü sıkı takip edilmeli.",
    };
  }

  if (bistScore >= 2 && globalPositive >= 2 && vixSupportive && openPnl >= 0) {
    return {
      label: "RISK ON",
      tone: "good" as const,
      description: "BIST ve global momentum portföyü destekliyor.",
    };
  }

  if (bistScore >= 2 && openPnl >= 0) {
    return {
      label: "BIST POZİTİF",
      tone: "good" as const,
      description: "Yerel endeksler destekli; global teyit izlenmeli.",
    };
  }

  if (bistScore <= 1 && openPnl < 0) {
    return {
      label: "DEFANSİF",
      tone: "bad" as const,
      description: "BIST zayıf ve portföy baskıda; risk azaltımı öncelikli.",
    };
  }

  return {
    label: "SEÇİCİ",
    tone: "warn" as const,
    description:
      "Portföy yönetimi öncelikli; yeni işlem sadece yüksek kalite sinyallerde.",
  };
}

function formatRejectReason(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const normalized = raw.toUpperCase();
  if (
    normalized.includes("MAX") ||
    normalized.includes("CAP") ||
    normalized.includes("LIMIT")
  )
    return "Pozisyon limiti";
  if (normalized.includes("RSI")) return "RSI filtresi";
  if (normalized.includes("ATR") || normalized.includes("DIST"))
    return "ATR uzaklık filtresi";
  if (normalized.includes("MACD")) return "MACD uyumsuzluğu";
  if (normalized.includes("DUPLICATE")) return "Aynı sembol açık";
  if (normalized.includes("INSERT")) return "Kayıt hatası";
  return raw.replaceAll("_", " ").slice(0, 42);
}

function bestRow(rows: PortfolioRow[]) {
  return rows.length
    ? [...rows].sort((a, b) => b.pnlPct - a.pnlPct)[0]
    : undefined;
}

function worstRow(rows: PortfolioRow[]) {
  return rows.length
    ? [...rows].sort((a, b) => a.pnlPct - b.pnlPct)[0]
    : undefined;
}

function riskAmount(row: PortfolioRow) {
  if (!row.stop || !row.current || !row.allocated) return 0;
  return Math.abs((row.riskPct / 100) * row.allocated);
}

function isClosedTrade(trade: Trade) {
  return (
    String(
      getAny(trade, "rawStatus") ?? getAny(trade, "status") ?? "",
    ).toUpperCase() === "CLOSED"
  );
}

function calcPnlPct(
  side: PortfolioRow["side"],
  entry: number,
  current: number,
) {
  if (!entry || !current) return 0;
  if (side === "SHORT") return ((entry - current) / entry) * 100;
  return ((current - entry) / entry) * 100;
}

function calcPnlAmount(
  side: PortfolioRow["side"],
  entry: number,
  current: number,
  qty: number,
) {
  if (!entry || !current || !qty) return 0;
  if (side === "SHORT") return (entry - current) * qty;
  return (current - entry) * qty;
}

function lockedProfitPct(
  side: PortfolioRow["side"],
  entry: number,
  stop: number,
) {
  if (!entry || !stop) return 0;
  const raw =
    side === "SHORT"
      ? ((entry - stop) / entry) * 100
      : ((stop - entry) / entry) * 100;
  return Math.max(0, raw);
}

function normalizeSide(value: unknown): PortfolioRow["side"] {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("LONG") || raw.includes("BUY")) return "LONG";
  if (raw.includes("SHORT") || raw.includes("SELL")) return "SHORT";
  return "-";
}

function getAny(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeNullable(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sideClass(side: string) {
  if (side === "LONG") return "text-xs font-black text-emerald-300";
  if (side === "SHORT") return "text-xs font-black text-red-300";
  return "text-xs font-black text-zinc-400";
}

function toneClasses(tone: "good" | "bad" | "warn" | "cyan" | "neutral") {
  const map = {
    good: "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300",
    bad: "border-red-400/20 bg-red-400/[0.08] text-red-300",
    warn: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300",
    cyan: "border-cyan-400/20 bg-cyan-400/[0.08] text-cyan-300",
    neutral: "border-white/10 bg-white/[0.035] text-zinc-300",
  };
  return map[tone];
}

function displayTrail(value: string) {
  const normalized = value.toUpperCase();
  if (normalized.includes("BREAKEVEN")) return "BE";
  if (normalized.includes("INITIAL")) return "INIT";
  if (normalized.includes("CLOSED")) return "CLOSED";
  return normalized.replace("TRAIL_", "+");
}

function ageText(value: string) {
  if (!value) return "-";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "-";
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}s ${minutes % 60}dk`;
  const days = Math.floor(hours / 24);
  return `${days}g ${hours % 24}s`;
}

function compactNumber(value: number) {
  return value.toLocaleString("tr-TR", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function money(value: number) {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function moneySigned(value: number) {
  const formatted = money(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function fmt(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
