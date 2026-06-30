/**
 * TIOS Intelligence Engine — Position Adapter
 *
 * Converts the dashboard's PositionLifecycle objects (produced by
 * useTradingIntelligence, which itself normalizes raw Supabase rows)
 * into the PortfolioPositionInput shape the portfolio engine expects.
 *
 * PositionLifecycle's TypeScript type does not declare `quantity`,
 * `allocatedAmount`, or `sector`, but the underlying runtime objects
 * carry these fields (useTradingIntelligence type-casts raw Supabase
 * rows via `as unknown as PositionLifecycle`). This adapter reads them
 * defensively, the same way the dashboard's own getAny() helper does,
 * so a missing field never throws — it just falls back to a safe default.
 */

import { PortfolioPositionInput } from "./types";

function getAny(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Adapts a single dashboard position object into a PortfolioPositionInput.
 * Accepts `unknown` rather than PositionLifecycle because the runtime
 * shape carries fields the declared type does not — see module docstring.
 */
export function toPortfolioPositionInput(position: unknown): PortfolioPositionInput {
  const id = String(getAny(position, "id") ?? "");
  const symbol = String(getAny(position, "symbol") ?? "-");
  const sideRaw = String(getAny(position, "side") ?? "").toUpperCase();
  const side: "LONG" | "SHORT" = sideRaw === "SHORT" ? "SHORT" : "LONG";

  const entry = safeNumber(getAny(position, "entry"));
  const current = safeNumber(getAny(position, "current"), entry);
  const qty = safeNumber(
    getAny(position, "remainingQuantity") ?? getAny(position, "quantity"),
    0
  );
  const allocatedRaw = getAny(position, "allocatedAmount");
  const allocated =
    allocatedRaw !== undefined && allocatedRaw !== null
      ? safeNumber(allocatedRaw)
      : undefined;

  const sectorRaw = getAny(position, "sector");
  const sector =
    typeof sectorRaw === "string" && sectorRaw.trim() !== "" ? sectorRaw : null;

  return { id, symbol, side, entry, current, qty, allocated, sector };
}

/**
 * Adapts a list of dashboard positions, filtering to open positions only
 * (closed positions don't carry live portfolio risk).
 */
export function toPortfolioPositionInputs(
  positions: unknown[]
): PortfolioPositionInput[] {
  return positions
    .filter((p) => {
      const status = String(getAny(p, "status") ?? "OPEN").toUpperCase();
      return status !== "CLOSED";
    })
    .map(toPortfolioPositionInput);
}
