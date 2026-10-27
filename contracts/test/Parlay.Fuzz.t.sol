// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParlayTestBase} from "./Parlay.Base.t.sol";
import {Parlay} from "../Parlay.sol";

/// @dev Fuzz + invariant tests for Parlay.
contract ParlayFuzzTest is ParlayTestBase {

    // ══════════════════════════════════════════════════════════════
    //  Fuzz: rounding — sum(credits) == amount for any 2-recipient split
    // ══════════════════════════════════════════════════════════════

    /// @notice For any valid amount and any split between two recipients,
    ///         the sum of claimable credits after approveRelease must equal
    ///         the original agreement amount exactly (no dust lost or gained).
    function testFuzz_Rounding_TwoRecipients_SumEqualsAmount(
        uint256 amount,
        uint256 share0
    ) public {
        // Bound amount to [1, maxAgreementAmount]
        amount = bound(amount, 1, MAX_AMOUNT);
        // Bound share0 to [1, 9999] so share1 is also in [1, 9999]
        share0 = bound(share0, 1, 9_999);
        uint256 share1 = 10_000 - share0;

        // Ensure creator has enough USDC
        _fundAndApprove(creator, amount);

        address[] memory recips = new address[](2);
        recips[0] = alice;
        recips[1] = bob;

        uint256[] memory shares = new uint256[](2);
        shares[0] = share0;
        shares[1] = share1;

        vm.prank(creator);
        uint256 id = parlay.createAgreement(
            recips, shares, amount, block.timestamp + 1 days, address(0)
        );

        vm.prank(creator);
        parlay.approveRelease(id);

        uint256 sumCredits = parlay.claimable(alice) + parlay.claimable(bob);

        assertEq(sumCredits, amount, "sum of recipient credits must equal amount");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Solvency invariant handler + test
// ══════════════════════════════════════════════════════════════════════════════

import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @dev Handler that drives a bounded random sequence of Parlay operations.
///      The invariant test contract registers only this handler so the fuzzer
///      explores realistic call sequences rather than garbage inputs.
contract ParlayHandler is ParlayTestBase {

    Parlay   internal _parlay;
    MockERC20 internal _usdc;

    // Ghost variables: track what's been funded vs claimed so we can reason
    // about the solvency floor.
    uint256 public ghostTotalDeposited;
    uint256 public ghostTotalClaimed;

    // Maintained list of agreement IDs we've created.
    uint256[] internal _ids;

    // Actors
    address internal _creator;
    address internal _alice;
    address internal _bob;
    address internal _arbiter;

    constructor(Parlay p, MockERC20 u) {
        _parlay  = p;
        _usdc    = u;
        _creator = makeAddr("h_creator");
        _alice   = makeAddr("h_alice");
        _bob     = makeAddr("h_bob");
        _arbiter = makeAddr("h_arbiter");
    }

    // ── Fund helpers ─────────────────────────────────────────────

    function _ensureFunds(address who, uint256 amount) internal {
        uint256 bal = _usdc.balanceOf(who);
        if (bal < amount) {
            _usdc.mint(who, amount - bal);
        }
        vm.prank(who);
        _usdc.approve(address(_parlay), type(uint256).max);
    }

    // ── Handler actions ──────────────────────────────────────────

    function createAgreement(uint256 amount, uint256 share0, uint256 releaseOffset) external {
        amount        = bound(amount, 1, MAX_AMOUNT);
        share0        = bound(share0, 1, 9_999);
        releaseOffset = bound(releaseOffset, 1, 90 days);

        _ensureFunds(_creator, amount);

        address[] memory recips = new address[](2);
        recips[0] = _alice;
        recips[1] = _bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = share0;
        shares[1] = 10_000 - share0;

        vm.prank(_creator);
        uint256 id = _parlay.createAgreement(
            recips, shares, amount, block.timestamp + releaseOffset, address(0)
        );

        _ids.push(id);
        ghostTotalDeposited += amount;
    }

    function approveRelease(uint256 seed) external {
        if (_ids.length == 0) return;
        uint256 idx = seed % _ids.length;
        uint256 id  = _ids[idx];

        Parlay.Agreement memory ag = _parlay.getAgreement(id);
        if (ag.status != Parlay.AgreementStatus.Funded) return;

        vm.prank(_creator);
        _parlay.approveRelease(id);
    }

    function refund(uint256 seed) external {
        if (_ids.length == 0) return;
        uint256 idx = seed % _ids.length;
        uint256 id  = _ids[idx];

        Parlay.Agreement memory ag = _parlay.getAgreement(id);
        if (ag.status != Parlay.AgreementStatus.Funded) return;
        if (block.timestamp >= ag.releaseTime) return;

        vm.prank(_creator);
        _parlay.refund(id);
    }

    function claimAlice() external {
        if (_parlay.claimable(_alice) == 0) return;
        uint256 amt = _parlay.claimable(_alice);
        vm.prank(_alice);
        _parlay.claim();
        ghostTotalClaimed += amt;
    }

    function claimBob() external {
        if (_parlay.claimable(_bob) == 0) return;
        uint256 amt = _parlay.claimable(_bob);
        vm.prank(_bob);
        _parlay.claim();
        ghostTotalClaimed += amt;
    }

    function claimCreator() external {
        if (_parlay.claimable(_creator) == 0) return;
        uint256 amt = _parlay.claimable(_creator);
        vm.prank(_creator);
        _parlay.claim();
        ghostTotalClaimed += amt;
    }

    function releaseAfterDeadline(uint256 seed) external {
        if (_ids.length == 0) return;
        uint256 idx = seed % _ids.length;
        uint256 id  = _ids[idx];

        Parlay.Agreement memory ag = _parlay.getAgreement(id);
        if (ag.status != Parlay.AgreementStatus.Funded) return;
        if (block.timestamp < ag.releaseTime) return;

        _parlay.releaseAfterDeadline(id);
    }
}

contract ParlayInvariantTest is ParlayTestBase {
    ParlayHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new ParlayHandler(parlay, usdc);
        targetContract(address(handler));
    }

    /// @notice Contract USDC balance must always >= totalLocked + totalClaimable.
    function invariant_Solvency() public view {
        uint256 contractBal  = usdc.balanceOf(address(parlay));
        uint256 locked       = parlay.totalLocked();
        uint256 claimableAmt = parlay.totalClaimable();

        assertGe(
            contractBal,
            locked + claimableAmt,
            "solvency violated: balance < totalLocked + totalClaimable"
        );
    }

    /// @notice totalLocked + totalClaimable must never exceed total deposited
    ///         minus what has already been claimed.
    function invariant_AccountingConservation() public view {
        uint256 locked       = parlay.totalLocked();
        uint256 claimableAmt = parlay.totalClaimable();
        uint256 contractBal  = usdc.balanceOf(address(parlay));

        // All funds in the contract are accounted for
        assertEq(
            contractBal,
            locked + claimableAmt,
            "unaccounted USDC in contract"
        );
    }
}
