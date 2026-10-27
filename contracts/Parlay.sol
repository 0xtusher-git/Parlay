// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract Parlay is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice After releaseTime + DISPUTE_TIMEOUT, anyone may trigger a release on a
    ///         Disputed agreement even without arbiter action, protecting against arbiter
    ///         inaction or loss-of-key. Set to 30 days.
    uint256 public constant DISPUTE_TIMEOUT = 30 days;

    enum AgreementStatus {
        Funded,
        Released,
        Refunded,
        Disputed,
        Resolved
    }

    struct Agreement {
        uint256 id;
        address creator;
        address arbiter; // address(0) means no arbiter set
        address[] recipients;
        uint256[] sharesBps; // basis points that must sum to 10_000
        uint256 amount; // USDC units (6 decimals)
        uint256 releaseTime; // unix timestamp
        uint256 createdAt;
        AgreementStatus status;
    }

    error ZeroAddress();
    error ZeroAmount();
    error InvalidShares();
    error TooManyRecipients();
    error DuplicateRecipient();
    error CreatorIsRecipient();
    error AmountExceedsMax();
    error ReleaseTimeNotFuture();
    error NotCreator();
    error NotArbiter();
    error NotGuardian();
    error NotRecipientOrCreator();
    error NoArbiterSet();
    error AgreementNotFunded();
    error AlreadyPastReleaseTime();
    error ReleaseTimeNotReached();
    error DisputeAlreadyOpen();
    error DisputeAfterDeadline();
    error DisputeTimeoutNotReached();
    error NotPaused();
    error NothingToClaim();
    error ContractPaused();
    error CannotRescueUSDC();
    error OwnershipCannotBeRenounced();

    event AgreementCreated(uint256 indexed id, address indexed creator, address arbiter, uint256 amount, uint256 releaseTime);
    event Released(uint256 indexed id, address indexed triggeredBy);
    event Refunded(uint256 indexed id, address indexed creator);
    event DisputeRaised(uint256 indexed id, address indexed raisedBy);
    event DisputeResolved(uint256 indexed id, bool releasedToRecipients);
    event Claimed(address indexed claimant, uint256 amount);
    event MaxAmountUpdated(uint256 oldMax, uint256 newMax);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    // Agreement lifecycle state.
    mapping(uint256 => Agreement) public agreements;
    uint256 public agreementCount;

    // Pull-payment credits and aggregate accounting.
    mapping(address => uint256) public claimable;
    uint256 public totalLocked;
    uint256 public totalClaimable;

    // Count of agreements still considered open (Funded + Disputed).
    uint256 public openAgreementCount;

    IERC20 public immutable usdc;
    address public guardian;
    uint256 public maxAgreementAmount;

    mapping(address => uint256[]) private _userAgreements;

    // --- Pause policy (IMPORTANT) ---
    // emergencyPause() only blocks createAgreement(). It intentionally does NOT block
    // claim(), refund(), approveRelease(), releaseAfterDeadline(), or resolveDispute().
    // This is by design: an emergency stop must never trap user funds. Creators can
    // always refund, recipients can always claim credited balances, and existing
    // agreements can always be settled. Only NEW agreement creation is gated.

    // --- Accounting invariant ---
    // At all times the contract must remain solvent:
    //     usdc.balanceOf(address(this)) >= totalLocked + totalClaimable
    //
    // - totalLocked:    funds reserved for still-open (Funded or Disputed) agreements.
    // - totalClaimable: pull-payment credits already assigned to specific recipients.
    // - Recipients withdraw via claim(). Settlement never pushes in a loop.
    // - Share rounding dust is assigned to the last recipient so sum(credits) == amount.

    // --- Dispute escape hatch ---
    // If an arbiter is unresponsive, funds could otherwise be frozen forever once
    // raiseDispute() is called. The escape hatch: after (releaseTime + DISPUTE_TIMEOUT)
    // anyone can call releaseAfterDeadline() on a Disputed agreement, treating it like
    // an uncontested payout to recipients. This bounds the worst-case lock duration.

    /// @param _usdc         USDC ERC-20 address (immutable).
    /// @param _owner        Initial contract owner — receives ownership directly.
    ///                      Never defaults to msg.sender; must be supplied explicitly.
    /// @param _guardian     Address authorised to call emergencyPause().
    ///                      Separate from owner so pause authority can be held by a
    ///                      hot wallet / monitoring bot while ownership stays cold.
    /// @param _maxAgreementAmount  Per-agreement USDC cap in 6-decimal units.
    constructor(address _usdc, address _owner, address _guardian, uint256 _maxAgreementAmount) Ownable(_owner) {
        // Ownable(_owner) sets _owner as the initial owner directly — no intermediate
        // msg.sender step. All three address args are validated before any state write.
        if (_usdc == address(0) || _owner == address(0) || _guardian == address(0)) {
            revert ZeroAddress();
        }
        if (_maxAgreementAmount == 0) {
            revert ZeroAmount();
        }

        usdc = IERC20(_usdc);
        guardian = _guardian;
        maxAgreementAmount = _maxAgreementAmount;
    }

    function createAgreement(
        address[] calldata recipients,
        uint256[] calldata sharesBps,
        uint256 amount,
        uint256 releaseTime,
        address arbiter
    ) external nonReentrant returns (uint256 id) {
        // Explicit custom pause error requested by spec.
        if (paused()) {
            revert ContractPaused();
        }

        // Require between 1 and 10 recipients inclusive.
        uint256 recipientsLength = recipients.length;
        if (recipientsLength == 0 || recipientsLength > 10) {
            revert TooManyRecipients();
        }

        // Shares list must align with recipients list.
        if (sharesBps.length != recipientsLength) {
            revert InvalidShares();
        }

        // Amount must be positive and not exceed owner-configured cap.
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (amount > maxAgreementAmount) {
            revert AmountExceedsMax();
        }

        // Release deadline must be strictly in the future.
        if (releaseTime <= block.timestamp) {
            revert ReleaseTimeNotFuture();
        }

        // Arbiter may be zero (no disputes), otherwise it must not duplicate creator
        // or any recipient address to avoid role conflicts.
        if (arbiter != address(0) && arbiter == msg.sender) {
            revert DuplicateRecipient();
        }

        uint256 sumShares = 0;

        // Validate recipient addresses and ensure uniqueness.
        for (uint256 i = 0; i < recipientsLength; ++i) {
            address recipient = recipients[i];

            if (recipient == address(0)) {
                revert ZeroAddress();
            }
            if (recipient == msg.sender) {
                revert CreatorIsRecipient();
            }
            if (arbiter != address(0) && recipient == arbiter) {
                revert DuplicateRecipient();
            }

            // O(n^2) duplicate check is acceptable due to max 10 recipients.
            for (uint256 j = i + 1; j < recipientsLength; ++j) {
                if (recipient == recipients[j]) {
                    revert DuplicateRecipient();
                }
            }

            sumShares += sharesBps[i];
        }

        // Shares must sum exactly to 10_000 bps.
        if (sumShares != 10_000) {
            revert InvalidShares();
        }

        // Effects first: register the agreement and accounting before interacting.
        id = ++agreementCount;
        Agreement storage agreement = agreements[id];

        agreement.id = id;
        agreement.creator = msg.sender;
        agreement.arbiter = arbiter;
        agreement.amount = amount;
        agreement.releaseTime = releaseTime;
        agreement.createdAt = block.timestamp;
        agreement.status = AgreementStatus.Funded;

        for (uint256 i = 0; i < recipientsLength; ++i) {
            agreement.recipients.push(recipients[i]);
            agreement.sharesBps.push(sharesBps[i]);
        }

        totalLocked += amount;
        openAgreementCount += 1;

        // Index this agreement for all involved parties.
        _userAgreements[msg.sender].push(id);
        for (uint256 i = 0; i < recipientsLength; ++i) {
            _userAgreements[recipients[i]].push(id);
        }
        if (arbiter != address(0)) {
            _userAgreements[arbiter].push(id);
        }

        // Interaction last: pull USDC from creator into escrow.
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit AgreementCreated(id, msg.sender, arbiter, amount, releaseTime);
    }

    function approveRelease(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];

        if (agreement.creator != msg.sender) {
            revert NotCreator();
        }
        if (agreement.status != AgreementStatus.Funded) {
            revert AgreementNotFunded();
        }

        _creditRecipients(id, AgreementStatus.Released);

        emit Released(id, msg.sender);
    }

    function releaseAfterDeadline(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];

        if (agreement.status == AgreementStatus.Disputed) {
            // Escape hatch: allow anyone to release to recipients after the dispute
            // timeout, protecting against a permanently unresponsive arbiter.
            if (block.timestamp < agreement.releaseTime + DISPUTE_TIMEOUT) {
                revert DisputeTimeoutNotReached();
            }
        } else {
            // Normal case: status must be Funded and the release deadline must have passed.
            if (agreement.status != AgreementStatus.Funded) {
                revert AgreementNotFunded();
            }
            if (block.timestamp < agreement.releaseTime) {
                revert ReleaseTimeNotReached();
            }
        }

        _creditRecipients(id, AgreementStatus.Released);

        emit Released(id, msg.sender);
    }

    function refund(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];

        if (agreement.creator != msg.sender) {
            revert NotCreator();
        }
        if (agreement.status != AgreementStatus.Funded) {
            revert AgreementNotFunded();
        }
        if (block.timestamp >= agreement.releaseTime) {
            revert AlreadyPastReleaseTime();
        }

        uint256 amount = agreement.amount;

        // Move from locked escrow into creator claimable credit.
        totalLocked -= amount;
        totalClaimable += amount;
        claimable[msg.sender] += amount;

        agreement.status = AgreementStatus.Refunded;
        openAgreementCount -= 1;

        emit Refunded(id, msg.sender);
    }

    function raiseDispute(uint256 id) external {
        Agreement storage agreement = agreements[id];

        if (agreement.status == AgreementStatus.Disputed) {
            revert DisputeAlreadyOpen();
        }
        if (agreement.status != AgreementStatus.Funded) {
            revert AgreementNotFunded();
        }

        // A dispute may only be raised while the agreement is still pending — i.e.
        // before its release deadline. Once releaseTime has passed the agreement has
        // matured: anyone may trigger releaseAfterDeadline(), and raising a dispute
        // at that point would only serve to freeze a payment that should already be
        // claimable. Without this guard a recipient could grief by disputing one
        // second after the deadline, converting a permissionless payout into a
        // 30-day freeze.
        if (block.timestamp >= agreement.releaseTime) {
            revert DisputeAfterDeadline();
        }

        bool isCreator = agreement.creator == msg.sender;
        bool isRecipient = _isRecipient(agreement, msg.sender);
        if (!isCreator && !isRecipient) {
            revert NotRecipientOrCreator();
        }

        if (agreement.arbiter == address(0)) {
            revert NoArbiterSet();
        }

        agreement.status = AgreementStatus.Disputed;

        emit DisputeRaised(id, msg.sender);
    }

    function resolveDispute(uint256 id, bool releaseToRecipients) external nonReentrant {
        Agreement storage agreement = agreements[id];

        if (agreement.arbiter != msg.sender) {
            revert NotArbiter();
        }
        if (agreement.status != AgreementStatus.Disputed) {
            revert AgreementNotFunded();
        }

        if (releaseToRecipients) {
            _creditRecipients(id, AgreementStatus.Resolved);
        } else {
            uint256 amount = agreement.amount;

            // Resolve in creator's favor via pull-payment credit.
            totalLocked -= amount;
            totalClaimable += amount;
            claimable[agreement.creator] += amount;

            agreement.status = AgreementStatus.Resolved;
            openAgreementCount -= 1;
        }

        emit DisputeResolved(id, releaseToRecipients);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) {
            revert NothingToClaim();
        }

        // Effects before interaction.
        claimable[msg.sender] = 0;
        totalClaimable -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    function emergencyPause() external {
        if (msg.sender != guardian) {
            revert NotGuardian();
        }
        _pause();
    }

    /// @notice Ownership renouncement is permanently disabled.
    ///         The owner is required to unpause the contract; renouncing while paused
    ///         would permanently lock out new agreement creation with no recovery path.
    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    function unpause() external onlyOwner {
        if (!paused()) {
            revert NotPaused();
        }
        _unpause();
    }

    function setMaxAgreementAmount(uint256 newMax) external onlyOwner {
        if (newMax == 0) {
            revert ZeroAmount();
        }

        uint256 oldMax = maxAgreementAmount;
        maxAgreementAmount = newMax;

        emit MaxAmountUpdated(oldMax, newMax);
    }

    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) {
            revert ZeroAddress();
        }

        address oldGuardian = guardian;
        guardian = newGuardian;

        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    function rescueToken(address token, uint256 amount) external onlyOwner {
        if (token == address(usdc)) {
            revert CannotRescueUSDC();
        }

        IERC20(token).safeTransfer(owner(), amount);
    }

    function solvencyCheck()
        external
        view
        returns (uint256 balance, uint256 locked, uint256 claimable_, bool isSolvent)
    {
        balance = usdc.balanceOf(address(this));
        locked = totalLocked;
        claimable_ = totalClaimable;
        isSolvent = balance >= (locked + claimable_);
    }

    function healthReport()
        external
        view
        returns (uint256 locked, uint256 claimable_, uint256 balance, uint256 openAgreements, bool isPaused)
    {
        locked = totalLocked;
        claimable_ = totalClaimable;
        balance = usdc.balanceOf(address(this));
        openAgreements = openAgreementCount;
        isPaused = paused();
    }

    function getAgreement(uint256 id) external view returns (Agreement memory) {
        return agreements[id];
    }

    function getRecipients(uint256 id) external view returns (address[] memory, uint256[] memory) {
        Agreement storage agreement = agreements[id];
        return (agreement.recipients, agreement.sharesBps);
    }

    function getUserAgreements(address user) external view returns (uint256[] memory) {
        return _userAgreements[user];
    }

    function _creditRecipients(uint256 id, AgreementStatus newStatus) internal {
        Agreement storage agreement = agreements[id];

        uint256 amount = agreement.amount;
        uint256 credited = 0;
        uint256 recipientsLength = agreement.recipients.length;

        for (uint256 i = 0; i < recipientsLength; ++i) {
            uint256 credit = (amount * agreement.sharesBps[i]) / 10_000;

            // Assign all rounding dust to the final recipient so sum(credits) == amount.
            if (i == recipientsLength - 1) {
                credit = amount - credited;
            }

            credited += credit;
            claimable[agreement.recipients[i]] += credit;
            totalClaimable += credit;
        }

        totalLocked -= amount;
        agreement.status = newStatus;
        openAgreementCount -= 1;
    }

    function _isRecipient(Agreement storage agreement, address user) internal view returns (bool) {
        uint256 recipientsLength = agreement.recipients.length;
        for (uint256 i = 0; i < recipientsLength; ++i) {
            if (agreement.recipients[i] == user) {
                return true;
            }
        }
        return false;
    }
}
