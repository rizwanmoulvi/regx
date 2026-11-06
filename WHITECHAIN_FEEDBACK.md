# Whitechain feedback

Honest notes from building RegX (ERC-3643 invoice notes, USDT settlement) on Whitechain Sepolia at ETHGlobal Mumbai.

## What worked
- **The network reference page is excellent.** Chain id, RPCs, EVM version (Prague via OP Stack Isthmus), gas limits, base fee floor, rate limits and predeploys are all in one place. Multicall3 at the canonical address meant viem batching worked with zero config.
- **Blockscout explorer + Foundry verification.** `forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` just worked. The Etherscan-style `/api` and REST `/api/v2` are handy for scripts (we read token decimals from `/api/v2/tokens/...`).
- **Cheap, fast blocks** (1 s, 5 gwei floor) made a resumable deploy of ~25 transactions painless.
- **Test USDT ships with EIP-2612 permit and EIP-3009.** That's a good base for gasless subscription flows (on our roadmap).

## Where we got stuck
- **Getting test USDT.** The prize requires settling in the official test USDT `0xcedf…f55a7`, but the faucet only dispenses WBT and no docs page says how to get USDT. We had to ask around. A USDT drip on the faucet, or a documented route (swap on YetiTrade testnet, request in Discord), would save every team the same hunt.
- **Faucet limits vs. multi-party demos.** 0.5 WBT per 24 h per GitHub account is plenty for one wallet. RWA demos need 4–5 parties (issuer, investors, an unverified user), so we funded them from the deployer. A note in the docs that this is the expected pattern would help.
- **Solidity version guidance.** The docs recommend solc 0.8.30 + `evm_version = "prague"`. We depend on T-REX (pinned to 0.8.17), which can't target prague/shanghai. A line saying older compilers work fine with `paris`/`london` targets would reassure teams using audited libraries pinned to older solc.

## What the docs were missing
- How to get **test USDT** (see above), including its decimals (6) and the permit / EIP-3009 support we found by reading the ABI on the explorer.
- An **RWA / compliance-token example** (ERC-3643 or similar) showing transfer restrictions with Whitechain USDT. Even a minimal allowlisted-token + USDT DvP sample would be a strong starting point for the Tokenize track.
- A note on **`eth_getLogs` range limits** (if any) for indexers and keepers.
