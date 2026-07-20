import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests
import xlwings as xw

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://sebzfdkcfgopffjiekqg.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYnpmZGtjZmdvcGZmamlla3FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzg5OTY5NiwiZXhwIjoyMDkzNDc1Njk2fQ.uRL088OT2wSoDT9LGbk7cMKXBQ13ynbyVm1F6hcVenA")

EXCEL_BOOK_NAME = "Kitap1.xlsx"
SHEET_NAME = "Sayfa4"

START_ROW = 4
END_ROW = 220
SYNC_INTERVAL_SECONDS = 5

GLOBAL_CONTEXT_SYMBOLS = {
    "FDJI": "Dow Jones Future",
    "FSPX": "S&P 500 Future",
    "FDAX": "DAX Future",
    "VIX": "Volatility Index",
    "DXY": "Dollar Index",
    "XU100": "BIST 100",
    "XU030": "BIST 30",
    "XBANK": "BIST Banka",
    "XULAS": "BIST Ulaştırma",
    "XUMAL": "BIST Mali",
    "XUTEK": "BIST Teknoloji",
    "XUSIN": "BIST Sanayi",
    "XHOLD": "BIST Holding",
    "XGMYO": "BIST GMYO",
}


# ---------------------------------------------------------------------------
# BIST Sektör Haritası (Kaynak: Borsa İstanbul resmi sektör sınıflandırması)
# 631 sembol, lib/intelligence/portfolio/sectorMap.ts ile senkronize.
# Sembol listede yoksa None döner — pozisyon sector=NULL olarak kaydedilir.
# ---------------------------------------------------------------------------
BIST_SECTOR_MAP: dict[str, str] = {
    "A1CAP": "ARACI KURUMLAR",
    "A1YEN": "ELEKTRİK GAZ VE SU",
    "AAGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ACP": "ARACI KURUMLAR",
    "ACSEL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ADEL": "DİĞER İMALAT SANAYİİ",
    "ADESE": "GAYRİMENKUL FAALİYETLERİ",
    "ADGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AEFES": "GIDA, İÇECEK VE TÜTÜN",
    "AFYON": "TAŞ VE TOPRAĞA DAYALI",
    "AGESA": "SİGORTA ŞİRKETLERİ",
    "AGHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "AGROT": "TARIM VE HAYVANCILIK AVCILIK VE İLGİLİ HİZMET FAALİYETLERİ",
    "AGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AHGAZ": "ELEKTRİK GAZ VE SU",
    "AHSGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AKBNK": "BANKALAR",
    "AKCNS": "TAŞ VE TOPRAĞA DAYALI",
    "AKENR": "ELEKTRİK GAZ VE SU",
    "AKFGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AKFIS": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "AKFYE": "ELEKTRİK GAZ VE SU",
    "AKGRT": "SİGORTA ŞİRKETLERİ",
    "AKHAN": "GIDA, İÇECEK VE TÜTÜN",
    "AKMGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AKSA": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "AKSEN": "ELEKTRİK GAZ VE SU",
    "AKSGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AKSUE": "ELEKTRİK GAZ VE SU",
    "AKYHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ALARK": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ALBRK": "BANKALAR",
    "ALCAR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ALCTL": "BİLİŞİM",
    "ALFAS": "ELEKTRİK GAZ VE SU",
    "ALGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ALK": "BANKALAR",
    "ALKA": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "ALKIM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ALKLC": "GIDA, İÇECEK VE TÜTÜN",
    "ALTNY": "SAVUNMA",
    "ALVES": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ANELE": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "ANGEN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ANHYT": "SİGORTA ŞİRKETLERİ",
    "ANSGR": "SİGORTA ŞİRKETLERİ",
    "ARASE": "ELEKTRİK GAZ VE SU",
    "ARCLK": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ARDYZ": "BİLİŞİM",
    "ARENA": "BİLİŞİM",
    "ARFYE": "ELEKTRİK GAZ VE SU",
    "ARMGD": "GIDA, İÇECEK VE TÜTÜN",
    "ARSAN": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ARTMS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "ARZUM": "TOPTAN TİCARET",
    "ASELS": "SAVUNMA",
    "ASGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ASTOR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ASUZU": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ATAGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ATAKP": "GIDA, İÇECEK VE TÜTÜN",
    "ATATP": "BİLİŞİM",
    "ATATR": "KONAKLAMA",
    "ATEKS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "ATLAS": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "ATSYH": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "AVGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AVHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "AVOD": "GIDA, İÇECEK VE TÜTÜN",
    "AVPGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "AVTUR": "KONAKLAMA",
    "AYCES": "KONAKLAMA",
    "AYDEM": "ELEKTRİK GAZ VE SU",
    "AYEN": "ELEKTRİK GAZ VE SU",
    "AYES": "ANA METAL SANAYİ",
    "AYGAZ": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "AZTEK": "BİLİŞİM",
    "BAGFS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "BAHKM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "BAKAB": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "BALAT": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "BALSU": "GIDA, İÇECEK VE TÜTÜN",
    "BANVT": "GIDA, İÇECEK VE TÜTÜN",
    "BARMA": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "BASCM": "TAŞ VE TOPRAĞA DAYALI",
    "BASGZ": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "BAYRK": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "BEGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "BERA": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "BESLR": "GIDA, İÇECEK VE TÜTÜN",
    "BESTE": "ELEKTRİK GAZ VE SU",
    "BETAE": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "BEYAZ": "ULAŞTIRMA VE DEPOLAMA",
    "BFREN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "BIENY": "TAŞ VE TOPRAĞA DAYALI",
    "BIGCH": "YİYECEK VE İÇECEK HİZMETLERİ",
    "BIGEN": "ELEKTRİK GAZ VE SU",
    "BIGTK": "YAYIMCILIK",
    "BIMAS": "PERAKENDE TİCARET",
    "BINBN": "BİLİŞİM",
    "BINHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "BIOEN": "ELEKTRİK GAZ VE SU",
    "BIZIM": "PERAKENDE TİCARET",
    "BJKAS": "SPOR FAALİYETLERİ EĞLENCE VE OYUN FAALİYETLERİ",
    "BLCYT": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "BLUME": "ANA METAL SANAYİ",
    "BMSCH": "ANA METAL SANAYİ",
    "BMSTL": "ANA METAL SANAYİ",
    "BNTAS": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "BOBET": "TAŞ VE TOPRAĞA DAYALI",
    "BORLS": "KİRALAMA VE LEASING FAALİYETLERİ",
    "BORSK": "GIDA, İÇECEK VE TÜTÜN",
    "BOSSA": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "BRISA": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "BRKO": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "BRKSN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "BRKVY": "VARLIK YÖNETİM ŞİRKETLERİ",
    "BRLSM": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "BRMEN": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "BRSAN": "ANA METAL SANAYİ",
    "BRYAT": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "BSOKE": "TAŞ VE TOPRAĞA DAYALI",
    "BTCIM": "TAŞ VE TOPRAĞA DAYALI",
    "BUCIM": "TAŞ VE TOPRAĞA DAYALI",
    "BULGS": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "BURCE": "ANA METAL SANAYİ",
    "BURVA": "ANA METAL SANAYİ",
    "BVSAN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "BYDNR": "YİYECEK VE İÇECEK HİZMETLERİ",
    "CANTE": "ELEKTRİK GAZ VE SU",
    "CASA": "PERAKENDE TİCARET",
    "CATES": "ELEKTRİK GAZ VE SU",
    "CCOLA": "GIDA, İÇECEK VE TÜTÜN",
    "CELHA": "ANA METAL SANAYİ",
    "CEMAS": "ANA METAL SANAYİ",
    "CEMTS": "ANA METAL SANAYİ",
    "CEMZY": "GIDA, İÇECEK VE TÜTÜN",
    "CEOEM": "BÜRO YÖNETİMİ, BÜRO DESTEĞİ VE DİĞER ŞİRKET DESTEK FAALİYETLERİ",
    "CGCAM": "TAŞ VE TOPRAĞA DAYALI",
    "CIMSA": "TAŞ VE TOPRAĞA DAYALI",
    "CLEBI": "ULAŞTIRMA VE DEPOLAMA",
    "CMBTN": "TAŞ VE TOPRAĞA DAYALI",
    "CMENT": "TAŞ VE TOPRAĞA DAYALI",
    "CONSE": "ELEKTRİK GAZ VE SU",
    "COSMO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "CRDFA": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "CRFSA": "PERAKENDE TİCARET",
    "CUSAN": "ANA METAL SANAYİ",
    "CVKMD": "METAL CEVHERİ MADENCİLİĞİ",
    "CWENE": "ELEKTRİK GAZ VE SU",
    "DAGI": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "DAPGM": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "DARDL": "GIDA, İÇECEK VE TÜTÜN",
    "DCTTR": "TOPTAN TİCARET",
    "DENGE": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "DERHL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "DERIM": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "DESA": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "DESPC": "BİLİŞİM",
    "DEVA": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "DGATE": "BİLİŞİM",
    "DGGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "DGNMO": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "DIRIT": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "DITAS": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "DMRGD": "GIDA, İÇECEK VE TÜTÜN",
    "DMSAS": "ANA METAL SANAYİ",
    "DNISI": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "DOAS": "TOPTAN TİCARET",
    "DOCO": "YİYECEK VE İÇECEK HİZMETLERİ",
    "DOFER": "ANA METAL SANAYİ",
    "DOFRB": "BİLİŞİM",
    "DOGUB": "TAŞ VE TOPRAĞA DAYALI",
    "DOHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "DOKTA": "ANA METAL SANAYİ",
    "DSTKF": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "DUNYH": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "DURDO": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "DURKN": "GIDA, İÇECEK VE TÜTÜN",
    "DYOBY": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "DZGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "EBEBK": "PERAKENDE TİCARET",
    "ECILC": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ECOGR": "ELEKTRİK GAZ VE SU",
    "ECZYT": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "EDATA": "BİLİŞİM",
    "EDIP": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "EFOR": "GIDA, İÇECEK VE TÜTÜN",
    "EGEEN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "EGEGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "EGEPO": "İNSAN SAĞLIĞI VE SOSYAL HİZMETLER",
    "EGGUB": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "EGPRO": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "EGSER": "TAŞ VE TOPRAĞA DAYALI",
    "EKDMR": "ANA METAL SANAYİ",
    "EKGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "EKIZ": "GIDA, İÇECEK VE TÜTÜN",
    "EKOS": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "EKSUN": "GIDA, İÇECEK VE TÜTÜN",
    "ELITE": "GIDA, İÇECEK VE TÜTÜN",
    "EMKEL": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "EMNIS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "EMPAE": "BİLİŞİM",
    "ENDAE": "ELEKTRİK GAZ VE SU",
    "ENERY": "ELEKTRİK GAZ VE SU",
    "ENJSA": "ELEKTRİK GAZ VE SU",
    "ENKAI": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "ENPRA": "BANKALAR",
    "ENSRI": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "ENTRA": "ELEKTRİK GAZ VE SU",
    "EPLAS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ERBOS": "ANA METAL SANAYİ",
    "ERCB": "ANA METAL SANAYİ",
    "EREGL": "ANA METAL SANAYİ",
    "ERSU": "GIDA, İÇECEK VE TÜTÜN",
    "ESCAR": "KİRALAMA VE LEASING FAALİYETLERİ",
    "ESCOM": "BİLİŞİM",
    "ESEN": "ELEKTRİK GAZ VE SU",
    "ETILR": "YİYECEK VE İÇECEK HİZMETLERİ",
    "ETYAT": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "EUHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "EUKYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "EUPWR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "EUREN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "EUYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "EYGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "FADE": "GIDA, İÇECEK VE TÜTÜN",
    "FENER": "SPOR FAALİYETLERİ EĞLENCE VE OYUN FAALİYETLERİ",
    "FIN": "BANKALAR",
    "FLAP": "BÜRO YÖNETİMİ, BÜRO DESTEĞİ VE DİĞER ŞİRKET DESTEK FAALİYETLERİ",
    "FMIZP": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "FONET": "BİLİŞİM",
    "FORMT": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "FORTE": "BİLİŞİM",
    "FRIGO": "GIDA, İÇECEK VE TÜTÜN",
    "FRMPL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "FROTO": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "FZLGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "GARAN": "BANKALAR",
    "GARFA": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "GATEG": "YARATICI SANATLAR GÖSTERİ SANATLARI VE EĞLENCE FAALİYETLERİ",
    "GEDIK": "ARACI KURUMLAR",
    "GEDZA": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "GENIL": "TOPTAN TİCARET",
    "GENKM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "GENTS": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "GEREL": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "GESAN": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "GIPTA": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "GLB": "ARACI KURUMLAR",
    "GLBMD": "ARACI KURUMLAR",
    "GLCVY": "VARLIK YÖNETİM ŞİRKETLERİ",
    "GLRMK": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "GLRYH": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "GLYHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "GMTAS": "PERAKENDE TİCARET",
    "GOKNR": "GIDA, İÇECEK VE TÜTÜN",
    "GOLTS": "TAŞ VE TOPRAĞA DAYALI",
    "GOODY": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "GOZDE": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "GRNYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "GRSEL": "ULAŞTIRMA VE DEPOLAMA",
    "GRTHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "GSDDE": "ULAŞTIRMA VE DEPOLAMA",
    "GSDHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "GSRAY": "SPOR FAALİYETLERİ EĞLENCE VE OYUN FAALİYETLERİ",
    "GUBRF": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "GUNDG": "GIDA, İÇECEK VE TÜTÜN",
    "GWIND": "ELEKTRİK GAZ VE SU",
    "GZNMI": "SEYAHAT ACENTESİ, TUR OPERATÖRÜ VE DİĞER REZERVASYON HİZMETLERİ İLE İLGİLİ FAALİYETLER",
    "HALKB": "BANKALAR",
    "HATEK": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "HATSN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "HDFGS": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "HEDEF": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "HEKTS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "HKTM": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "HLGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "HOROZ": "ULAŞTIRMA VE DEPOLAMA",
    "HRKET": "ULAŞTIRMA VE DEPOLAMA",
    "HTTBT": "BİLİŞİM",
    "HUBVC": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "HUNER": "ELEKTRİK GAZ VE SU",
    "HURGZ": "YAYIMCILIK",
    "ICB": "BANKALAR",
    "ICBCT": "BANKALAR",
    "ICUGS": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "IDGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "IEYHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "IHAAS": "BİLGİ HİZMET FAALİYETLERİ",
    "IHEVA": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "IHGZT": "YAYIMCILIK",
    "IHLAS": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "IHLGM": "GAYRİMENKUL FAALİYETLERİ",
    "IHYAY": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "IMASM": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "INDES": "BİLİŞİM",
    "INFO": "ARACI KURUMLAR",
    "INGRM": "BİLİŞİM",
    "INTEK": "BİLİŞİM",
    "INTEM": "TOPTAN TİCARET",
    "INVEO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "INVES": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ISATR": "BANKALAR",
    "ISBIR": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ISBTR": "BANKALAR",
    "ISCTR": "BANKALAR",
    "ISDMR": "ANA METAL SANAYİ",
    "ISFIN": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "ISGSY": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "ISGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ISKPL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ISKUR": "BANKALAR",
    "ISMEN": "ARACI KURUMLAR",
    "ISSEN": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "ISYAT": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "IYF": "ARACI KURUMLAR",
    "IYM": "ARACI KURUMLAR",
    "IZENR": "ELEKTRİK GAZ VE SU",
    "IZFAS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "IZINV": "TARIM VE HAYVANCILIK AVCILIK VE İLGİLİ HİZMET FAALİYETLERİ",
    "IZMDC": "ANA METAL SANAYİ",
    "JANTS": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "KAPLM": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "KAREL": "BİLİŞİM",
    "KARSN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "KARTN": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "KATMR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "KAYSE": "GIDA, İÇECEK VE TÜTÜN",
    "KBORU": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "KCAER": "ANA METAL SANAYİ",
    "KCHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "KENT": "GIDA, İÇECEK VE TÜTÜN",
    "KERVN": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "KFEIN": "BİLİŞİM",
    "KGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "KIMMR": "PERAKENDE TİCARET",
    "KLGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "KLKIM": "TAŞ VE TOPRAĞA DAYALI",
    "KLMSN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "KLN": "BANKALAR",
    "KLNMA": "BANKALAR",
    "KLRHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "KLSER": "TAŞ VE TOPRAĞA DAYALI",
    "KLSYN": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "KLYPV": "ELEKTRİK GAZ VE SU",
    "KMPUR": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "KNFRT": "TARIM VE HAYVANCILIK AVCILIK VE İLGİLİ HİZMET FAALİYETLERİ",
    "KOCMT": "ANA METAL SANAYİ",
    "KONKA": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "KONTR": "MİMARLIK VE MÜHENDİSLİK FAALİYETLERİ; TEKNİK MUAYENE VE ANALİZ",
    "KONYA": "TAŞ VE TOPRAĞA DAYALI",
    "KOPOL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "KORDS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "KOTON": "PERAKENDE TİCARET",
    "KRDMA": "ANA METAL SANAYİ",
    "KRDMB": "ANA METAL SANAYİ",
    "KRDMD": "ANA METAL SANAYİ",
    "KRGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "KRONT": "BİLİŞİM",
    "KRPLS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "KRSTL": "GIDA, İÇECEK VE TÜTÜN",
    "KRTEK": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "KRVGD": "GIDA, İÇECEK VE TÜTÜN",
    "KSTUR": "KONAKLAMA",
    "KTLEV": "FİNANSMAN ŞİRKETLERİ",
    "KTSKR": "GIDA, İÇECEK VE TÜTÜN",
    "KUTPO": "TAŞ VE TOPRAĞA DAYALI",
    "KUVVA": "TOPTAN TİCARET",
    "KUYAS": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "KZBGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "KZGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "LIDER": "KİRALAMA VE LEASING FAALİYETLERİ",
    "LIDFA": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "LILAK": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "LINK": "BİLİŞİM",
    "LKMNH": "İNSAN SAĞLIĞI VE SOSYAL HİZMETLER",
    "LMKDC": "TAŞ VE TOPRAĞA DAYALI",
    "LOGO": "BİLİŞİM",
    "LRSHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "LUKSK": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "LXGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "LYDHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "LYDYE": "ELEKTRİK GAZ VE SU",
    "MAALT": "KONAKLAMA",
    "MACKO": "SPOR EĞLENCE BOŞ ZAMANLARI DEĞERLENDİRME HİZMETLERİ",
    "MAGEN": "ELEKTRİK GAZ VE SU",
    "MAKIM": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "MAKTK": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "MANAS": "BİLİŞİM",
    "MARBL": "TAŞ VE TOPRAĞA DAYALI",
    "MARKA": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "MARMR": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "MARTI": "KONAKLAMA",
    "MAVI": "PERAKENDE TİCARET",
    "MCARD": "BİLİŞİM",
    "MEDTR": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "MEGAP": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "MEGMT": "ANA METAL SANAYİ",
    "MEKAG": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "MEPET": "PERAKENDE TİCARET",
    "MERCN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "MERIT": "KONAKLAMA",
    "MERKO": "GIDA, İÇECEK VE TÜTÜN",
    "METRO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "MEYSU": "GIDA, İÇECEK VE TÜTÜN",
    "MGROS": "PERAKENDE TİCARET",
    "MHRGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "MIATK": "BİLİŞİM",
    "MMCAS": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "MNDRS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "MNDTR": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "MOBTL": "BİLİŞİM",
    "MOGAN": "ELEKTRİK GAZ VE SU",
    "MOPAS": "PERAKENDE TİCARET",
    "MPARK": "İNSAN SAĞLIĞI VE SOSYAL HİZMETLER",
    "MRGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "MRSHL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "MSGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "MTRKS": "BİLİŞİM",
    "MTRYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "MZHLD": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "NATEN": "ELEKTRİK GAZ VE SU",
    "NETAS": "BİLİŞİM",
    "NETCD": "BİLİŞİM",
    "NIBAS": "TAŞ VE TOPRAĞA DAYALI",
    "NTGAZ": "ELEKTRİK GAZ VE SU",
    "NTHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "NUGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "NUHCM": "TAŞ VE TOPRAĞA DAYALI",
    "OBAMS": "GIDA, İÇECEK VE TÜTÜN",
    "OBASE": "BİLİŞİM",
    "ODAS": "ELEKTRİK GAZ VE SU",
    "ODINE": "BİLİŞİM",
    "OFSYM": "GIDA, İÇECEK VE TÜTÜN",
    "OMD": "ARACI KURUMLAR",
    "ONCSM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "ONRYT": "SAVUNMA",
    "ORCAY": "GIDA, İÇECEK VE TÜTÜN",
    "ORGE": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "ORMA": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "OSMEN": "ARACI KURUMLAR",
    "OSTIM": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "OTKAR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "OTTO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "OYA": "ARACI KURUMLAR",
    "OYAKC": "TAŞ VE TOPRAĞA DAYALI",
    "OYAYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "OYLUM": "GIDA, İÇECEK VE TÜTÜN",
    "OYYAT": "ARACI KURUMLAR",
    "OZATD": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "OZGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "OZKGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "OZRDN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "OZSUB": "BALIKÇILIK VE SU ÜRÜNLERİ",
    "OZYSR": "ANA METAL SANAYİ",
    "PAGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "PAHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "PAMEL": "ELEKTRİK GAZ VE SU",
    "PAPIL": "BİLİŞİM",
    "PARSN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "PASEU": "ULAŞTIRMA VE DEPOLAMA",
    "PATEK": "BİLİŞİM",
    "PCILT": "REKLAMCILIK VE PAZAR ARAŞTIRMASI",
    "PEKGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "PENGD": "GIDA, İÇECEK VE TÜTÜN",
    "PENTA": "BİLİŞİM",
    "PETKM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "PETUN": "GIDA, İÇECEK VE TÜTÜN",
    "PGSUS": "ULAŞTIRMA VE DEPOLAMA",
    "PINSU": "GIDA, İÇECEK VE TÜTÜN",
    "PKART": "BİLİŞİM",
    "PKENT": "KONAKLAMA",
    "PLTUR": "KİRALAMA VE LEASING FAALİYETLERİ",
    "PNLSN": "ANA METAL SANAYİ",
    "PNSUT": "GIDA, İÇECEK VE TÜTÜN",
    "POLHO": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "POLTK": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "PRDGS": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "PRKAB": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "PRKME": "KÖMÜR VE LİNYİT MADENCİLİĞİ",
    "PRZMA": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "PSDTC": "TOPTAN TİCARET",
    "PSGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "QNBFK": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "QNBTR": "BANKALAR",
    "QUAGR": "TAŞ VE TOPRAĞA DAYALI",
    "RALYH": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "RAYSG": "SİGORTA ŞİRKETLERİ",
    "REEDR": "BİLİŞİM",
    "RGYAS": "GAYRİMENKUL FAALİYETLERİ",
    "RNPOL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "RODRG": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "RTALB": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "RUBNS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "RUZYE": "KÖMÜR VE LİNYİT MADENCİLİĞİ",
    "RYGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "RYSAS": "ULAŞTIRMA VE DEPOLAMA",
    "SAFKR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "SAHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "SAMAT": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "SANEL": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "SANFM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "SANKO": "TOPTAN TİCARET",
    "SARKY": "ANA METAL SANAYİ",
    "SASA": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "SAYAS": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "SDTTR": "SAVUNMA",
    "SEGMN": "GIDA, İÇECEK VE TÜTÜN",
    "SEGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "SEK": "BANKALAR",
    "SEKFK": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "SEKUR": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "SELEC": "TOPTAN TİCARET",
    "SELVA": "GIDA, İÇECEK VE TÜTÜN",
    "SERNT": "TAŞ VE TOPRAĞA DAYALI",
    "SEYKM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "SILVR": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "SISE": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "SKBNK": "BANKALAR",
    "SKTAS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "SKY": "ARACI KURUMLAR",
    "SKYLP": "HUKUK VE MUHASEBE FAALİYETLERİ",
    "SKYMD": "ARACI KURUMLAR",
    "SMART": "BİLİŞİM",
    "SMRTG": "ELEKTRİK GAZ VE SU",
    "SMRVA": "VARLIK YÖNETİM ŞİRKETLERİ",
    "SNGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "SNICA": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "SNPAM": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "SODSN": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "SOKE": "GIDA, İÇECEK VE TÜTÜN",
    "SOKM": "PERAKENDE TİCARET",
    "SONME": "GAYRİMENKUL FAALİYETLERİ",
    "SRVGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "SUMAS": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "SUNTK": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "SURGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "SUWEN": "PERAKENDE TİCARET",
    "SVGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "TABGD": "YİYECEK VE İÇECEK HİZMETLERİ",
    "TARKM": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "TATEN": "ELEKTRİK GAZ VE SU",
    "TATGD": "GIDA, İÇECEK VE TÜTÜN",
    "TAVHL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "TBORG": "GIDA, İÇECEK VE TÜTÜN",
    "TCELL": "TELEKOMÜNİKASYON",
    "TCKRC": "ANA METAL SANAYİ",
    "TDGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "TEHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "TEKTU": "KONAKLAMA",
    "TERA": "ARACI KURUMLAR",
    "TEZOL": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "TGB": "BANKALAR",
    "TGSAS": "TOPTAN TİCARET",
    "THL": "BANKALAR",
    "THYAO": "ULAŞTIRMA VE DEPOLAMA",
    "TIB": "BANKALAR",
    "TKFEN": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "TKNSA": "PERAKENDE TİCARET",
    "TLMAN": "ULAŞTIRMA VE DEPOLAMA",
    "TMPOL": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "TMSN": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "TNZTP": "İNSAN SAĞLIĞI VE SOSYAL HİZMETLER",
    "TOASO": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "TRA": "ARACI KURUMLAR",
    "TRALT": "METAL CEVHERİ MADENCİLİĞİ",
    "TRCAS": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "TRENJ": "HAM PETROL VE DOĞAL GAZ ÇIKARTILMASI",
    "TRGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "TRHOL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "TRILC": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "TRMET": "METAL CEVHERİ MADENCİLİĞİ",
    "TSGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "TSK": "BANKALAR",
    "TSKB": "BANKALAR",
    "TSPOR": "SPOR FAALİYETLERİ EĞLENCE VE OYUN FAALİYETLERİ",
    "TTKOM": "TELEKOMÜNİKASYON",
    "TTRAK": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "TUCLK": "ANA METAL SANAYİ",
    "TUKAS": "GIDA, İÇECEK VE TÜTÜN",
    "TUPRS": "KİMYA İLAÇ PETROL LASTİK VE PLASTİK ÜRÜNLER",
    "TUREX": "ULAŞTIRMA VE DEPOLAMA",
    "TURGG": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "TURSG": "SİGORTA ŞİRKETLERİ",
    "TVB": "BANKALAR",
    "UCAYM": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "UFUK": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "ULAS": "KONAKLAMA",
    "ULKER": "GIDA, İÇECEK VE TÜTÜN",
    "ULUFA": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "ULUSE": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "ULUUN": "GIDA, İÇECEK VE TÜTÜN",
    "UMPAS": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "UNLU": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "USAK": "TAŞ VE TOPRAĞA DAYALI",
    "VAKBN": "BANKALAR",
    "VAKFA": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "VAKFN": "FİNANSAL KİRALAMA VE FAKTORİNG ŞİRKETLERİ",
    "VAKKO": "PERAKENDE TİCARET",
    "VANGD": "GIDA, İÇECEK VE TÜTÜN",
    "VBTYZ": "BİLİŞİM",
    "VERTU": "GİRİŞİM SERMAYESİ YATIRIM ORTAKLIKLARI",
    "VERUS": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "VESBE": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "VESTL": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "VKFYO": "MENKUL KIYMET YATIRIM ORTAKLIKLARI",
    "VKGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "VKING": "KAĞIT VE KAĞIT ÜRÜNLERİ BASIM",
    "VRGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "VSNMD": "DİĞER MADENCİLİK VE TAŞ OCAKÇILIĞI",
    "YAPRK": "TARIM VE HAYVANCILIK AVCILIK VE İLGİLİ HİZMET FAALİYETLERİ",
    "YATAS": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "YAYLA": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "YBTAS": "TAŞ VE TOPRAĞA DAYALI",
    "YEOTK": "MİMARLIK VE MÜHENDİSLİK FAALİYETLERİ; TEKNİK MUAYENE VE ANALİZ",
    "YESIL": "HOLDİNGLER VE YATIRIM ŞİRKETLERİ",
    "YGGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "YIGIT": "METAL EŞYA MAKİNE ELEKTRİKLİ CİHAZLAR VE ULAŞIM ARAÇLARI",
    "YKB": "BANKALAR",
    "YKBNK": "BANKALAR",
    "YKSLN": "ANA METAL SANAYİ",
    "YONGA": "ORMAN ÜRÜNLERİ VE MOBİLYA",
    "YUNSA": "TEKSTİL, GİYİM EŞYASI VE DERİ",
    "YYAPI": "İNŞAAT VE BAYINDIRLIK İŞLERİ",
    "YYLGD": "GIDA, İÇECEK VE TÜTÜN",
    "ZEDUR": "ELEKTRİK GAZ VE SU",
    "ZERGY": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ZGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
    "ZOREN": "ELEKTRİK GAZ VE SU",
    "ZRGYO": "GAYRİMENKUL YATIRIM ORTAKLIKLARI",
}


