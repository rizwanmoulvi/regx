import type { Address, Hex } from "viem"
import raw from "../deployments/hedera-testnet.json"

export type Deployment = {
  network: "hedera-testnet"
  chainId: 296
  deployer: Address
  keeper: Address
  ats: { factory: Address; resolver: Address; bondConfigVersion: string }
  tinr: Address
  dvp: Address
  investorCapModule: Address
  trex: {
    claimTopicsRegistry: Address
    claimIssuer: Address
    trustedIssuersRegistry: Address
    identityRegistryStorage: Address
    identityRegistry: Address
    modularCompliance: Address
  }
  bond: { address: Address; hederaId?: string; name: string; symbol: string; deployTx: Hex; maturity: string; start?: string }
  identities: Record<string, Address>
  investors: Record<string, Address>
  arkiv?: { assetEntityKey?: Hex }
  txs: Record<string, Hex>
}

/** Current Hedera testnet deployment (written by scripts/deploy.ts). Fields are absent until deployed. */
export const deployment = raw as unknown as Partial<Deployment>

export const isDeployed = () => Boolean(deployment.bond?.address && deployment.dvp)
