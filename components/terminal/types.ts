export type Trade = {
  symbol: string
  side: "LONG" | "SHORT"
  strategy: string
  pnl: number
  confidence: number
  entry: number
  time: string
}