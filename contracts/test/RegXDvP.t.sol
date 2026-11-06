// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "forge-std/Test.sol";
import {RegXDvP} from "../src/RegXDvP.sol";
import {TINR} from "../src/TINR.sol";
import {InvestorCapModule} from "../src/compliance/InvestorCapModule.sol";
import {MockAtsSecurity, IIR, IMC} from "./mocks/MockAtsSecurity.sol";

import {ClaimTopicsRegistry} from "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import {TrustedIssuersRegistry} from
    "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import {IdentityRegistryStorage} from
    "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import {IdentityRegistry} from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import {ModularCompliance} from "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";
import {Identity} from "@onchain-id/solidity/contracts/Identity.sol";
import {ClaimIssuer} from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
import {IIdentity} from "@onchain-id/solidity/contracts/interface/IIdentity.sol";

contract RegXDvPTest is Test {
    uint256 constant KYC_TOPIC = 1;
    uint16 constant INDIA = 356;

    RegXDvP dvp;
    TINR tinr;
    MockAtsSecurity bond;
    IdentityRegistry ir;
    ModularCompliance mc;
    InvestorCapModule cap;
    ClaimIssuer claimIssuer;

    uint256 issuerPk = 0xA11CE5;
    address issuerKey;
    uint256 alicePk = 0xA1;
    uint256 bobPk = 0xB0B;
    uint256 carolPk = 0xCA201;
    address alice;
    address bob;
    address carol;

    function setUp() public {
        issuerKey = vm.addr(issuerPk);
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);
        carol = vm.addr(carolPk);

        // --- T-REX identity stack (same sequence as scripts/deploy.ts) ---
        ClaimTopicsRegistry ctr = new ClaimTopicsRegistry();
        ctr.init();
        ctr.addClaimTopic(KYC_TOPIC);

        claimIssuer = new ClaimIssuer(issuerKey);
        vm.prank(issuerKey);
        claimIssuer.addKey(keccak256(abi.encode(issuerKey)), 3, 1); // CLAIM signer key

        TrustedIssuersRegistry tir = new TrustedIssuersRegistry();
        tir.init();
        uint256[] memory topics = new uint256[](1);
        topics[0] = KYC_TOPIC;
        tir.addTrustedIssuer(IClaimIssuer(address(claimIssuer)), topics);

        IdentityRegistryStorage irs = new IdentityRegistryStorage();
        irs.init();
        ir = new IdentityRegistry();
        ir.init(address(tir), address(ctr), address(irs));
        irs.bindIdentityRegistry(address(ir));
        ir.addAgent(address(this));

        mc = new ModularCompliance();
        mc.init();
        cap = new InvestorCapModule();
        mc.addModule(address(cap));
        mc.callModuleFunction(abi.encodeWithSelector(InvestorCapModule.setMaxHolding.selector, 100), address(cap));

        bond = new MockAtsSecurity(IIR(address(ir)), IMC(address(mc)));
        mc.bindToken(address(bond));

        tinr = new TINR();
        dvp = new RegXDvP();

        _onboard(alice);
        _onboard(bob);
        // carol is never onboarded

        bond.mint(alice, 100);
        tinr.mint(bob, 1_000_000e6);
        tinr.mint(carol, 1_000_000e6);

        vm.prank(alice);
        bond.approve(address(dvp), type(uint256).max);
        vm.prank(bob);
        tinr.approve(address(dvp), type(uint256).max);
        vm.prank(carol);
        tinr.approve(address(dvp), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _onboard(address wallet) internal {
        Identity id = new Identity(address(this), false);
        bytes memory data = abi.encode("KYC:IN", wallet);
        bytes32 digest = keccak256(abi.encode(address(id), KYC_TOPIC, data));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerPk, ethHash);
        id.addClaim(KYC_TOPIC, 1, address(claimIssuer), abi.encodePacked(r, s, v), data, "");
        ir.registerIdentity(wallet, IIdentity(address(id)), INDIA);
    }

    function _order(address maker, bool isSell, uint256 amount, uint256 nonce)
        internal
        view
        returns (RegXDvP.Order memory)
    {
        return RegXDvP.Order({
            maker: maker,
            security: address(bond),
            payToken: address(tinr),
            isSell: isSell,
            price: 985e6, // ₹985 per unit
            amount: amount,
            nonce: nonce,
            expiry: uint64(block.timestamp + 1 days)
        });
    }

    function _sign(uint256 pk, RegXDvP.Order memory o) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, dvp.hashOrder(o));
        return abi.encodePacked(r, s, v);
    }

    // ---------------------------------------------------------------- identity

    function test_TrexIdentityVerification() public {
        assertTrue(ir.isVerified(alice));
        assertTrue(ir.isVerified(bob));
        assertFalse(ir.isVerified(carol));
    }

    function test_InvestorCapAllowsOperatorCheck() public {
        // ATS calls canTransfer(operator, address(0), 0) for the DvP; must not revert or block.
        assertTrue(mc.canTransfer(address(dvp), address(0), 0));
    }

    // ---------------------------------------------------------------- fills

    function test_FillSellOrder() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);

        vm.prank(bob);
        dvp.fill(o, sig, 25);

        assertEq(bond.balanceOf(bob), 25);
        assertEq(bond.balanceOf(alice), 75);
        assertEq(tinr.balanceOf(alice), 25 * 985e6);
        assertEq(dvp.filled(dvp.hashOrder(o)), 25);
        assertEq(dvp.remaining(o), 15);
    }

    function test_FillBuyOrder() public {
        // Bob bids for 10 units; Alice hits the bid.
        RegXDvP.Order memory o = _order(bob, false, 10, 7);
        bytes memory sig = _sign(bobPk, o);
        vm.prank(alice);
        dvp.fill(o, sig, 10);
        assertEq(bond.balanceOf(bob), 10);
        assertEq(tinr.balanceOf(alice), 10 * 985e6);
    }

    function test_UnverifiedTakerReverts() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);

        (bool ok, bytes32 reason) = dvp.checkFill(o, carol, 10);
        assertFalse(ok);
        assertEq(bytes4(reason), MockAtsSecurity.AddressNotVerified.selector);

        uint256 carolCash = tinr.balanceOf(carol);
        vm.prank(carol);
        vm.expectRevert(MockAtsSecurity.AddressNotVerified.selector);
        dvp.fill(o, sig, 10);
        assertEq(tinr.balanceOf(carol), carolCash, "cash leg must roll back");
    }

    function test_FrozenMakerBlocked() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);
        bond.setAddressFrozen(alice, true);

        (bool ok,) = dvp.checkFill(o, bob, 5);
        assertFalse(ok);
        vm.prank(bob);
        vm.expectRevert(MockAtsSecurity.AccountFrozen.selector);
        dvp.fill(o, sig, 5);
    }

    function test_InvestorCapEnforced() public {
        RegXDvP.Order memory o = _order(alice, true, 100, 1);
        bytes memory sig = _sign(alicePk, o);
        vm.prank(bob);
        dvp.fill(o, sig, 25);

        mc.callModuleFunction(abi.encodeWithSelector(InvestorCapModule.setMaxHolding.selector, 30), address(cap));
        vm.prank(bob);
        vm.expectRevert(MockAtsSecurity.ComplianceNotAllowed.selector);
        dvp.fill(o, sig, 10); // 25 + 10 > 30
    }

    function test_PartialFillsAndOverfill() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);
        vm.startPrank(bob);
        dvp.fill(o, sig, 30);
        vm.expectRevert(abi.encodeWithSelector(RegXDvP.Overfill.selector, 10));
        dvp.fill(o, sig, 11);
        dvp.fill(o, sig, 10);
        vm.stopPrank();
        assertEq(dvp.remaining(o), 0);
    }

    function test_Cancel() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 9);
        bytes memory sig = _sign(alicePk, o);
        vm.prank(alice);
        dvp.cancel(9);
        assertEq(dvp.remaining(o), 0);
        vm.prank(bob);
        vm.expectRevert(RegXDvP.OrderCancelled.selector);
        dvp.fill(o, sig, 1);
    }

    function test_Expired() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);
        vm.warp(o.expiry + 1);
        vm.prank(bob);
        vm.expectRevert(RegXDvP.OrderExpired.selector);
        dvp.fill(o, sig, 1);
    }

    function test_BadSignature() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(bobPk, o); // signed by the wrong key
        vm.prank(bob);
        vm.expectRevert(RegXDvP.InvalidSignature.selector);
        dvp.fill(o, sig, 1);
    }

    function test_SelfFill() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        bytes memory sig = _sign(alicePk, o);
        vm.prank(alice);
        vm.expectRevert(RegXDvP.SelfFill.selector);
        dvp.fill(o, sig, 1);
    }

    function test_CheckFillHappyPath() public {
        RegXDvP.Order memory o = _order(alice, true, 40, 1);
        (bool ok, bytes32 reason) = dvp.checkFill(o, bob, 10);
        assertTrue(ok);
        assertEq(reason, dvp.OK());
    }
}
