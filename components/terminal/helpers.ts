export function pnlColor(value: number) {
  return value >= 0
    ? "text-emerald-400"
    : "text-rose-400"
}

export function shortTime(date: string) {
  return date.slice(0, 16)
}