def get_sector(symbol: str) -> str | None:
    """Sembol için sektör bilgisini döndürür. Bulunamazsa None."""
    normalized = symbol.strip().upper().replace("BIST:", "")
    return BIST_SECTOR_MAP.get(normalized)


def normalize_symbol(value):
    if value is None:
        return ""
    return (
        str(value)
        .replace("\xa0", "")
        .replace("\t", "")
        .replace("\n", "")
        .strip()
        .upper()
    )


def parse_number(value, allow_zero=False, allow_negative=False):
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        parsed = float(value)
        if allow_negative or allow_zero:
            return parsed
        return parsed if parsed > 0 else None

    text = str(value).strip().replace("%", "")

    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")

    try:
        parsed = float(text)
        if allow_negative or allow_zero:
            return parsed
        return parsed if parsed > 0 else None
    except ValueError:
        return None


def parse_datetime(value):
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    text = str(value).strip()

    for fmt in ("%d/%m/%Y %H:%M:%S", "%d.%m.%Y %H:%M:%S"):
        try:
            return datetime.strptime(text.split(".")[0], fmt).isoformat()
        except Exception:
            pass

    return None


# Türkiye kalıcı UTC+3 (DST yok)
TR_TZ = timezone(timedelta(hours=3))


def parse_matriks_trade_time(value):
    """Matriks "Son İşlem Dakikası" kolonunu parse eder.

    Format KESİN: DD/MM/YYYY HH:MM:SS(.fffff) — gün/ay/yıl, TR yerel saati
    (örn. "09/07/2026 15:04:01.00000"). MM/DD ile KARIŞTIRMA.
    Değere UTC+3 timezone'u eklenerek timestamptz uyumlu ISO string döner —
    böylece Supabase'de gerçek UTC karşılığı saklanır (freshness hesapları
    için kritik; last_trade_time'daki naive-saat kayması burada yok).
    """
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        dt = value
    else:
        # Sondaki kesirli saniyeyi at (".00000") — tarih ayracından bağımsız
        text = re.sub(r"\.\d+\s*$", "", str(value).strip())
        dt = None
        for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d.%m.%Y %H:%M:%S"):
            try:
                dt = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        if dt is None:
            return None

    if dt.tzinfo is None:
        # Matriks saati TR yerelidir — UTC sanılmasın
        dt = dt.replace(tzinfo=TR_TZ)

    return dt.isoformat()


