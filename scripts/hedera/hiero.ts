/**
 * Native Hedera services through the Hiero SDK: Scheduled Transactions (HIP-423 long-term schedules).
 * Coupons are paid by schedules created when the coupon is set. The network itself executes each payout
 * at the coupon's execution date, with no keeper and no cron.
 */
import {
  AccountId,
  Client,
  ContractExecuteTransaction,
  ContractId,
  PrivateKey,
  ScheduleCreateTransaction,
  Timestamp,
} from "@hiero-ledger/sdk"
import type { Address, Hex } from "viem"
import { HEDERA_MIRROR } from "../../shared/src/chains"
import { account, key } from "../lib/env"

export async function accountIdOf(evm: Address): Promise<string> {
  const r = await fetch(`${HEDERA_MIRROR}/accounts/${evm}`)
  if (!r.ok) throw new Error(`no Hedera account for ${evm}`)
  return ((await r.json()) as { account: string }).account
}

export async function contractIdOf(evm: Address): Promise<string> {
  const r = await fetch(`${HEDERA_MIRROR}/contracts/${evm}`)
  if (!r.ok) throw new Error(`no Hedera contract for ${evm}`)
  return ((await r.json()) as { contract_id: string }).contract_id
}

let _client: Client | undefined
export async function operatorClient() {
  if (_client) return _client
  const id = await accountIdOf(account("deployer").address)
  _client = Client.forTestnet().setOperator(AccountId.fromString(id), PrivateKey.fromStringECDSA(key("deployer").slice(2)))
  return _client
}

export type ScheduledCall = { scheduleId: string; txId: string; executeAt: Date; waitForExpiry: boolean }

/**
 * Schedules `calldata` against an EVM contract to execute at `executeAt`.
 * Falls back to an immediately executing schedule if long-term schedules are unavailable.
 */
export async function scheduleContractCall(p: {
  contract: Address
  calldata: Hex
  gas: number
  executeAt: Date
  memo: string
}): Promise<ScheduledCall> {
  const client = await operatorClient()
  const inner = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(await contractIdOf(p.contract)))
    .setGas(p.gas)
    .setFunctionParameters(Buffer.from(p.calldata.slice(2), "hex"))

  const make = (wait: boolean) => {
    const tx = new ScheduleCreateTransaction().setScheduledTransaction(inner).setScheduleMemo(p.memo.slice(0, 100))
    return wait ? tx.setExpirationTime(Timestamp.fromDate(p.executeAt)).setWaitForExpiry(true) : tx
  }
  try {
    const resp = await make(true).execute(client)
    const receipt = await resp.getReceipt(client)
    return { scheduleId: receipt.scheduleId!.toString(), txId: resp.transactionId.toString(), executeAt: p.executeAt, waitForExpiry: true }
  } catch (e: any) {
    console.log(`  (long-term schedule unavailable: ${e.status?.toString() ?? e.message}; scheduling for immediate execution)`)
    const resp = await make(false).execute(client)
    const receipt = await resp.getReceipt(client)
    return { scheduleId: receipt.scheduleId!.toString(), txId: resp.transactionId.toString(), executeAt: new Date(), waitForExpiry: false }
  }
}

export async function scheduleStatus(scheduleId: string): Promise<{ executed: boolean; executedAt?: string; deleted: boolean }> {
  const r = await fetch(`${HEDERA_MIRROR}/schedules/${scheduleId}`)
  const j = (await r.json()) as { executed_timestamp?: string | null; deleted?: boolean }
  return { executed: Boolean(j.executed_timestamp), executedAt: j.executed_timestamp ?? undefined, deleted: Boolean(j.deleted) }
}

export const hashscanSchedule = (id: string) => `https://hashscan.io/testnet/schedule/${id}`
