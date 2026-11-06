/**
 * Subset of the Hedera Asset Tokenization Studio (ATS) ABI used by RegX.
 * Source: github.com/hashgraph/asset-tokenization-studio, packages/ats/contracts (Nov 2026).
 * ATS securities are EIP-2535 diamonds; every facet function is called on the token address.
 */
import { parseAbi } from "viem"

const structs = [
  "struct Rbac { bytes32 role; address[] members; }",
  "struct ResolverProxyConfigurationV2 { bytes32 configurationId; uint256 configurationVersion; bool replacementEnabled; }",
  "struct ERC20Metadata { string name; string symbol; uint8 decimals; }",
  "struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfigurationV2 resolverProxyConfigurationV2; ERC20Metadata erc20Metadata; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }",
  "struct BondDetailsData { bytes3 currency; uint256 nominalValue; uint256 nominalValueDecimals; uint256 startingDate; uint256 maturityDate; uint256 effectiveDatetime; bool isUnitNominalValue; }",
  "struct BondData { SecurityData security; BondDetailsData bondDetails; address[] proceedRecipients; bytes[] proceedRecipientsData; }",
  "struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }",
  "struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }",
  "struct Coupon { uint256 recordDate; uint256 executionDate; uint256 startDate; uint256 endDate; uint256 fixingDate; uint256 rate; uint8 rateDecimals; uint8 rateStatus; }",
  "struct RegisteredCoupon { Coupon coupon; uint256 snapshotId; }",
  "struct CouponAmountFor { uint256 numerator; uint256 denominator; bool recordDateReached; }",
  "struct CouponFor { uint256 tokenBalance; uint8 decimals; uint256 nominalValue; uint256 nominalValueDecimals; bool recordDateReached; Coupon coupon; CouponAmountFor couponAmount; bool isDisabled; }",
] as const

export const atsFactoryAbi = parseAbi([
  ...structs,
  "function deployBond(BondData _bondData, FactoryRegulationData _factoryRegulationData) returns (address bondAddress_)",
  "event BondDeployed(address indexed deployer, address bondAddress, BondData bondData, FactoryRegulationData regulationData)",
])

export const atsResolverAbi = parseAbi([
  "function getLatestVersionByConfiguration(bytes32 _configurationId) view returns (uint256 latestVersion_)",
])

export const atsSecurityAbi = parseAbi([
  ...structs,
  // ERC-20 surface
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  // Issuance (ERC-3643 mint / ERC-1594 issue)
  "function mint(address _to, uint256 _amount)",
  "function getMaxSupply() view returns (uint256)",
  // ERC-3643 identity & compliance
  "function identityRegistry() view returns (address)",
  "function compliance() view returns (address)",
  "function canTransfer(address _to, uint256 _value, bytes _data) view returns (bool, bytes1, bytes32)",
  "function canTransferFrom(address _from, address _to, uint256 _value, bytes _data) view returns (bool, bytes1, bytes32)",
  // Freeze & pause
  "function setAddressFrozen(address _userAddress, bool _freezeStatus)",
  "function isFrozen(address _userAddress) view returns (bool)",
  "function pause() returns (bool)",
  "function unpause() returns (bool)",
  "function paused() view returns (bool)",
  // Bond terms
  "function getMaturityDate() view returns (uint256)",
  "function getNominalValue() view returns (uint256)",
  "function getNominalValueDecimals() view returns (uint256)",
  // Coupons
  "function setCoupon(Coupon _newCoupon) returns (uint256 couponID_)",
  "function getCoupon(uint256 _couponID) view returns (RegisteredCoupon registeredCoupon_, bool isDisabled_)",
  "function getCouponFor(uint256 _couponID, address _account) view returns (CouponFor couponFor_)",
  "function getCouponAmountFor(uint256 _couponID, address _account) view returns (CouponAmountFor couponAmountFor_)",
  "function getCouponCount() view returns (uint256)",
  // Holders & roles
  "function getSecurityHolders(uint256 _pageIndex, uint256 _pageLength) view returns (address[] holders_)",
  "function getTotalSecurityHolders() view returns (uint256)",
  "function hasRole(bytes32 _role, address _account) view returns (bool)",
  "function grantRole(bytes32 _role, address _account) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AddressFrozen(address indexed userAddress, bool indexed isFrozen, address indexed owner)",
  "event Paused(address indexed operator)",
  "event Unpaused(address indexed operator)",
  "event CouponSet(bytes32 indexed corporateActionId, uint256 indexed couponId, address indexed operator, Coupon coupon)",
  // Errors surfaced by transfers (for decoding reverts and canTransfer reason codes)
  "error AddressNotVerified(address account)",
  "error ComplianceNotAllowed(address from, address to, uint256 value)",
  "error InvalidKycStatus(address account)",
  "error AccountIsBlocked(address account)",
  "error ComplianceCallFailed()",
  "error IdentityRegistryCallFailed()",
  "error IsPaused()",
  "error WalletRecovered()",
  "error InsufficientAllowance(address spender, address from)",
])

/** ATS role identifiers (packages/ats/contracts/contracts/constants/roles.sol). */
export const ATS_ROLES = {
  DEFAULT_ADMIN: "0x0000000000000000000000000000000000000000000000000000000000000000",
  AGENT: "0x9830aa071a741c08855dd42130bdb0ff50f7bdf5a4b72f12181eefded0c6542b",
  ISSUER: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  CONTROLLER: "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e",
  CORPORATE_ACTION: "0xa1acfc499025c99f55059195e6276f639d34a18aad7b8121b9192b7f438c55cd",
  FREEZE_MANAGER: "0x71ae38482e1ab1c28e767d64766d686215b490c8c1bd7dfe6b101525187c2155",
  PAUSER: "0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f",
  SNAPSHOT: "0xf7d999723d2160432933a2aeffaae83e262a5a46fe94f34614a7676d1d1f67c6",
  TREX_OWNER: "0xd9e1264632ee9a37e8673a0c55a0a1d8b38c758e843084168ee08cd2d1f7e6f0",
  MATURITY_REDEEMER: "0x433f48f8aca23480f6ab07666cbc9131d32a0b4672033453f65e18f4dd390523",
  DOCUMENTER: "0xb7b1452b94e2932605f7ad2a3ceba0bafd68db64704c9bd667f27163c57ca319",
  CONTROL_LIST: "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",
} as const

/** ATS business configuration ids on the shared Hedera testnet BusinessLogicResolver. */
export const ATS_CONFIG_IDS = {
  equity: "0x0000000000000000000000000000000000000000000000000000000000000001",
  bond: "0x0000000000000000000000000000000000000000000000000000000000000002",
} as const