def find_workbook(app):
    for book in app.books:
        if book.name == EXCEL_BOOK_NAME:
            return book

    if len(app.books) > 0:
        print("Uyarı: Kitap1.xlsx bulunamadı. İlk açık Excel dosyası kullanılacak:")
        print(app.books[0].name)
        return app.books[0]

    raise RuntimeError("Açık Excel dosyası bulunamadı.")


def supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def upsert_table(table_name, rows, label):
    if not rows:
        print(f"No {label} rows.")
        return

    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    response = requests.post(url, headers=supabase_headers(), json=rows, timeout=15)

    if response.status_code not in (200, 201, 204):
        print(f"{label} Supabase error:", response.status_code, response.text)
    else:
        print(f"Updated {label}: {len(rows)} symbols at {datetime.now().strftime('%H:%M:%S')}")


def update_positions_sector(sector_updates: list[dict]) -> None:
    """
    OPEN pozisyonların sector kolonunu günceller.
    Her sembol için positions tablosunda symbol eşleşen açık kayıtları bulup
    sector alanını doldurur. Zaten dolu olanların üzerine yazar (her zaman
    en güncel harita geçerlidir).
    """
    if not sector_updates:
        return

    # Her sembol için ayrı PATCH — positions primary key uuid, symbol ile PATCH yapıyoruz
    updated = 0
    for item in sector_updates:
        symbol = item["symbol"]
        sector = item["sector"]
        url = f"{SUPABASE_URL}/rest/v1/positions"
        params = f"?symbol=eq.{symbol}&status=eq.OPEN&sector=is.null"
        headers = supabase_headers()
        headers["Prefer"] = "return=minimal"
        response = requests.patch(
            url + params,
            headers=headers,
            json={"sector": sector},
            timeout=10,
        )
        if response.status_code not in (200, 201, 204):
            print(f"sector update failed for {symbol}: {response.status_code} {response.text}")
        else:
            updated += 1

    if updated:
        print(f"Sector updated: {updated} symbols at {datetime.now().strftime('%H:%M:%S')}")


