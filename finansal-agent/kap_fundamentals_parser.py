"""
KAP Finansal Tablolar → Supabase fundamentals (Faz-1 MVP, 2026-08-24)
---------------------------------------------------------------------
"Finansal Tablolar/" klasöründeki KAP dosyalarını (HTML-tablo .xls) okur, sembol
başına standartlaştırılmış temel-analiz kalemlerini çıkarır ve Supabase
`fundamentals` tablosuna yazar. Çeyrekte bir çalıştırılır.

İki şablon:
  - BANKA/FİNANSAL: özkaynak (TP/YP/Toplam kolonları), net kâr → P/D-ROE değerleme.
  - SANAYİ/OPERASYONEL: TOPLAM VARLIKLAR + hasılat/faaliyet kârı/amortisman/borç.
Şablon içerikten saptanır ("TOPLAM VARLIKLAR" varsa sanayi, yoksa banka).
Holdingler sanayi şablonuyla ayrıştırılır ama template=holding etiketlenir
(değerleme NAV gerektirir → Faz-2; şimdilik P/D-F/K bağlam).

Kullanım:
  python kap_fundamentals_parser.py            # DRY-RUN (yalnız yazdırır)
  python kap_fundamentals_parser.py --live     # Supabase'e yazar
  python kap_fundamentals_parser.py GARAN PETKM # yalnız verilen semboller (dry-run)
Ortam: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (--live için).
"""
import os, re, sys, glob, json
import pandas as pd
import warnings
warnings.filterwarnings("ignore")

FIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Finansal Tablolar")

# Holding + finansal sektör sembolleri (template etiketleme / uyarı için).
HOLDING_SYMBOLS = {
    "KCHOL","SAHOL","ALARK","RALYH","AGHOL","DOHOL","GLYHO","TKFEN","ENKAI","BRYAT",
    "IEYHO","ECILC","KLRHO","POLHO","AKYHO","TAVHL","SISE",
}

# ---- KAP finansal statement dosyasında portföy/watchlist odaklı hedef semboller ----
DEFAULT_TARGETS = [
    "GARAN","AKBNK","ISCTR","YKBNK",         # banka referans
    "ASELS","GUBRF","OYAKC","PETKM","MPARK", # sanayi/operasyonel (portföy)
    "KCHOL","SAHOL","ALARK","RALYH",         # holding (portföy)
    "VESTL","GENIL","CVKMD","SOKM","ALTNY",  # diğer izleme
]

NOMINAL = 1.0  # BIST hisse nominal 1 TL (standart)


def parse_scale(text: str) -> int:
    t = (text or "").replace(".", "").replace(" ", "").lower()
    if "1000000tl" in t: return 1_000_000
    if "1000tl" in t: return 1_000
    return 1  # tam TL


def parse_cell(s):
    """Türkçe sayı: '2.534.400'->2534400, '-12.051.234'->-12051234. Not-referansı
    (5.2.14, 13.0, 4.0, %..) ve metin -> None. '0' gibi düz tam sayı -> int."""
    s = ("" if s is None else str(s)).strip()
    if re.match(r"^-?\d{1,3}(\.\d{3})+$", s):     # binlik ayraçlı gerçek rakam
        return int(s.replace(".", ""))
    if re.match(r"^-?\d+$", s):                    # düz tam sayı (0, küçük)
        return int(s)
    return None


def row_values(cells):
    """Satırdaki sayısal değerleri, baştaki not-referanslarını atarak döndürür."""
    nums = [parse_cell(c) for c in cells]
    vals = [n for n in nums if n is not None]
    # baştaki küçük not-ref'leri (ör. income '15') at: <1000 iken ardından >=1000 varsa
    while len(vals) >= 2 and abs(vals[0]) < 1000 and abs(vals[1]) >= 1000:
        vals.pop(0)
    return vals


