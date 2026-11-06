// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Subset of the ATS (ERC-1400 / ERC-3643) security interface used for pre-trade checks.
interface ISecurityTransferCheck {
    function canTransferFrom(address from, address to, uint256 value, bytes calldata data)
        external
        view
        returns (bool, bytes1, bytes32);
}

/// @notice Subset of the ERC-3643 (T-REX) token interface used for pre-trade checks.
interface ITrexTransferCheck {
    function paused() external view returns (bool);
    function isFrozen(address) external view returns (bool);
    function getFrozenTokens(address) external view returns (uint256);
    function identityRegistry() external view returns (address);
    function compliance() external view returns (address);
}

interface ITrexRegistry {
    function isVerified(address) external view returns (bool);
}

interface ITrexCompliance {
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
}

/// @title RegXDvP: atomic delivery-versus-payment for signed off-chain orders.
/// @notice Orders are EIP-712 messages that makers publish on Arkiv. A taker fills one here:
///         the cash leg (payToken) and the security leg (an ATS ERC-3643 security token) move in a
///         single transaction. The security leg goes through the token's own identity and compliance
///         checks, so an ineligible counterparty makes the whole fill revert.
contract RegXDvP is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Order {
        address maker;
        address security;
        address payToken;
        bool isSell; // true: maker sells `security`, taker pays
        uint256 price; // payToken base units per 1 whole security unit
        uint256 amount; // security base units
        uint256 nonce;
        uint64 expiry; // unix seconds
    }

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address security,address payToken,bool isSell,uint256 price,uint256 amount,uint256 nonce,uint64 expiry)"
    );

    /// Reason codes returned by `checkFill` (ASCII, right-padded).
    bytes32 public constant OK = "OK";
    bytes32 public constant EXPIRED = "EXPIRED";
    bytes32 public constant CANCELLED = "CANCELLED";
    bytes32 public constant OVERFILL = "OVERFILL";
    bytes32 public constant SELF_FILL = "SELF_FILL";
    bytes32 public constant PAY_BALANCE = "PAY_BALANCE";
    bytes32 public constant PAY_ALLOWANCE = "PAY_ALLOWANCE";
    bytes32 public constant SECURITY_BLOCKED = "SECURITY_BLOCKED";
    bytes32 public constant PAUSED = "PAUSED";
    bytes32 public constant FROZEN = "FROZEN";
    bytes32 public constant SELLER_BALANCE = "SELLER_BALANCE";
    bytes32 public constant SELLER_ALLOWANCE = "SELLER_ALLOWANCE";
    bytes32 public constant NOT_VERIFIED = "NOT_VERIFIED";
    bytes32 public constant COMPLIANCE = "COMPLIANCE";

    mapping(bytes32 => uint256) public filled;
    mapping(address => mapping(uint256 => bool)) public cancelled;

    event Filled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address security,
        bool isSell,
        uint256 price,
        uint256 amount,
        uint256 cost
    );
    event Cancelled(address indexed maker, uint256 indexed nonce);

    error OrderExpired();
    error OrderCancelled();
    error InvalidSignature();
    error Overfill(uint256 remaining);
    error SelfFill();
    error ZeroAmount();
    error SecurityTransferFailed();

    constructor() EIP712("RegX", "1") {}

    function hashOrder(Order calldata o) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH, o.maker, o.security, o.payToken, o.isSell, o.price, o.amount, o.nonce, o.expiry
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function remaining(Order calldata o) external view returns (uint256) {
        bytes32 h = hashOrder(o);
        if (cancelled[o.maker][o.nonce] || block.timestamp > o.expiry) return 0;
        return o.amount - filled[h];
    }

    function quote(Order calldata o, uint256 fillAmount) public view returns (uint256) {
        uint8 dec = IERC20Metadata(o.security).decimals();
        return Math.mulDiv(o.price, fillAmount, 10 ** dec, Math.Rounding.Up);
    }

    /// @notice Fill `fillAmount` security units of a signed order.
    function fill(Order calldata o, bytes calldata signature, uint256 fillAmount) external nonReentrant {
        if (fillAmount == 0) revert ZeroAmount();
        if (block.timestamp > o.expiry) revert OrderExpired();
        if (cancelled[o.maker][o.nonce]) revert OrderCancelled();
        if (msg.sender == o.maker) revert SelfFill();

        bytes32 h = hashOrder(o);
        if (!SignatureChecker.isValidSignatureNow(o.maker, h, signature)) revert InvalidSignature();

        uint256 left = o.amount - filled[h];
        if (fillAmount > left) revert Overfill(left);
        filled[h] += fillAmount;

        (address seller, address buyer) = o.isSell ? (o.maker, msg.sender) : (msg.sender, o.maker);
        uint256 cost = quote(o, fillAmount);

        IERC20(o.payToken).safeTransferFrom(buyer, seller, cost);
        // Security leg: the ATS token enforces KYC, ERC-3643 identity, compliance modules,
        // freezes, pauses and control lists. Any failure bubbles up and reverts the fill.
        if (!IERC20(o.security).transferFrom(seller, buyer, fillAmount)) revert SecurityTransferFailed();

        emit Filled(h, o.maker, msg.sender, o.security, o.isSell, o.price, fillAmount, cost);
    }

    function cancel(uint256 nonce) external {
        cancelled[msg.sender][nonce] = true;
        emit Cancelled(msg.sender, nonce);
    }

    /// @notice Pre-trade check for UIs: would `taker` filling `fillAmount` succeed right now?
    /// @dev Signature is not checked here (the UI verifies it off-chain against the Arkiv entity).
    /// @return ok True if every check passes.
    /// @return reason One of the reason constants, or the ATS reason code when the security blocks it.
    function checkFill(Order calldata o, address taker, uint256 fillAmount)
        external
        view
        returns (bool ok, bytes32 reason)
    {
        if (block.timestamp > o.expiry) return (false, EXPIRED);
        if (cancelled[o.maker][o.nonce]) return (false, CANCELLED);
        if (taker == o.maker) return (false, SELF_FILL);
        bytes32 h = hashOrder(o);
        if (fillAmount == 0 || fillAmount > o.amount - filled[h]) return (false, OVERFILL);

        (address seller, address buyer) = o.isSell ? (o.maker, taker) : (taker, o.maker);
        uint256 cost = quote(o, fillAmount);
        if (IERC20(o.payToken).balanceOf(buyer) < cost) return (false, PAY_BALANCE);
        if (IERC20(o.payToken).allowance(buyer, address(this)) < cost) return (false, PAY_ALLOWANCE);

        // Hedera ATS (ERC-1400 + ERC-3643) exposes canTransferFrom; plain T-REX tokens don't.
        try ISecurityTransferCheck(o.security).canTransferFrom(seller, buyer, fillAmount, "") returns (
            bool can, bytes1, bytes32 code
        ) {
            if (!can) return (false, code == bytes32(0) ? SECURITY_BLOCKED : code);
            return (true, OK);
        } catch {}
        return _checkTrex(o.security, seller, buyer, fillAmount);
    }

    /// @dev Mirrors T-REX Token.transferFrom: pause, freezes, free balance, allowance, Identity Registry, compliance.
    function _checkTrex(address security, address seller, address buyer, uint256 amount)
        internal
        view
        returns (bool, bytes32)
    {
        ITrexTransferCheck t = ITrexTransferCheck(security);
        try t.paused() returns (bool p) {
            if (p) return (false, PAUSED);
        } catch {
            return (false, SECURITY_BLOCKED);
        }
        if (t.isFrozen(seller) || t.isFrozen(buyer)) return (false, FROZEN);
        if (IERC20(security).balanceOf(seller) - t.getFrozenTokens(seller) < amount) return (false, SELLER_BALANCE);
        if (IERC20(security).allowance(seller, address(this)) < amount) return (false, SELLER_ALLOWANCE);
        if (!ITrexRegistry(t.identityRegistry()).isVerified(buyer)) return (false, NOT_VERIFIED);
        if (!ITrexCompliance(t.compliance()).canTransfer(seller, buyer, amount)) return (false, COMPLIANCE);
        return (true, OK);
    }
}