def fill_missing_sectors():
    """
    Startup'ta tüm OPEN pozisyonların eksik sektörlerini doldurur.
    Excel'de olmayan semboller için de BIST_SECTOR_MAP'ten direkt yazar.
    """
    url = f"{SUPABASE_URL}/rest/v1/positions?status=eq.OPEN&sector=is.null&select=symbol"
    response = requests.get(url, headers=supabase_headers(), timeout=10)
    if response.status_code != 200:
        print("fill_missing_sectors fetch failed:", response.status_code, response.text)
        return

    rows = response.json()
    if not rows:
        print("fill_missing_sectors: Tüm açık pozisyonların sektörü dolu.")
        return

    updates = []
    for row in rows:
        symbol = row.get("symbol", "").strip().upper()
        sector = BIST_SECTOR_MAP.get(symbol)
        if sector:
            updates.append({"symbol": symbol, "sector": sector})
        else:
            print(f"fill_missing_sectors: Sektör haritasında bulunamadı → {symbol}")

    update_positions_sector(updates)
    print(f"fill_missing_sectors: {len(updates)} sembol işlendi.")


def read_excel_rows(sheet):
    live_rows = []
    global_rows = []
    sector_updates = []
    seen_global = set()
    now_utc = datetime.now(timezone.utc).isoformat()

    for row_num in range(START_ROW, END_ROW + 1):
        symbol = normalize_symbol(sheet.range(f"B{row_num}").value)
        if not symbol:
            continue

        last_trade_time = parse_datetime(sheet.range(f"I{row_num}").value)
        matriks_trade_time = parse_matriks_trade_time(sheet.range(f"I{row_num}").value)

        if symbol in GLOBAL_CONTEXT_SYMBOLS:
            last_price = parse_number(sheet.range(f"C{row_num}").value)
            change_pct = parse_number(
                sheet.range(f"D{row_num}").value,
                allow_zero=True,
                allow_negative=True,
            )

            if not last_price:
                print(f"Global skipped: {symbol} row {row_num} price empty")
                continue

            global_rows.append({
                "symbol": symbol,
                "name": GLOBAL_CONTEXT_SYMBOLS[symbol],
                "last_price": last_price,
                "change_pct": change_pct if change_pct is not None else 0,
                "source": "MATRIX_DDE",
                "updated_at": now_utc,
            })

            # Endeks/global satırları da J-V indikatör sütunlarını taşıyor
            # (2026-07-16 Excel güncellemesi). Normal sembollerle AYNI sütun
            # haritası ve parse kuralları — artık null yazmıyoruz. Fiyat/değişim
            # yine C/D'den (global satır düzeni), matriks_trade_time I'den.
            g_rsi          = parse_number(sheet.range(f"J{row_num}").value, allow_negative=True, allow_zero=True)
            g_ema100       = parse_number(sheet.range(f"K{row_num}").value)
            g_ema20        = parse_number(sheet.range(f"L{row_num}").value)
            g_ema50        = parse_number(sheet.range(f"M{row_num}").value)
            g_atr          = parse_number(sheet.range(f"N{row_num}").value)
            g_lrs          = parse_number(sheet.range(f"O{row_num}").value, allow_negative=True, allow_zero=True)
            g_macd_div     = parse_number(sheet.range(f"P{row_num}").value, allow_negative=True, allow_zero=True)
            g_macd_trigger = parse_number(sheet.range(f"Q{row_num}").value, allow_negative=True, allow_zero=True)
            g_stoc_rsi     = parse_number(sheet.range(f"R{row_num}").value, allow_negative=True, allow_zero=True)
            g_obv          = parse_number(sheet.range(f"S{row_num}").value, allow_negative=True, allow_zero=True)
            g_aroon_up     = parse_number(sheet.range(f"T{row_num}").value, allow_negative=True, allow_zero=True)
            g_aroon_down   = parse_number(sheet.range(f"U{row_num}").value, allow_negative=True, allow_zero=True)
            g_elder_force  = parse_number(sheet.range(f"V{row_num}").value, allow_negative=True, allow_zero=True)

            # Yeni blok (W–AG): ADX, Stoch Fast K/D + 4H seti. Endeks satırları da
            # bu sütunları taşıyor (2026-07-18). Normal dalla AYNI parse kuralları.
            g_adx             = parse_number(sheet.range(f"W{row_num}").value, allow_zero=True)
            g_stoch_fast_k    = parse_number(sheet.range(f"X{row_num}").value, allow_zero=True)
            g_stoch_fast_d    = parse_number(sheet.range(f"Y{row_num}").value, allow_zero=True)
            g_rsi_4h          = parse_number(sheet.range(f"Z{row_num}").value, allow_negative=True, allow_zero=True)
            g_ema100_4h       = parse_number(sheet.range(f"AA{row_num}").value)
            g_ema20_4h        = parse_number(sheet.range(f"AB{row_num}").value)
            g_ema50_4h        = parse_number(sheet.range(f"AC{row_num}").value)
            g_atr_4h          = parse_number(sheet.range(f"AD{row_num}").value)
            g_adx_4h          = parse_number(sheet.range(f"AE{row_num}").value, allow_zero=True)
            g_stoch_fast_k_4h = parse_number(sheet.range(f"AF{row_num}").value, allow_zero=True)
            g_stoch_fast_d_4h = parse_number(sheet.range(f"AG{row_num}").value, allow_zero=True)

            live_rows.append({
                "symbol": symbol,
                "bid": None,
                "ask": None,
                "volume": None,
                "last_price": last_price,
                "last_trade_time": last_trade_time,
                "matriks_trade_time": matriks_trade_time,
                "source": "MATRIKS_DDE",
                "delay_note": "GLOBAL_BIST_CONTEXT",
                "is_stale": False,
                "updated_at": now_utc,
                "rsi": g_rsi,
                "ema100": g_ema100,
                "ema20": g_ema20,
                "ema50": g_ema50,
                "atr": g_atr,
                "lrs": g_lrs,
                "macd_div": g_macd_div,
                "macd_trigger": g_macd_trigger,
                "stoc_rsi": g_stoc_rsi,
                "obv": g_obv,
                "aroon_up": g_aroon_up,
                "aroon_down": g_aroon_down,
                "elder_force_index": g_elder_force,
                "adx": g_adx,
                "stoch_fast_k": g_stoch_fast_k,
                "stoch_fast_d": g_stoch_fast_d,
                "rsi_4h": g_rsi_4h,
                "ema100_4h": g_ema100_4h,
                "ema20_4h": g_ema20_4h,
                "ema50_4h": g_ema50_4h,
                "atr_4h": g_atr_4h,
                "adx_4h": g_adx_4h,
                "stoch_fast_k_4h": g_stoch_fast_k_4h,
                "stoch_fast_d_4h": g_stoch_fast_d_4h,
            })

            seen_global.add(symbol)
            print(f"GLOBAL ACTIVE row {row_num}: {symbol} price={last_price} change={change_pct} rsi={g_rsi} ema20={g_ema20}")
            continue

        bid = parse_number(sheet.range(f"C{row_num}").value)
        ask = parse_number(sheet.range(f"D{row_num}").value)
        volume = parse_number(sheet.range(f"E{row_num}").value)

        # Teknik indikatörler (J=RSI, K=EMA100, L=EMA20, M=EMA50, N=ATR,
        # O=LRS, P=MACDIV, Q=MACDTRIGGER, R=STOCRSI, S=OBV,
        # T=AROONUP, U=AROONDOWN, V=ELDERFORCEINDEX)
        rsi            = parse_number(sheet.range(f"J{row_num}").value, allow_negative=True, allow_zero=True)
        ema100         = parse_number(sheet.range(f"K{row_num}").value)
        ema20          = parse_number(sheet.range(f"L{row_num}").value)
        ema50          = parse_number(sheet.range(f"M{row_num}").value)
        atr            = parse_number(sheet.range(f"N{row_num}").value)
        lrs            = parse_number(sheet.range(f"O{row_num}").value, allow_negative=True, allow_zero=True)
        macd_div       = parse_number(sheet.range(f"P{row_num}").value, allow_negative=True, allow_zero=True)
        macd_trigger   = parse_number(sheet.range(f"Q{row_num}").value, allow_negative=True, allow_zero=True)
        stoc_rsi       = parse_number(sheet.range(f"R{row_num}").value, allow_negative=True, allow_zero=True)
        obv            = parse_number(sheet.range(f"S{row_num}").value, allow_negative=True, allow_zero=True)
        aroon_up       = parse_number(sheet.range(f"T{row_num}").value, allow_negative=True, allow_zero=True)
        aroon_down     = parse_number(sheet.range(f"U{row_num}").value, allow_negative=True, allow_zero=True)
        elder_force    = parse_number(sheet.range(f"V{row_num}").value, allow_negative=True, allow_zero=True)

        # Yeni blok (W–AG): ADX, Stoch Fast K/D + 4H seti (RSI/EMA/ATR/ADX/Stoch).
        # ADX & Stoch 0–100, negatif olmaz ama 0 gerçek değer → allow_zero.
        # 4H EMA/ATR: 1H kardeşleri gibi plain (>0). rsi_4h: 1H rsi gibi.
        adx             = parse_number(sheet.range(f"W{row_num}").value, allow_zero=True)
        stoch_fast_k    = parse_number(sheet.range(f"X{row_num}").value, allow_zero=True)
        stoch_fast_d    = parse_number(sheet.range(f"Y{row_num}").value, allow_zero=True)
        rsi_4h          = parse_number(sheet.range(f"Z{row_num}").value, allow_negative=True, allow_zero=True)
        ema100_4h       = parse_number(sheet.range(f"AA{row_num}").value)
        ema20_4h        = parse_number(sheet.range(f"AB{row_num}").value)
        ema50_4h        = parse_number(sheet.range(f"AC{row_num}").value)
        atr_4h          = parse_number(sheet.range(f"AD{row_num}").value)
        adx_4h          = parse_number(sheet.range(f"AE{row_num}").value, allow_zero=True)
        stoch_fast_k_4h = parse_number(sheet.range(f"AF{row_num}").value, allow_zero=True)
        stoch_fast_d_4h = parse_number(sheet.range(f"AG{row_num}").value, allow_zero=True)

        # Pozisyon tablosundaki sector kolonunu güncelle (sembol biliniyorsa)
        sector = get_sector(symbol)
        if sector:
            sector_updates.append({
                "symbol": symbol,
                "sector": sector,
            })

        last_price = parse_number(sheet.range(f"F{row_num}").value)
        if not last_price:
            continue

        live_rows.append({
            "symbol": symbol,
            "bid": bid,
            "ask": ask,
            "volume": volume,
            "last_price": last_price,
            "last_trade_time": last_trade_time,
            "matriks_trade_time": matriks_trade_time,
            "source": "MATRIKS_DDE",
            "delay_note": "DEMO_15_MIN_DELAYED",
            "is_stale": False,
            "updated_at": now_utc,
            # Teknik indikatörler
            "rsi": rsi,
            "ema100": ema100,
            "ema20": ema20,
            "ema50": ema50,
            "atr": atr,
            "lrs": lrs,
            "macd_div": macd_div,
            "macd_trigger": macd_trigger,
            "stoc_rsi": stoc_rsi,
            "obv": obv,
            "aroon_up": aroon_up,
            "aroon_down": aroon_down,
            "elder_force_index": elder_force,
            "adx": adx,
            "stoch_fast_k": stoch_fast_k,
            "stoch_fast_d": stoch_fast_d,
            "rsi_4h": rsi_4h,
            "ema100_4h": ema100_4h,
            "ema20_4h": ema20_4h,
            "ema50_4h": ema50_4h,
            "atr_4h": atr_4h,
            "adx_4h": adx_4h,
            "stoch_fast_k_4h": stoch_fast_k_4h,
            "stoch_fast_d_4h": stoch_fast_d_4h,
        })

    missing = [symbol for symbol in GLOBAL_CONTEXT_SYMBOLS if symbol not in seen_global]
    if missing:
        print("Missing global/BIST symbols:", ", ".join(missing))

    return live_rows, global_rows, sector_updates


def main():
    if not SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY == "BURAYA_SUPABASE_SERVICE_ROLE_KEY":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY eksik. Ortam değişkeni olarak girin veya dosyada doldurun.")

    print("Matriks Excel → Supabase live price + global/BIST context agent started.")

    app = xw.apps.active
    book = find_workbook(app)
    sheet = book.sheets[SHEET_NAME]

    fill_missing_sectors()

    while True:
        live_rows, global_rows, sector_updates = read_excel_rows(sheet)
        upsert_table("live_prices", live_rows, "live_prices")
        upsert_table("global_context_prices", global_rows, "global_context_prices")
        update_positions_sector(sector_updates)
        time.sleep(SYNC_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
