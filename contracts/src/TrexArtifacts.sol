// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Pulls the T-REX (ERC-3643) and ONCHAINID contracts into the build so their artifacts are
// available to the deployment scripts. Nothing here is deployed directly.
import "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";
import "@tokenysolutions/t-rex/contracts/token/Token.sol";
import "@onchain-id/solidity/contracts/Identity.sol";
import "@onchain-id/solidity/contracts/ClaimIssuer.sol";