def cell(x):
    try:
        s = str(x); return "" if s == "nan" else s.strip()
    except Exception:
        return ""


class Doc:
    def __init__(self, path):
        self.path = path
        self.tables = pd.read_html(path)
        # meta (T0)
        self.scale = 1
        self.consolidation = "?"
        for _, r in self.tables[0].iterrows():
            cells = [cell(v) for v in r.tolist()]
            if not cells: continue
            lbl = cells[0].lower()
            if "para birimi" in lbl and len(cells) > 1:
                self.scale = parse_scale(cells[1])
            if "niteliği" in lbl and len(cells) > 1:
                self.consolidation = cells[1]
        # şablon: içerikte TOPLAM VARLIKLAR varsa sanayi
        self.template = "bank"
        for t in self.tables[:5]:
            if t.astype(str).apply(lambda col: col.str.contains("TOPLAM VARLIKLAR", na=False)).any().any():
                self.template = "industrial"; break

    def find(self, phrases, want="current"):
        """İlk eşleşen satırın current-period değerini döndürür (None=bulunamadı)."""
        low = [p.lower() for p in phrases]
        for t in self.tables:
            arr = t.astype(str).values
            for r in range(arr.shape[0]):
                cells = [cell(arr[r, c]) for c in range(arr.shape[1])]
                joined = " | ".join(cells).lower()
                # etiket eşleşmesi: satırdaki ilk metin hücresi bir phrase ile başlasın/eşleşsin
                label = next((c for c in cells if c and parse_cell(c) is None and not re.match(r"^-?[\d.,]+$", c)), "")
                ll = label.lower()
                if any(ll == p or ll.startswith(p) for p in low):
                    vals = row_values(cells)
                    if not vals: continue
                    if self.template == "bank" and len(vals) >= 3:
                        return vals[2] * self.scale   # Toplam kolonu
                    return vals[0] * self.scale        # current period
        return None


def _is_solo(path):
    """Ucuz: dosyanın ilk ~10KB ham metninde 'Konsolide Olmayan' geçiyor mu."""
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return "Konsolide Olmayan" in fh.read(10000)
    except Exception:
        return False


def find_file(symbol):
    """Sembol için KAP dosyası; birden çok varsa Konsolide olanı tercih.
    Bileşik adları da yakalar (ör. ISCTR → ISATR-...-ISCTR-..., YKBNK → YKB-YKBNK).
    Tam parse YAPMAZ — konsolide tespiti ham metinden (hızlı)."""
    d = FIN_DIR
    pats = glob.glob(os.path.join(d, f"{symbol}_*.xls")) + glob.glob(os.path.join(d, f"{symbol}-*.xls"))
    if not pats:  # bileşik ad fallback (sembol dosya adının ortasında)
        pats = [p for p in glob.glob(os.path.join(d, f"*{symbol}*.xls"))]
    if not pats:
        return None
    pats = sorted(set(pats))
    kons = [p for p in pats if not _is_solo(p)]
    return (kons[0] if kons else pats[0])


