// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParlayTestBase} from "./Parlay.Base.t.sol";
import {Parlay} from "../Parlay.sol";

/// @dev Tests for the full agreement lifecycle:
///      approveRelease, releaseAfterDeadline, refund, raiseDispute,
///      resolveDispute, claim (incl. pull-payment properties).
contract ParlayLifecycleTest is ParlayTestBase {

    // ══════════════════════════════════════════════════════════════
    //  approveRelease
    // ══════════════════════════════════════════════════════════════

    function test_ApproveRelease_CreditsRecipients() public {
        uint256 amount = 100 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, address(0));

        vm.expectEmit(true, true, false, false, address(parlay));
        emit Parlay.Released(id, creator);

        vm.prank(creator);
        parlay.approveRelease(id);

        // Each recipient gets 50% credited
        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);

        // Status
        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Released));

        // Accounting
        assertEq(parlay.totalLocked(),    0);
        assertEq(parlay.totalClaimable(), amount);
        assertEq(parlay.openAgreementCount(), 0);
    }

    function test_ApproveRelease_Revert_NotCreator() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(stranger);
        vm.expectRevert(Parlay.NotCreator.selector);
        parlay.approveRelease(id);
    }

    function test_ApproveRelease_Revert_NotFunded() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 1 days, address(0));
        // Release once
        vm.prank(creator);
        parlay.approveRelease(id);
        // Try again — should be AgreementNotFunded
        vm.prank(creator);
        vm.expectRevert(Parlay.AgreementNotFunded.selector);
        parlay.approveRelease(id);
    }

    // ══════════════════════════════════════════════════════════════
    //  releaseAfterDeadline
    // ══════════════════════════════════════════════════════════════

    function test_ReleaseAfterDeadline_Happy() public {
        uint256 amount = 60 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, address(0));

        // Warp past release time
        skip(1 days + 1);

        vm.prank(stranger); // anyone can trigger
        parlay.releaseAfterDeadline(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Released));

        // Recipients credited proportionally
        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);
    }

    function test_ReleaseAfterDeadline_Revert_BeforeDeadline() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(stranger);
        vm.expectRevert(Parlay.ReleaseTimeNotReached.selector);
        parlay.releaseAfterDeadline(id);
    }

    // ══════════════════════════════════════════════════════════════
    //  refund
    // ══════════════════════════════════════════════════════════════

    function test_Refund_BeforeDeadline_CreatorCredited() public {
        uint256 amount = 20 * ONE_USDC;
        uint256 id     = _createSingleRecipient(amount, 2 days, address(0));

        vm.expectEmit(true, true, false, false, address(parlay));
        emit Parlay.Refunded(id, creator);

        vm.prank(creator);
        parlay.refund(id);

        // Creator gets claimable credit (pull-payment)
        assertEq(parlay.claimable(creator), amount);
        assertEq(parlay.totalLocked(), 0);
        assertEq(parlay.totalClaimable(), amount);
        assertEq(parlay.openAgreementCount(), 0);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Refunded));
    }

    function test_Refund_Revert_AfterDeadline() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 1 days, address(0));

        skip(1 days + 1); // past releaseTime

        vm.prank(creator);
        vm.expectRevert(Parlay.AlreadyPastReleaseTime.selector);
        parlay.refund(id);
    }

    function test_Refund_Revert_NotCreator() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(stranger);
        vm.expectRevert(Parlay.NotCreator.selector);
        parlay.refund(id);
    }

    // ══════════════════════════════════════════════════════════════
    //  raiseDispute
    // ══════════════════════════════════════════════════════════════

    function test_RaiseDispute_ByRecipient_StatusDisputed() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        vm.expectEmit(true, true, false, false, address(parlay));
        emit Parlay.DisputeRaised(id, alice);

        vm.prank(alice);
        parlay.raiseDispute(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Disputed));
    }

    function test_RaiseDispute_ByCreator_StatusDisputed() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        vm.prank(creator);
        parlay.raiseDispute(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Disputed));
    }

    function test_RaiseDispute_Revert_NoArbiter() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(alice);
        vm.expectRevert(Parlay.NoArbiterSet.selector);
        parlay.raiseDispute(id);
    }

    function test_RaiseDispute_Revert_NotParticipant() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        vm.prank(stranger);
        vm.expectRevert(Parlay.NotRecipientOrCreator.selector);
        parlay.raiseDispute(id);
    }

    /// @dev After releaseTime, raiseDispute must revert DisputeAfterDeadline.
    ///      Without this guard, a recipient could dispute one second after the
    ///      deadline and freeze a matured agreement for 30+ days.
    function test_RaiseDispute_Revert_AfterDeadline_ByRecipient() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        // Warp to exactly releaseTime (boundary: >= should revert)
        skip(1 days);

        vm.prank(alice);
        vm.expectRevert(Parlay.DisputeAfterDeadline.selector);
        parlay.raiseDispute(id);
    }

    /// @dev Creator also cannot raise a dispute after releaseTime.
    function test_RaiseDispute_Revert_AfterDeadline_ByCreator() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        skip(1 days + 100);

        vm.prank(creator);
        vm.expectRevert(Parlay.DisputeAfterDeadline.selector);
        parlay.raiseDispute(id);
    }

    /// @dev One second before releaseTime the dispute should still succeed.
    function test_RaiseDispute_JustBeforeDeadline_Succeeds() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        // Stay strictly before releaseTime
        skip(1 days - 1);

        vm.prank(alice);
        parlay.raiseDispute(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Disputed));
    }

    /// @dev A matured (past releaseTime) agreement can still be released via
    ///      releaseAfterDeadline even though dispute is now blocked. Verify
    ///      the normal path still works correctly after adding the guard.
    function test_RaiseDispute_AfterDeadline_ReleaseAfterDeadlineStillWorks() public {
        uint256 amount = 20 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, arbiter);

        // Warp past deadline — dispute now blocked, but release should work
        skip(1 days + 1);

        // raiseDispute reverts
        vm.prank(alice);
        vm.expectRevert(Parlay.DisputeAfterDeadline.selector);
        parlay.raiseDispute(id);

        // releaseAfterDeadline succeeds for anyone
        vm.prank(stranger);
        parlay.releaseAfterDeadline(id);

        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);
    }

    // ══════════════════════════════════════════════════════════════
    //  resolveDispute
    // ══════════════════════════════════════════════════════════════

    function test_ResolveDispute_ReleaseToRecipients() public {
        uint256 amount = 80 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, arbiter);

        vm.prank(alice);
        parlay.raiseDispute(id);

        vm.expectEmit(true, false, false, true, address(parlay));
        emit Parlay.DisputeResolved(id, true);

        vm.prank(arbiter);
        parlay.resolveDispute(id, true); // release to recipients

        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Resolved));
        assertEq(parlay.totalLocked(), 0);
    }

    function test_ResolveDispute_RefundToCreator() public {
        uint256 amount = 50 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, arbiter);

        vm.prank(creator);
        parlay.raiseDispute(id);

        vm.prank(arbiter);
        parlay.resolveDispute(id, false); // refund to creator

        assertEq(parlay.claimable(creator), amount);
        assertEq(parlay.claimable(alice), 0);
        assertEq(parlay.claimable(bob),   0);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Resolved));
    }

    function test_ResolveDispute_Revert_NotArbiter() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        vm.prank(alice);
        parlay.raiseDispute(id);

        vm.prank(stranger);
        vm.expectRevert(Parlay.NotArbiter.selector);
        parlay.resolveDispute(id, true);
    }

    // ══════════════════════════════════════════════════════════════
    //  Dispute escape hatch
    // ══════════════════════════════════════════════════════════════

    function test_DisputeEscapeHatch_AfterTimeout() public {
        uint256 amount = 30 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, arbiter);

        vm.prank(alice);
        parlay.raiseDispute(id);

        // Warp past releaseTime + DISPUTE_TIMEOUT
        skip(1 days + DISPUTE_TIMEOUT + 1);

        vm.prank(stranger); // anyone
        parlay.releaseAfterDeadline(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Released));

        // Recipients receive their share
        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);
    }

    function test_DisputeEscapeHatch_Revert_TooEarly() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);

        vm.prank(alice);
        parlay.raiseDispute(id);

        // Warp only past releaseTime but NOT past releaseTime + DISPUTE_TIMEOUT
        skip(1 days + 1);

        vm.prank(stranger);
        vm.expectRevert(Parlay.DisputeTimeoutNotReached.selector);
        parlay.releaseAfterDeadline(id);
    }

    // ══════════════════════════════════════════════════════════════
    //  claim
    // ══════════════════════════════════════════════════════════════

    function test_Claim_Happy_BalanceIncreasesClaimableZeroed() public {
        uint256 amount = 40 * ONE_USDC;
        uint256 id     = _createSingleRecipient(amount, 1 days, address(0));

        vm.prank(creator);
        parlay.approveRelease(id);

        uint256 balBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, false, false, true, address(parlay));
        emit Parlay.Claimed(alice, amount);

        vm.prank(alice);
        parlay.claim();

        assertEq(usdc.balanceOf(alice), balBefore + amount);
        assertEq(parlay.claimable(alice), 0);
        assertEq(parlay.totalClaimable(), 0);
    }

    function test_Claim_DoubleClaim_Reverts() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(creator);
        parlay.approveRelease(id);

        vm.prank(alice);
        parlay.claim();

        // Second claim — nothing left
        vm.prank(alice);
        vm.expectRevert(Parlay.NothingToClaim.selector);
        parlay.claim();
    }

    function test_Claim_NothingToClaim_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(Parlay.NothingToClaim.selector);
        parlay.claim();
    }

    // ══════════════════════════════════════════════════════════════
    //  Rounding dust (3 recipients, last gets dust)
    // ══════════════════════════════════════════════════════════════

    function test_RoundingDust_ThreeRecipients_SumEqualsAmount() public {
        // shares: 3333, 3333, 3334 → sums to 10000
        address[] memory recips = new address[](3);
        recips[0] = alice;
        recips[1] = bob;
        recips[2] = carol;

        uint256[] memory shares = new uint256[](3);
        shares[0] = 3333;
        shares[1] = 3333;
        shares[2] = 3334;

        uint256 amount = 10 * ONE_USDC;

        vm.prank(creator);
        uint256 id = parlay.createAgreement(recips, shares, amount, block.timestamp + 1 days, address(0));

        vm.prank(creator);
        parlay.approveRelease(id);

        uint256 sumCredits = parlay.claimable(alice) + parlay.claimable(bob) + parlay.claimable(carol);
        assertEq(sumCredits, amount, "sum of credits must equal agreement.amount exactly");
    }

    // ══════════════════════════════════════════════════════════════
    //  Pause does NOT block lifecycle functions
    // ══════════════════════════════════════════════════════════════

    function test_PauseDoesNotBlock_Claim() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 1 days, address(0));

        vm.prank(creator);
        parlay.approveRelease(id);

        // Now pause
        vm.prank(guardian);
        parlay.emergencyPause();

        // Claim still works
        vm.prank(alice);
        parlay.claim();
        assertEq(parlay.claimable(alice), 0);
    }

    function test_PauseDoesNotBlock_Refund() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 2 days, address(0));

        vm.prank(guardian);
        parlay.emergencyPause();

        // Refund still works before deadline
        vm.prank(creator);
        parlay.refund(id);

        assertEq(parlay.claimable(creator), 10 * ONE_USDC);
    }

    function test_PauseDoesNotBlock_ApproveRelease() public {
        uint256 id = _createSingleRecipient(10 * ONE_USDC, 2 days, address(0));

        vm.prank(guardian);
        parlay.emergencyPause();

        // approveRelease still works
        vm.prank(creator);
        parlay.approveRelease(id);

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Released));
    }
}
