// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {AbstractModule} from "@tokenysolutions/t-rex/contracts/compliance/modular/modules/AbstractModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface ITrexToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/// @title RegXNote: lifecycle and compliance for a tokenized invoice-backed note (ERC-3643 / T-REX)
/// @notice One contract plays two roles:
///   1. **T-REX compliance module.** It is plugged into the token's ModularCompliance and enforces the note's rules on
///      every transfer: units can only be issued during the subscription window, and nothing moves after
///      maturity except redemption burns. Its hooks also track the holder set.
///   2. **Lifecycle manager.** It is a token agent: investors subscribe by paying USDT (at a discount to face),
///      coupons are paid in USDT pro-rata to holders on each coupon date, and at maturity every holder receives face
///      value in USDT and their units are burned. Coupon and maturity settlement are permissionless, so anyone
///      (a keeper, an investor) can trigger them once the date passes. Funds come straight from the issuer's USDT
///      allowance, so a missed payment is visible on-chain as a revert (default), not hidden in a bank ledger.
contract RegXNote is AbstractModule, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Terms {
        address usdt; // payment token (Whitechain test USDT)
        address issuer; // receives subscriptions, funds coupons and redemption
        uint256 faceValue; // USDT base units paid per note unit at maturity
        uint256 issuePrice; // USDT base units per unit at subscription (discount = financing cost)
        uint256 couponPerUnit; // USDT base units per unit paid on each coupon date
        uint64 subscriptionEnd; // primary issuance closes
        uint64 maturity; // invoice due date: redemption opens, transfers stop
    }

    ITrexToken public token;
    address public compliance;
    Terms public terms;
    uint64[] public couponDates;
    mapping(uint256 => bool) public couponPaid;
    bool public matured; // true once every holder has been redeemed

    EnumerableSet.AddressSet private _holders;

    event Subscribed(address indexed investor, uint256 units, uint256 paid);
    event CouponPaid(uint256 indexed index, address indexed holder, uint256 units, uint256 amount);
    event CouponSettled(uint256 indexed index, uint256 holders, uint256 total);
    event Redeemed(address indexed holder, uint256 units, uint256 amount);
    event MaturitySettled(uint256 holders, uint256 total);

    error AlreadyConfigured();
    error NotConfigured();
    error SubscriptionClosed();
    error ZeroAmount();
    error NotDue(uint64 date);
    error AlreadyPaid();
    error BadIndex();
    error OnlyIssuer();

    address public immutable deployer;

    constructor() {
        deployer = msg.sender;
    }

    /// @notice One-time wiring after the T-REX token exists (the module must be bound before the token is minted).
    function configure(address _token, address _compliance, Terms calldata _terms, uint64[] calldata _couponDates)
        external
    {
        if (msg.sender != deployer) revert OnlyIssuer();
        if (address(token) != address(0)) revert AlreadyConfigured();
        token = ITrexToken(_token);
        compliance = _compliance;
        terms = _terms;
        for (uint256 i; i < _couponDates.length; i++) couponDates.push(_couponDates[i]);
    }

    // ------------------------------------------------------------------ primary issuance

    /// @notice Investor buys `units` at the discounted issue price, paid in USDT to the issuer. The token's own
    ///         checks (ONCHAINID KYC claim in the Identity Registry, compliance modules) gate the mint.
    function subscribe(uint256 units) external nonReentrant {
        if (address(token) == address(0)) revert NotConfigured();
        if (units == 0) revert ZeroAmount();
        if (block.timestamp >= terms.subscriptionEnd) revert SubscriptionClosed();
        uint256 cost = units * terms.issuePrice;
        IERC20(terms.usdt).safeTransferFrom(msg.sender, terms.issuer, cost);
        token.mint(msg.sender, units);
        emit Subscribed(msg.sender, units, cost);
    }

    // ------------------------------------------------------------------ coupons

    /// @notice Pays coupon `index` to every current holder, from the issuer's USDT allowance. Permissionless.
    function payCoupon(uint256 index) external nonReentrant {
        if (index >= couponDates.length) revert BadIndex();
        if (block.timestamp < couponDates[index]) revert NotDue(couponDates[index]);
        if (couponPaid[index]) revert AlreadyPaid();
        couponPaid[index] = true;
        address[] memory hs = _holders.values();
        uint256 total;
        for (uint256 i; i < hs.length; i++) {
            uint256 units = token.balanceOf(hs[i]);
            if (units == 0) continue;
            uint256 amount = units * terms.couponPerUnit;
            IERC20(terms.usdt).safeTransferFrom(terms.issuer, hs[i], amount);
            total += amount;
            emit CouponPaid(index, hs[i], units, amount);
        }
        emit CouponSettled(index, hs.length, total);
    }

    // ------------------------------------------------------------------ maturity

    /// @notice At maturity: every holder receives face value in USDT and their units are burned. Permissionless.
    function settleMaturity() external nonReentrant {
        if (block.timestamp < terms.maturity) revert NotDue(terms.maturity);
        if (matured) revert AlreadyPaid();
        address[] memory hs = _holders.values();
        uint256 total;
        for (uint256 i; i < hs.length; i++) {
            uint256 units = token.balanceOf(hs[i]);
            if (units == 0) continue;
            uint256 amount = units * terms.faceValue;
            IERC20(terms.usdt).safeTransferFrom(terms.issuer, hs[i], amount);
            token.burn(hs[i], units);
            total += amount;
            emit Redeemed(hs[i], units, amount);
        }
        matured = true;
        emit MaturitySettled(hs.length, total);
    }

    // ------------------------------------------------------------------ views

    function holders() external view returns (address[] memory) {
        return _holders.values();
    }

    function couponCount() external view returns (uint256) {
        return couponDates.length;
    }

    function getCouponDates() external view returns (uint64[] memory) {
        return couponDates;
    }

    /// @notice USDT the issuer must have approved to this contract for the next payment (coupon or maturity).
    function nextObligation() external view returns (uint256 amount, uint64 dueDate, bool isMaturity) {
        uint256 supply = token.totalSupply();
        for (uint256 i; i < couponDates.length; i++) {
            if (!couponPaid[i]) return (supply * terms.couponPerUnit, couponDates[i], false);
        }
        return (supply * terms.faceValue, terms.maturity, true);
    }

    // ------------------------------------------------------------------ T-REX compliance module

    /// @dev Rules: issuance only before `subscriptionEnd`, no transfers once matured (only redemption burns).
    function moduleCheck(address _from, address _to, uint256, address) external view override returns (bool) {
        if (_from == address(0) && _to == address(0)) return true;
        if (_from == address(0)) return block.timestamp < terms.subscriptionEnd; // primary issuance window
        if (_to == address(0)) return true; // redemption burn
        return block.timestamp < terms.maturity; // secondary trading stops at maturity
    }

    function moduleTransferAction(address _from, address _to, uint256) external override onlyComplianceCall {
        _track(_from);
        _track(_to);
    }

    function moduleMintAction(address _to, uint256) external override onlyComplianceCall {
        _track(_to);
    }

    function moduleBurnAction(address _from, uint256) external override onlyComplianceCall {
        _track(_from);
    }

    function _track(address a) internal {
        if (a == address(0) || address(token) == address(0)) return;
        if (token.balanceOf(a) > 0) _holders.add(a);
        else _holders.remove(a);
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "RegXNote";
    }
}
