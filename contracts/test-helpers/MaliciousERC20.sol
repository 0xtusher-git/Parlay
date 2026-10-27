// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IParlayClaim {
    function claim() external;
}

/// @dev A malicious ERC-20 that attempts to re-enter `Parlay.claim()` during
///      the `safeTransfer` call inside `claim()`. Used to verify that
///      `nonReentrant` blocks the second invocation.
contract MaliciousERC20 is ERC20 {
    uint8 private immutable _decimals;
    address public parlay;
    bool public armed; // set true only for the reentrancy test call

    bool private _attacking; // prevent infinite recursion if guard is absent

    constructor() ERC20("Mal", "MAL") {
        _decimals = 6;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setParlay(address _parlay) external {
        parlay = _parlay;
    }

    function arm() external {
        armed = true;
    }

    /// @dev Override _update so every transfer can trigger the reentrant call.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        // Only attempt re-entry on the outbound transfer FROM the Parlay contract
        // and only once per claim to avoid stack overflow if guard is absent.
        if (armed && from == parlay && !_attacking) {
            _attacking = true;
            try IParlayClaim(parlay).claim() {} catch {}
            _attacking = false;
        }
    }
}
