import { type Hex, hexToString } from "viem"

/** Human messages for RegXDvP.checkFill reason codes and ATS / ERC-3643 transfer reason selectors. */
const SELECTORS: Record<string, string> = {
  // ATS v8 (deployed on Hedera testnet)
  "0x209d2853": "Not a verified investor: no valid KYC claim in the ERC-3643 Identity Registry",
  "0x66eb1b54": "Blocked by ERC-3643 compliance (e.g. per-investor holding cap)",
  "0xfc855b1b": "KYC not granted on this security",
  "0x5d6824c4": "Insufficient security balance",
  // ATS v9 signatures
  "0xac12c8b3": "Not a verified investor: no valid KYC claim in the ERC-3643 Identity Registry",
  "0xf2801862": "Blocked by ERC-3643 compliance (e.g. per-investor holding cap)",
  "0x155a732e": "KYC not granted on this security",
  "0x796c1f0d": "Account is frozen or blocked by the issuer",
  "0x1309a563": "Trading is paused by the issuer",
  "0xf9f9bcf9": "Wallet was recovered to a new address",
  "0xf180d8f9": "Seller has not approved the DvP contract",
  "0x67fba102": "Compliance contract call failed",
  "0xad87849e": "Identity registry call failed",
  "0x5b2e3086": "Clearing is active on this security",
}

const DVP_CODES: Record<string, string> = {
  OK: "Ready to settle",
  EXPIRED: "Order expired",
  CANCELLED: "Order cancelled by maker",
  OVERFILL: "Amount exceeds what is left on the order",
  SELF_FILL: "You cannot fill your own order",
  PAY_BALANCE: "Not enough USDT",
  PAY_ALLOWANCE: "Approve USDT for the DvP contract first",
  SECURITY_BLOCKED: "Security transfer not allowed",
  // T-REX (ERC-3643) checks
  PAUSED: "Trading is paused by the issuer",
  FROZEN: "A wallet in this trade is frozen by the issuer",
  SELLER_BALANCE: "Seller no longer holds enough units",
  SELLER_ALLOWANCE: "Seller has not approved the DvP contract",
  NOT_VERIFIED: "Not a verified investor: no valid KYC claim in the ERC-3643 Identity Registry",
  COMPLIANCE: "Blocked by ERC-3643 compliance (holding cap, or the note has matured)",
}

/** Revert strings raised by T-REX Token / RegXNote. */
const REVERTS: [string, string][] = [
  ["Transfer not possible", "Rejected by ERC-3643: the buyer is not verified or compliance blocks the transfer"],
  ["Identity is not verified.", "Not a verified investor: no valid KYC claim in the ERC-3643 Identity Registry"],
  ["Compliance not followed", "Blocked by ERC-3643 compliance (holding cap or subscription window)"],
  ["wallet is frozen", "A wallet in this trade is frozen by the issuer"],
  ["Pausable: paused", "Trading is paused by the issuer"],
  ["SubscriptionClosed", "The subscription window has closed"],
  ["NotDue", "Not due yet"],
  ["AlreadyPaid", "Already settled"],
  ["insufficient allowance", "USDT allowance too low: approve first (or the issuer has not funded this payment)"],
  ["transfer amount exceeds balance", "Not enough USDT"],
]

export function explainReason(code: Hex): { code: string; message: string } {
  const selector = code.slice(0, 10).toLowerCase()
  if (SELECTORS[selector]) return { code: selector, message: SELECTORS[selector] }
  let ascii = ""
  try {
    ascii = hexToString(code, { size: 32 }).replace(/\0/g, "")
  } catch {}
  if (DVP_CODES[ascii]) return { code: ascii, message: DVP_CODES[ascii] }
  return { code, message: "Transfer not allowed by the security" }
}

/** Extracts a known reason from a viem error (revert data or message). */
export function explainError(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; cause?: any }
  let text = e?.message ?? ""
  try {
    text += JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}))
  } catch {}
  for (const [sel, msg] of Object.entries(SELECTORS)) if (text.includes(sel.slice(2))) return msg
  for (const [needle, msg] of REVERTS) if (text.includes(needle)) return msg
  const name = e?.cause?.data?.errorName ?? e?.cause?.cause?.data?.errorName
  if (name) return `Reverted: ${name}`
  return e?.shortMessage ?? e?.message ?? String(err)
}
