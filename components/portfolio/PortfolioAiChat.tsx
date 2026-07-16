"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MONITOR_SECRET = "ema100_secret_2026";
const STORAGE_KEY = "pf-chat-history";
const MAX_STORED_MESSAGES = 50;

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function PortfolioAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // localStorage'dan geri yükleme bitmeden persist etme — aksi halde
  // mount'taki boş state kayıtlı geçmişin üzerine yazar
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Mount: geçmişi localStorage'dan geri yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setMessages(arr.slice(-MAX_STORED_MESSAGES));
      }
    } catch {
      // bozuk kayıt: boş başla
    } finally {
      setHydrated(true);
    }
  }, []);

  // Mesajlar değiştikçe kalıcılaştır (son 50 mesaj)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      // storage dolu/kapalı: sessiz geç
    }
  }, [messages, hydrated]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio-ai-agent?secret=${MONITOR_SECRET}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationHistory: history }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Cevap alınamadı");
      setMessages((m) => [...m, { role: "assistant", content: json.reply }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages]);

  return (
    <div className="flex h-[380px] flex-col rounded-2xl border border-zinc-800 bg-[#070b12] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">
          AI Portföy Asistanı
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-[10px] text-zinc-600 transition hover:text-red-300"
          >
            geçmişi temizle
          </button>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && !sending && (
          <div className="flex h-full items-center justify-center text-center text-xs text-zinc-600">
            Portföyünle ilgili soru sor.
            <br />
            Örn: &quot;ATATP pozisyonum hakkında ne düşünüyorsun?&quot;
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                m.role === "user"
                  ? "border border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                  : "border border-zinc-800 bg-[#0a0f18] text-zinc-300"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-800 bg-[#0a0f18] px-3 py-2 text-[12px] text-zinc-500">
              Yazıyor...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[11px] text-red-300">
            Hata: {error}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Portföyün hakkında soru sor..."
          className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-[#0a0f18] px-4 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-400/30 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}
