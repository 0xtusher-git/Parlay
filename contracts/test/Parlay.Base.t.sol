// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {Parlay} from "../Parlay.sol";

/// @dev Shared base: actors, constants, deploy fixture, and helper utilities.
///      No test/fuzz/invariant functions — those live in the category files.
abstract contract ParlayTestBase is Test {

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 internal constant DECIMALS    = 6;
    uint256 internal constant ONE_USDC    = 1e6;
    uint256 internal constant MAX_AMOUNT  = 100_000 * ONE_USDC;   // 100 USDC
    uint256 internal constant DISPUTE_TIMEOUT = 30 days;

    // ── Actors ───────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal creator  = makeAddr("creator");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal carol    = makeAddr("carol");
    address internal arbiter  = makeAddr("arbiter");
    address internal stranger = makeAddr("stranger");

    // ── Contracts ────────────────────────────────────────────────────────────
    MockERC20 internal usdc;
    Parlay    internal parlay;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function setUp() public virtual {
        usdc   = new MockERC20("Mock USDC", "mUSDC", 6);
        parlay = new Parlay(address(usdc), owner, guardian, MAX_AMOUNT);

        // Fund actors with USDC and pre-approve the Parlay contract.
        _fundAndApprove(creator, 1_000_000 * ONE_USDC);
        _fundAndApprove(alice,   1_000_000 * ONE_USDC);
        _fundAndApprove(bob,     1_000_000 * ONE_USDC);
        _fundAndApprove(carol,   1_000_000 * ONE_USDC);
    }

    /// @dev Mint USDC and grant unlimited approval to Parlay.
    function _fundAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(parlay), type(uint256).max);
    }

    /// @dev Create a simple two-recipient agreement (50/50) from `creator`.
    ///      Returns the agreement id.
    function _createTwoRecipient(
        uint256 amount,
        uint256 releaseIn,
        address _arbiter
    ) internal returns (uint256 id) {
        address[] memory recips = new address[](2);
        recips[0] = alice;
        recips[1] = bob;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000;
        shares[1] = 5000;

        vm.prank(creator);
        id = parlay.createAgreement(recips, shares, amount, block.timestamp + releaseIn, _arbiter);
    }

    /// @dev Create a single-recipient agreement (100%) from `creator`.
    function _createSingleRecipient(
        uint256 amount,
        uint256 releaseIn,
        address _arbiter
    ) internal returns (uint256 id) {
        address[] memory recips = new address[](1);
        recips[0] = alice;

        uint256[] memory shares = new uint256[](1);
        shares[0] = 10_000;

        vm.prank(creator);
        id = parlay.createAgreement(recips, shares, amount, block.timestamp + releaseIn, _arbiter);
    }
}
