// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPledgeManager
 * @notice Interface for the Pledge Manager contract
 */
interface IPledgeManager {
    /// @notice Pledge status enum
    enum PledgeStatus {
        Active,     // Funds escrowed, awaiting resolution
        Resolved,   // Successfully resolved
        Refunded,   // Funds returned to backer
        Cancelled   // Cancelled by backer
    }

    /// @notice Pledge type enum (Phase 1 only supports Flat)
    enum PledgeType {
        Flat,       // Fixed amount
        PerUnit,    // Amount per unit (Phase 4)
        Tiered,     // Tiered rates (Phase 4)
        Conditional // Conditional release (Phase 4)
    }

    /// @notice Pledge data structure
    struct Pledge {
        bytes32 campaignId;
        address backer;
        uint256 escrowedAmount;
        uint256 finalAmount;
        PledgeType pledgeType;
        PledgeStatus status;
        uint256 createdAt;
        uint256 resolvedAt;
        uint256 tokenId;
        string backerName;
    }

    /// @notice Emitted when a pledge is created
    event PledgeCreated(
        bytes32 indexed pledgeId,
        bytes32 indexed campaignId,
        address indexed backer,
        uint256 amount,
        PledgeType pledgeType
    );

    /// @notice Emitted when a pledge is resolved
    event PledgeResolved(
        bytes32 indexed pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    );

    /// @notice Emitted when a pledge is refunded
    event PledgeRefunded(bytes32 indexed pledgeId, uint256 amount);

    /// @notice Emitted when a pledge is cancelled
    event PledgeCancelled(bytes32 indexed pledgeId, uint256 refundedAmount);

    /// @notice Creates a new pledge
    function createPledge(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName
    ) external payable returns (bytes32 pledgeId);

    /// @notice Resolves a single pledge
    function resolvePledge(
        bytes32 pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    ) external;

    /// @notice Batch resolve all pledges for a campaign
    function resolveAllPledges(
        bytes32 campaignId,
        bool milestoneCompleted
    ) external;

    /// @notice Cancels a pledge (if allowed)
    function cancelPledge(bytes32 pledgeId) external;

    /// @notice Gets pledge data
    function getPledge(bytes32 pledgeId) external view returns (Pledge memory);

    /// @notice Gets all pledge IDs for a campaign
    function getCampaignPledges(bytes32 campaignId) external view returns (bytes32[] memory);

    /// @notice Gets all pledge IDs for a backer
    function getBackerPledges(address backer) external view returns (bytes32[] memory);

    /// @notice Checks if a pledge exists
    function pledgeExists(bytes32 pledgeId) external view returns (bool);
}
