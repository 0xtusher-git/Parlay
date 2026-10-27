// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ParlayTestBase} from "./Parlay.Base.t.sol";
import {Parlay} from "../Parlay.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {MaliciousERC20} from "../test-helpers/MaliciousERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Tests for admin/security surface:
///      pause, rescueToken, renounceOwnership, reentrancy guard,
///      and pull-payment blocklist protection.
contract ParlayAdminTest is ParlayTestBase {

    // ══════════════════════════════════════════════════════════════
    //  Pause / unpause
    // ══════════════════════════════════════════════════════════════

    function test_Pause_OnlyGuardian() public {
        vm.prank(stranger);
        vm.expectRevert(Parlay.NotGuardian.selector);
        parlay.emergencyPause();
    }

    function test_Pause_GuardianPauses() public {
        vm.prank(guardian);
        parlay.emergencyPause();
        assertTrue(parlay.paused());
    }

    function test_Unpause_OnlyOwner() public {
        vm.prank(guardian);
        parlay.emergencyPause();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        parlay.unpause();
    }

    function test_Unpause_Owner() public {
        vm.prank(guardian);
        parlay.emergencyPause();

        vm.prank(owner);
        parlay.unpause();

        assertFalse(parlay.paused());
    }

    function test_Unpause_Revert_NotPaused() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.NotPaused.selector);
        parlay.unpause();
    }

    // ══════════════════════════════════════════════════════════════
    //  renounceOwnership
    // ══════════════════════════════════════════════════════════════

    function test_RenounceOwnership_AlwaysReverts() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.OwnershipCannotBeRenounced.selector);
        parlay.renounceOwnership();
    }

    // ══════════════════════════════════════════════════════════════
    //  rescueToken
    // ══════════════════════════════════════════════════════════════

    function test_RescueToken_NonUSDC_Success() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        uint256 amount = 500e18;

        // Send some "other" tokens directly to the Parlay contract
        other.mint(address(parlay), amount);

        uint256 ownerBalBefore = other.balanceOf(owner);

        vm.prank(owner);
        parlay.rescueToken(address(other), amount);

        assertEq(other.balanceOf(owner),         ownerBalBefore + amount);
        assertEq(other.balanceOf(address(parlay)), 0);
    }

    function test_RescueToken_USDC_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.CannotRescueUSDC.selector);
        parlay.rescueToken(address(usdc), 1);
    }

    function test_RescueToken_OnlyOwner() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        other.mint(address(parlay), 100e18);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        parlay.rescueToken(address(other), 100e18);
    }

    // ══════════════════════════════════════════════════════════════
    //  setMaxAgreementAmount
    // ══════════════════════════════════════════════════════════════

    function test_SetMaxAmount_Owner() public {
        vm.prank(owner);
        parlay.setMaxAgreementAmount(200_000 * ONE_USDC);
        assertEq(parlay.maxAgreementAmount(), 200_000 * ONE_USDC);
    }

    function test_SetMaxAmount_Revert_Zero() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.ZeroAmount.selector);
        parlay.setMaxAgreementAmount(0);
    }

    // ══════════════════════════════════════════════════════════════
    //  setGuardian
    // ══════════════════════════════════════════════════════════════

    function test_SetGuardian_Owner() public {
        address newGuardian = makeAddr("newGuardian");

        vm.prank(owner);
        parlay.setGuardian(newGuardian);
        assertEq(parlay.guardian(), newGuardian);
    }

    function test_SetGuardian_Revert_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(Parlay.ZeroAddress.selector);
        parlay.setGuardian(address(0));
    }

    // ══════════════════════════════════════════════════════════════
    //  Reentrancy guard on claim()
    // ══════════════════════════════════════════════════════════════

    function test_Reentrancy_Claim_BlockedByNonReentrant() public {
        // Deploy a malicious ERC20 that tries to call claim() inside transfer.
        MaliciousERC20 malToken = new MaliciousERC20();
        malToken.setParlay(address(parlay));

        // Deploy a fresh Parlay that uses the malicious token as USDC.
        Parlay malParlay = new Parlay(
            address(malToken),
            owner,
            guardian,
            MAX_AMOUNT
        );
        malToken.setParlay(address(malParlay));

        // Fund alice with the malicious token and approve.
        malToken.mint(creator, 100 * ONE_USDC);
        vm.prank(creator);
        malToken.approve(address(malParlay), type(uint256).max);

        address[] memory recips = new address[](1);
        recips[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        // Create and release an agreement so alice has a claimable balance.
        vm.prank(creator);
        uint256 id = malParlay.createAgreement(
            recips, shares, 10 * ONE_USDC, block.timestamp + 1 days, address(0)
        );
        vm.prank(creator);
        malParlay.approveRelease(id);

        // Arm the malicious token so it tries to re-enter claim() on the
        // outbound transfer.
        malToken.arm();

        uint256 claimableBefore = malParlay.claimable(alice);
        assertGt(claimableBefore, 0, "alice should have a claimable balance");

        // The claim() call should succeed (first entry), but the re-entrant
        // call inside the transfer should be blocked by ReentrancyGuard,
        // reverting silently (caught by try/catch in MaliciousERC20).
        vm.prank(alice);
        malParlay.claim(); // must not revert

        // After the call alice's claimable is zeroed — the outer claim worked.
        assertEq(malParlay.claimable(alice), 0, "claimable should be zeroed after claim");

        // The re-entrant call was blocked, so alice cannot have claimed twice.
        // Contract USDC balance should be 0 (all 10 USDC sent to alice once).
        assertEq(malToken.balanceOf(address(malParlay)), 0, "contract should hold no mal tokens");
    }

    // ══════════════════════════════════════════════════════════════
    //  Blocklisted-recipient protection (pull-payment design)
    // ══════════════════════════════════════════════════════════════

    /// @dev Demonstrates that a recipient whose token transfer reverts does NOT
    ///      affect other recipients, because the contract uses pull-payment:
    ///      credits are assigned in _creditRecipients and each recipient
    ///      independently calls claim().
    function test_BlocklistedRecipient_OtherRecipientsUnaffected() public {
        // Create a 2-recipient agreement where alice is a normal recipient
        // and bob is "blocklisted" (we simulate this by simply never calling
        // claim() on bob's behalf — the contract's pull design means their
        // credit sits idle without affecting alice).
        uint256 amount = 20 * ONE_USDC;
        uint256 id     = _createTwoRecipient(amount, 1 days, address(0));

        vm.prank(creator);
        parlay.approveRelease(id);

        // Both credits are assigned
        assertEq(parlay.claimable(alice), amount / 2);
        assertEq(parlay.claimable(bob),   amount / 2);

        // Alice claims her share independently — bob's "block" doesn't matter
        uint256 aliceBalBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        parlay.claim();

        assertEq(usdc.balanceOf(alice), aliceBalBefore + amount / 2);

        // Bob's credit is still sitting there, claimable whenever bob wants.
        assertEq(parlay.claimable(bob), amount / 2);
    }
}
