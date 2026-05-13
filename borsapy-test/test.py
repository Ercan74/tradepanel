import borsapy as bp
import time

SESSION_ID = "jvy2kwe3yapbap0njry5sv56d6wab6fm"

tv = bp.TradingView(
    sessionid=SESSION_ID
)

symbol = "THYAO"

print(f"{symbol} realtime test başlıyor...\n")

while True:
    try:
        quote = tv.quote(symbol, exchange="BIST")

        print(
            "Fiyat:", quote.get("last"),
            "| Değişim:", quote.get("change_percent"),
            "| Hacim:", quote.get("volume")
        )

        time.sleep(2)

    except Exception as e:
        print("HATA:", e)
        time.sleep(5)