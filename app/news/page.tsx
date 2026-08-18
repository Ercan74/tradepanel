import TerminalSidebar from "@/components/terminal/TerminalSidebar";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    : null;

type NoteRow = {
  id: string;
  scan_at: string;
  scan_slot: string | null;
  note_type: string | null;
  content: string;
  summary: string | null;
  regime: string | null;
  confidence_kesin: number;
  confidence_raporlu: number;
  confidence_anlati: number;
  portfolio_symbols: string[] | null;
  model: string | null;
};

function trTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function regimeColor(regime: string | null) {
  const r = (regime ?? "").toUpperCase();
  if (r.includes("RISK-ON")) return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
  if (r.includes("RISK-OFF")) return "text-rose-300 border-rose-400/30 bg-rose-400/10";
  return "text-amber-300 border-amber-400/30 bg-amber-400/10";
}

export default async function NewsPage() {
  const { data } = supabase
    ? await supabase
        .from("news_context")
        .select("*")
        .order("scan_at", { ascending: false })
        .limit(20)
    : { data: [] as NoteRow[] };

  const notes = (data ?? []) as NoteRow[];

  return (
    <div className="flex min-h-screen bg-[#050812] text-slate-200">
      <TerminalSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-cyan-300">Haber Bağlamı</h1>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
            İZOLE — canlıya beslenmez (1c sonrası okunacak)
          </span>
          <span className="ml-auto text-xs text-slate-500">
            Otomatik tarama 10:00/14:00 TR · BAĞLAM üretir, SİNYAL değil
          </span>
        </header>

        {notes.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center text-slate-500">
            Henüz bağlam notu yok. İlk tarama 10:00/14:00 TR'de üretilir.
          </div>
        ) : (
          <div className="space-y-5">
            {notes.map((n) => (
              <article
                key={n.id}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-300">{trTime(n.scan_at)}</span>
                  {n.scan_slot && (
                    <span className="rounded border border-white/10 px-2 py-0.5 text-slate-400">
                      {n.scan_slot}
                    </span>
                  )}
                  <span className="rounded border border-cyan-400/20 bg-cyan-400/5 px-2 py-0.5 text-cyan-300">
                    {n.note_type ?? "DELTA"}
                  </span>
                  {n.regime && (
                    <span className={`rounded border px-2 py-0.5 font-semibold ${regimeColor(n.regime)}`}>
                      {n.regime}
                    </span>
                  )}
                  <span className="rounded border border-white/10 px-2 py-0.5 text-slate-400">
                    KESİN {n.confidence_kesin} · RAPORLU {n.confidence_raporlu} · ANLATI {n.confidence_anlati}
                  </span>
                  {n.model && (
                    <span className="ml-auto text-slate-600">{n.model}</span>
                  )}
                </div>

                {n.summary && (
                  <p className="mb-3 text-sm text-slate-400">{n.summary}</p>
                )}

                {n.portfolio_symbols && n.portfolio_symbols.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {n.portfolio_symbols.map((s) => (
                      <span key={s} className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <details className="group">
                  <summary className="cursor-pointer select-none text-sm font-medium text-cyan-400/80 hover:text-cyan-300">
                    Notu göster / gizle
                  </summary>
                  <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words border-t border-white/10 pt-3 font-mono text-[13px] leading-relaxed text-slate-300">
                    {n.content}
                  </pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