def extract(symbol):
    path = find_file(symbol)
    if not path:
        return {"symbol": symbol, "error": "dosya bulunamadı"}
    doc = Doc(path)
    tmpl = "holding" if symbol in HOLDING_SYMBOLS else doc.template
    f = doc.find

    paid_in = f(["Ödenmiş Sermaye"])
    equity_parent = f(["Ana Ortaklığa Ait Özkaynaklar", "Ana Ortaklık Payları Özkaynak"]) or f(["Özkaynaklar Toplamı", "TOPLAM ÖZKAYNAKLAR", "ÖZKAYNAKLAR"])
    equity_total = f(["ÖZKAYNAKLAR", "TOPLAM ÖZKAYNAKLAR", "Özkaynaklar Toplamı"]) or equity_parent
    ni = f(["Dönem Net Kâr veya Zararı", "Net Dönem Karı veya Zararı", "DÖNEM KARI (ZARARI)", "Dönem Kârı (Zararı)"])
    ni_parent = f(["Ana Ortaklık Payları"]) or ni
    total_assets = f(["TOPLAM VARLIKLAR", "Toplam Varlıklar"]) or f(["YÜKÜMLÜLÜKLER TOPLAMI", "Aktif Toplamı"])
    revenue = f(["Hasılat", "Satış Gelirleri"]) if tmpl != "bank" else None
    gross = f(["BRÜT KAR (ZARAR)", "Brüt Kâr (Zarar)"]) if tmpl != "bank" else None
    op = f(["ESAS FAALİYET KARI (ZARARI)", "Esas Faaliyet Kârı"]) if tmpl != "bank" else None
    dep = f(["Amortisman ve İtfa Gideri İle İlgili Düzeltmeler", "Amortisman ve İtfa Giderleri"]) if tmpl != "bank" else None

    shares = (paid_in / NOMINAL) if paid_in else None
    bvps = (equity_parent / shares) if (equity_parent and shares) else None
    eps_p = (ni_parent / shares) if (ni_parent and shares) else None
    eps_a = eps_p * 2 if eps_p is not None else None   # H1×2
    roe = None
    if ni and equity_total:
        roe = (ni * 2) / equity_total   # yıllıklandırılmış / dönem-sonu özkaynak

    return {
        "symbol": symbol, "period": "2026/06", "period_end": "2026-06-30",
        "template": tmpl, "consolidation": doc.consolidation, "currency_scale": doc.scale,
        "shares": shares, "paid_in_capital": paid_in,
        "equity_parent": equity_parent, "equity_total": equity_total,
        "net_income_period": ni, "net_income_parent": ni_parent, "total_assets": total_assets,
        "revenue": revenue, "gross_profit": gross, "operating_profit": op, "dep_amort": dep,
        "financial_debt": None, "cash": None,
        "bvps": bvps, "eps_period": eps_p, "eps_annualized": eps_a, "roe": roe,
        "source_file": os.path.basename(path),
    }


def fmt(v):
    if v is None: return "—"
    if isinstance(v, float): return f"{v:,.2f}"
    if isinstance(v, int): return f"{v:,}"
    return str(v)


def upsert_one(row):
    """Tek satırı Supabase'e yaz (kademeli — çökerse ilerleme korunur)."""
    import requests
    url = os.environ["SUPABASE_URL"].rstrip("/"); key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    payload = [{k: v for k, v in row.items() if k != "error"}]
    resp = requests.post(
        f"{url}/rest/v1/fundamentals?on_conflict=symbol,period",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
        data=json.dumps(payload),
    )
    return resp.status_code < 300, resp


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    live = "--live" in sys.argv
    targets = args if args else DEFAULT_TARGETS
    ok = fail = err = 0
    total = len(targets)
    for idx, sym in enumerate(targets, 1):
        r = extract(sym)
        if "error" in r:
            err += 1; print(f"[{idx}/{total}] {sym:8} ATLA: {r['error']}", flush=True); continue
        roe = f"{r['roe']*100:.0f}%" if r['roe'] else "—"
        print(f"[{idx}/{total}] {sym:8} {r['template']:10} BVPS={fmt(r['bvps'])} EPS={fmt(r['eps_annualized'])} ROE={roe}", flush=True)
        if live:
            good, resp = upsert_one(r)
            if good: ok += 1
            else: fail += 1; print(f"    YAZMA HATASI {resp.status_code}: {resp.text[:150]}", flush=True)
    if live:
        print(f"\n>>> BİTTİ — yazılan: {ok} | yazma-hatası: {fail} | dosya-yok/atla: {err} | toplam: {total}", flush=True)
    else:
        print(f"\n(DRY-RUN — yazmadı. Supabase'e yazmak için --live) | işlenen: {total}, atlanan: {err}", flush=True)


if __name__ == "__main__":
    main()
