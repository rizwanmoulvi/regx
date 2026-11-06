import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/header"
import { Providers } from "./providers"

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans" })
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" })

export const metadata: Metadata = {
  title: "RegX: tokenized invoice financing on Whitechain",
  description:
    "Invoice-backed ERC-3643 notes on Whitechain: USDT subscription, coupons, redemption and DvP trading through a public order book on Arkiv.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted">
            Testnet demo · ERC-3643 (T-REX) notes on Whitechain Sepolia, settled in Whitechain test USDT · Order book, trades and
            corporate actions on Arkiv · test tokens have no value
          </footer>
        </Providers>
      </body>
    </html>
  )
}
