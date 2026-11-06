// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RegXDvP} from "../src/RegXDvP.sol";
import {RegXNote} from "../src/RegXNote.sol";
import {InvestorCapModule} from "../src/compliance/InvestorCapModule.sol";

import {Token} from "@tokenysolutions/t-rex/contracts/token/Token.sol";
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

contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }
}

/// Whitechain flow: real T-REX Token + Identity Registry + Modular Compliance (RegXNote + InvestorCapModule), USDT.
contract RegXNoteTest is Test {
    uint256 constant USDT = 1e6;
    uint256 constant KYC = 1;

    Token token;
    IdentityRegistry ir;
    ModularCompliance mc;
    RegXNote note;
    InvestorCapModule cap;
    RegXDvP dvp;
    MockUSDT usdt;
    ClaimIssuer claimIssuer;

    uint256 agentPk = 0xA6E27;
    address agent;
    address issuer = address(0x15500E);
    uint256 alicePk = 0xA1;
    uint256 bobPk = 0xB0B;
    address alice;
    address bob;
    address carol = address(0xCA201);
    uint64 couponDate;
    uint64 maturity;
    uint64 subEnd;

    function setUp() public {
        agent = vm.addr(agentPk);
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);

        ClaimTopicsRegistry ctr = new ClaimTopicsRegistry();
        ctr.init();
        ctr.addClaimTopic(KYC);
        claimIssuer = new ClaimIssuer(agent);
        vm.prank(agent);
        claimIssuer.addKey(keccak256(abi.encode(agent)), 3, 1);
        TrustedIssuersRegistry tir = new TrustedIssuersRegistry();
        tir.init();
        uint256[] memory topics = new uint256[](1);
        topics[0] = KYC;
        tir.addTrustedIssuer(IClaimIssuer(address(claimIssuer)), topics);
        IdentityRegistryStorage irs = new IdentityRegistryStorage();
        irs.init();
        ir = new IdentityRegistry();
        ir.init(address(tir), address(ctr), address(irs));
        irs.bindIdentityRegistry(address(ir));
        ir.addAgent(address(this));

        usdt = new MockUSDT();
        subEnd = uint64(block.timestamp + 1 days);
        couponDate = uint64(block.timestamp + 15 days);
        maturity = uint64(block.timestamp + 30 days);

        // compliance: RegXNote (lifecycle rules) + InvestorCapModule (concentration limit)
        mc = new ModularCompliance();
        mc.init();
        note = new RegXNote();
        cap = new InvestorCapModule();
        mc.addModule(address(note));
        mc.addModule(address(cap));
        mc.callModuleFunction(abi.encodeWithSelector(InvestorCapModule.setMaxHolding.selector, 150), address(cap));

        token = new Token();
        token.init(address(ir), address(mc), "Acme Textiles INV-2026-001", "ACME01", 0, address(0));
        token.addAgent(address(note)); // mints on subscription, burns on redemption
        token.addAgent(address(this)); // issuer agent (freeze / pause)
        token.unpause(); // T-REX tokens start paused

        uint64[] memory dates = new uint64[](1);
        dates[0] = couponDate;
        note.configure(
            address(token),
            address(mc),
            RegXNote.Terms({
                usdt: address(usdt),
                issuer: issuer,
                faceValue: 1 * USDT,
                issuePrice: 97 * USDT / 100, // 3% discount
                couponPerUnit: USDT / 100, // 1% of face
                subscriptionEnd: subEnd,
                maturity: maturity
            }),
            dates
        );

        dvp = new RegXDvP();
        _onboard(alice);
        _onboard(bob);

        usdt.mint(alice, 1_000 * USDT);
        usdt.mint(bob, 1_000 * USDT);
        usdt.mint(carol, 1_000 * USDT);
        usdt.mint(issuer, 1_000 * USDT);
        for (uint256 i; i < 3; i++) {
            address w = i == 0 ? alice : i == 1 ? bob : carol;
            vm.startPrank(w);
            usdt.approve(address(note), type(uint256).max);
            usdt.approve(address(dvp), type(uint256).max);
            token.approve(address(dvp), type(uint256).max);
            vm.stopPrank();
        }
        vm.prank(issuer);
        usdt.approve(address(note), type(uint256).max);
    }

    function _onboard(address wallet) internal {
        Identity id = new Identity(address(this), false);
        bytes memory data = abi.encode("KYC:IN", wallet);
        bytes32 digest = keccak256(abi.encode(address(id), KYC, data));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(agentPk, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)));
        id.addClaim(KYC, 1, address(claimIssuer), abi.encodePacked(r, s, v), data, "");
        ir.registerIdentity(wallet, IIdentity(address(id)), 356);
    }

    function _sellOrder(uint256 amount, uint256 nonce) internal view returns (RegXDvP.Order memory o, bytes memory sig) {
        o = RegXDvP.Order({
            maker: alice,
            security: address(token),
            payToken: address(usdt),
            isSell: true,
            price: 99 * USDT / 100,
            amount: amount,
            nonce: nonce,
            expiry: uint64(block.timestamp + 1 days)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, dvp.hashOrder(o));
        sig = abi.encodePacked(r, s, v);
    }

    // ---------------------------------------------------------------- issuance

    function test_SubscribePaysIssuerInUsdt() public {
        vm.prank(alice);
        note.subscribe(100);
        assertEq(token.balanceOf(alice), 100);
        assertEq(usdt.balanceOf(issuer), 1_000 * USDT + 97 * USDT);
        assertEq(note.holders().length, 1);
    }

    function test_UnverifiedCannotSubscribe() public {
        vm.prank(carol);
        vm.expectRevert("Identity is not verified.");
        note.subscribe(10);
    }

    function test_SubscriptionWindowEnforced() public {
        vm.warp(subEnd);
        vm.prank(alice);
        vm.expectRevert(RegXNote.SubscriptionClosed.selector);
        note.subscribe(10);
        // the compliance module blocks issuance itself, even for an agent minting directly
        vm.expectRevert("Compliance not followed");
        token.mint(alice, 1);
    }

    function test_InvestorCapOnSubscription() public {
        vm.prank(alice);
        vm.expectRevert("Compliance not followed");
        note.subscribe(151);
    }

    // ---------------------------------------------------------------- secondary DvP with a T-REX token

    function test_DvPTradeTracksHolders() public {
        vm.prank(alice);
        note.subscribe(100);
        (RegXDvP.Order memory o, bytes memory sig) = _sellOrder(100, 1);
        (bool ok,) = dvp.checkFill(o, bob, 100);
        assertTrue(ok);
        vm.prank(bob);
        dvp.fill(o, sig, 100);
        assertEq(token.balanceOf(bob), 100);
        assertEq(usdt.balanceOf(alice), 1_000 * USDT - 97 * USDT + 99 * USDT);
        address[] memory hs = note.holders();
        assertEq(hs.length, 1);
        assertEq(hs[0], bob);
    }

    function test_UnverifiedBuyerRejected() public {
        vm.prank(alice);
        note.subscribe(100);
        (RegXDvP.Order memory o, bytes memory sig) = _sellOrder(10, 1);
        (bool ok, bytes32 reason) = dvp.checkFill(o, carol, 10);
        assertFalse(ok);
        assertEq(reason, dvp.NOT_VERIFIED());
        uint256 cash = usdt.balanceOf(carol);
        vm.prank(carol);
        vm.expectRevert("Transfer not possible");
        dvp.fill(o, sig, 10);
        assertEq(usdt.balanceOf(carol), cash);
    }

    function test_FrozenSellerBlocked() public {
        vm.prank(alice);
        note.subscribe(100);
        token.setAddressFrozen(alice, true);
        (RegXDvP.Order memory o, bytes memory sig) = _sellOrder(10, 1);
        (bool ok, bytes32 reason) = dvp.checkFill(o, bob, 10);
        assertFalse(ok);
        assertEq(reason, dvp.FROZEN());
        vm.prank(bob);
        vm.expectRevert("wallet is frozen");
        dvp.fill(o, sig, 10);
    }

    function test_PausedBlocked() public {
        vm.prank(alice);
        note.subscribe(100);
        token.pause();
        (RegXDvP.Order memory o,) = _sellOrder(10, 1);
        (bool ok, bytes32 reason) = dvp.checkFill(o, bob, 10);
        assertFalse(ok);
        assertEq(reason, dvp.PAUSED());
    }

    // ---------------------------------------------------------------- coupon & maturity

    function test_CouponPaidInUsdtToHolders() public {
        vm.prank(alice);
        note.subscribe(100);
        vm.prank(bob);
        note.subscribe(50);
        vm.expectRevert(abi.encodeWithSelector(RegXNote.NotDue.selector, couponDate));
        note.payCoupon(0);

        vm.warp(couponDate);
        uint256 a0 = usdt.balanceOf(alice);
        uint256 b0 = usdt.balanceOf(bob);
        vm.prank(address(0xBEEF)); // anyone can trigger settlement
        note.payCoupon(0);
        assertEq(usdt.balanceOf(alice) - a0, 100 * USDT / 100);
        assertEq(usdt.balanceOf(bob) - b0, 50 * USDT / 100);
        vm.expectRevert(RegXNote.AlreadyPaid.selector);
        note.payCoupon(0);
    }

    function test_NoTradingAfterMaturityThenRedeem() public {
        vm.prank(alice);
        note.subscribe(100);
        (RegXDvP.Order memory o, bytes memory sig) = _sellOrder(50, 1);
        vm.prank(bob);
        dvp.fill(o, sig, 40); // bob now holds 40
        vm.warp(maturity);

        (o,) = _sellOrder(10, 2); // fresh order: maturity, not expiry, must block it
        (bool ok, bytes32 reason) = dvp.checkFill(o, bob, 10);
        assertFalse(ok);
        assertEq(reason, dvp.COMPLIANCE());
        vm.prank(alice);
        vm.expectRevert("Transfer not possible");
        token.transfer(bob, 1);

        uint256 a0 = usdt.balanceOf(alice);
        uint256 b0 = usdt.balanceOf(bob);
        note.settleMaturity();
        assertEq(usdt.balanceOf(alice) - a0, 60 * USDT);
        assertEq(usdt.balanceOf(bob) - b0, 40 * USDT);
        assertEq(token.totalSupply(), 0);
        assertEq(note.holders().length, 0);
        assertTrue(note.matured());
    }

    function test_IssuerDefaultIsVisible() public {
        vm.prank(alice);
        note.subscribe(100);
        vm.prank(issuer);
        usdt.approve(address(note), 0); // issuer stops funding
        vm.warp(maturity);
        vm.expectRevert("ERC20: insufficient allowance");
        note.settleMaturity();
        assertEq(token.balanceOf(alice), 100); // investor keeps the claim
    }
}
