// Reconciliation harness — KALICI BEKÇİ.
// Her CLOSED pozisyon için position_events'ten TOPLAM realized'ı bağımsız
// rekonstrükte eder, positions.pnl_amount ile karşılaştırır, SAPMALARI raporlar.
// pnl_amount muhasebesindeki (kısmi-çıkış) tutarsızlıkları yakalar.
//
// Çalıştır (env gerekli):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/reconcile-positions.ts
//
// Fix + migration ÖNCESİ: tam olarak bilinen 6 sapmayı bulmalı (harness'in
// doğru çalıştığının kanıtı). Migration SONRASI: 0 sapma beklenir.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !KEY) {
  console.error("HATA: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env değişkenleri gerekli.");
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest<T>(path: string): Promise<T> {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

interface Pos {
  id: string; symbol: string; side: string;
  entry_price: unknown; quantity: unknown; close_price: unknown; exit_price: unknown;
  pnl_amount: unknown; realized_partial_amount: unknown;
}
interface Ev { event_type: string; price: unknown; message: string | null }

// Event'lerden final (kalan) dilim PnL'ini rekonstrükte et — kısmi lotları
// mesajlardan ("sell X/Y lot") çıkarıp kalan lot × (çıkış-giriş).
function finalRecon(p: Pos, events: Ev[]): number {
  const entry = num(p.entry_price);
  const qty = num(p.quantity);
  const cp = num(p.close_price) || num(p.exit_price);
  const dir = p.side === "LONG" ? 1 : -1;
  let exited = 0;
  for (const e of events) {
    const msg = e.message ?? "";
    const m = /(\d+)\s*\/\s*(\d+)\s*lot/.exec(msg);
    if (/TP1/.test(e.event_type)) exited += m ? Number(m[1]) : qty / 2;
    else if (/REDUCE/.test(e.event_type)) exited += m ? Number(m[1]) : 0;
  }
  const finalQty = qty - exited;
  return (cp - entry) * finalQty * dir;
}

async function main() {
  const closed = await rest<Pos[]>(
    "positions?status=eq.CLOSED&select=id,symbol,side,entry_price,quantity,close_price,exit_price,pnl_amount,realized_partial_amount&limit=2000"
  );
  const multi = closed.filter((p) => num(p.realized_partial_amount) !== 0);
  const single = closed.length - multi.length;

  const flagged: Array<{ symbol: string; stored: number; correct: number; delta: number }> = [];
  for (const p of multi) {
    const pa = num(p.pnl_amount);
    const rp = num(p.realized_partial_amount);
    const ev = await rest<Ev[]>(
      `position_events?position_id=eq.${p.id}&select=event_type,price,message&order=created_at.asc`
    );
    const fr = finalRecon(p, ev);
    // Sınıflandır: pnl_amount final dilime mi (EKLEMELİ) yoksa zaten toplama mı yakın?
    const eklemeli = Math.abs(pa - fr) <= Math.abs(pa - (fr + rp));
    const correct = eklemeli ? pa + rp : pa; // gerçek toplam
    if (Math.abs(correct - pa) > 0.01) {
      flagged.push({ symbol: p.symbol, stored: round2(pa), correct: round2(correct), delta: round2(correct - pa) });
    }
  }

  const panelS1 = round2(closed.reduce((s, p) => s + num(p.pnl_amount), 0));
  const correction = round2(flagged.reduce((s, f) => s + f.delta, 0));
  const correctS1 = round2(panelS1 + correction);

  console.log(`Kapanan pozisyon: ${closed.length} (tek-aşamalı ${single}, çok-aşamalı ${multi.length})`);
  console.log(`\nSAPMALI (pnl_amount eksik yazılmış) pozisyon: ${flagged.length}`);
  for (const f of flagged) {
    console.log(`  ${f.symbol.padEnd(7)} stored=${f.stored.toFixed(2).padStart(10)} -> correct=${f.correct.toFixed(2).padStart(10)}  (+${f.delta.toFixed(2)})`);
  }
  console.log(`\nS1 panel (sum pnl_amount): ${panelS1.toFixed(2)} TL`);
  console.log(`Toplam düzeltme          : +${correction.toFixed(2)} TL`);
  console.log(`S1 DOĞRU                 : ${correctS1.toFixed(2)} TL`);
  console.log(`\n${flagged.length === 0 ? "✓ Sıfır sapma — tüm pnl_amount'lar tutarlı." : `⚠ ${flagged.length} sapma bulundu (migration öncesi beklenen).`}`);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

main().catch((e) => {
  console.error("HARNESS HATASI:", e instanceof Error ? e.message : e);
  process.exit(1);
});
