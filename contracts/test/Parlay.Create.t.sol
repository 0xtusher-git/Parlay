// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParlayTestBase} from "./Parlay.Base.t.sol";
import {Parlay} from "../Parlay.sol";

/// @dev Tests for createAgreement() — happy paths and every revert branch.
contract ParlayCreateTest is ParlayTestBase {

    // ══════════════════════════════════════════════════════════════
    //  Happy paths
    // ══════════════════════════════════════════════════════════════

    function test_CreateSingleRecipient_Happy() public {
        uint256 amount     = 10 * ONE_USDC;
        uint256 releaseIn  = 1 days;
        uint256 balBefore  = usdc.balanceOf(creator);

        uint256 id = _createSingleRecipient(amount, releaseIn, address(0));

        // ID starts at 1
        assertEq(id, 1);

        // USDC pulled from creator
        assertEq(usdc.balanceOf(creator), balBefore - amount);

        // USDC held by Parlay
        assertEq(usdc.balanceOf(address(parlay)), amount);

        // Agreement fields
        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(ag.id,          id);
        assertEq(ag.creator,     creator);
        assertEq(ag.amount,      amount);
        assertEq(ag.releaseTime, block.timestamp + releaseIn);
        assertEq(uint8(ag.status), uint8(Parlay.AgreementStatus.Funded));
        assertEq(ag.recipients.length, 1);
        assertEq(ag.recipients[0], alice);
        assertEq(ag.sharesBps[0], 10_000);

        // Accounting
        assertEq(parlay.totalLocked(), amount);
        assertEq(parlay.openAgreementCount(), 1);
        assertEq(parlay.agreementCount(), 1);
    }

    function test_CreateTwoRecipient_Happy() public {
        uint256 amount = 50 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, address(0));

        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(ag.recipients.length, 2);
        assertEq(ag.sharesBps[0] + ag.sharesBps[1], 10_000);
        assertEq(parlay.totalLocked(), amount);
    }

    function test_CreateWithArbiter_Happy() public {
        uint256 id = _createTwoRecipient(10 * ONE_USDC, 1 days, arbiter);
        Parlay.Agreement memory ag = parlay.getAgreement(id);
        assertEq(ag.arbiter, arbiter);
    }

    function test_CreateEmits_AgreementCreated() public {
        uint256 amount    = 10 * ONE_USDC;
        uint256 releaseAt = block.timestamp + 1 days;

        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.expectEmit(true, true, false, true, address(parlay));
        emit Parlay.AgreementCreated(1, creator, address(0), amount, releaseAt);

        vm.prank(creator);
        parlay.createAgreement(recips, shares, amount, releaseAt, address(0));
    }

    function test_CreateMultiple_IdsIncrement() public {
        uint256 id1 = _createSingleRecipient(ONE_USDC, 1 days, address(0));
        uint256 id2 = _createSingleRecipient(ONE_USDC, 1 days, address(0));
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(parlay.agreementCount(), 2);
    }

    // ══════════════════════════════════════════════════════════════
    //  Revert paths
    // ══════════════════════════════════════════════════════════════

    function test_Revert_ZeroAddressRecipient() public {
        address[] memory recips = new address[](1);
        recips[0] = address(0);
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        vm.expectRevert(Parlay.ZeroAddress.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_CreatorIsRecipient() public {
        address[] memory recips = new address[](1);
        recips[0] = creator;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        vm.expectRevert(Parlay.CreatorIsRecipient.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_DuplicateRecipients() public {
        address[] memory recips = new address[](2);
        recips[0] = alice;
        recips[1] = alice; // duplicate
        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000;
        shares[1] = 5000;

        vm.prank(creator);
        vm.expectRevert(Parlay.DuplicateRecipient.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_SharesDontSumTo10000() public {
        address[] memory recips = new address[](2);
        recips[0] = alice;
        recips[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000;
        shares[1] = 5001; // sums to 10001

        vm.prank(creator);
        vm.expectRevert(Parlay.InvalidShares.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_SharesSingleRecipientShort() public {
        // [5000, 5001] should revert InvalidShares
        address[] memory recips = new address[](2);
        recips[0] = alice;
        recips[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000;
        shares[1] = 5001;

        vm.prank(creator);
        vm.expectRevert(Parlay.InvalidShares.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Create_SingleRecipientWith10000Shares() public {
        // [10000] for 1 recipient passes
        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        uint256 id = parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
        assertEq(id, 1);
    }

    function test_Revert_TooManyRecipients() public {
        // 11 recipients
        address[] memory recips = new address[](11);
        uint256[] memory shares = new uint256[](11);
        for (uint256 i = 0; i < 11; i++) {
            recips[i] = makeAddr(string(abi.encode(i)));
            shares[i] = (i == 10) ? 10_000 - (909 * 10) : 909;
        }

        vm.prank(creator);
        vm.expectRevert(Parlay.TooManyRecipients.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_AmountExceedsMax() public {
        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        uint256 tooMuch = MAX_AMOUNT + 1;
        _fundAndApprove(creator, tooMuch);

        vm.prank(creator);
        vm.expectRevert(Parlay.AmountExceedsMax.selector);
        parlay.createAgreement(recips, shares, tooMuch, block.timestamp + 1 days, address(0));
    }

    function test_Revert_ReleaseTimeInPast() public {
        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        // releaseTime == block.timestamp (not strictly future)
        vm.prank(creator);
        vm.expectRevert(Parlay.ReleaseTimeNotFuture.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp, address(0));
    }

    function test_Revert_ZeroAmount() public {
        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        vm.expectRevert(Parlay.ZeroAmount.selector);
        parlay.createAgreement(recips, shares, 0, block.timestamp + 1 days, address(0));
    }

    function test_Revert_ContractPaused() public {
        // Guardian pauses first
        vm.prank(guardian);
        parlay.emergencyPause();

        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        vm.expectRevert(Parlay.ContractPaused.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }

    function test_Revert_ZeroRecipientsLength() public {
        address[] memory recips = new address[](0);
        uint256[] memory shares = new uint256[](0);

        vm.prank(creator);
        vm.expectRevert(Parlay.TooManyRecipients.selector);
        parlay.createAgreement(recips, shares, ONE_USDC, block.timestamp + 1 days, address(0));
    }
}
