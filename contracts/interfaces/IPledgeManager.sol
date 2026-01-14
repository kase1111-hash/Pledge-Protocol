// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPledgeManager
 * @notice Interface for the Pledge Manager contract
 * @dev Phase 4: Supports all pledge types (Flat, PerUnit, Tiered, Conditional)
 */
interface IPledgeManager {
    /// @notice Pledge status enum
    enum PledgeStatus {
        Active,     // Funds escrowed, awaiting resolution
        Resolved,   // Successfully resolved
        Refunded,   // Funds returned to backer
        Cancelled   // Cancelled by backer
    }

    /// @notice Pledge type enum
    enum PledgeType {
        Flat,       // Fixed amount - release proportional to milestone completion
        PerUnit,    // Amount per unit (e.g., $2 per mile completed)
        Tiered,     // Tiered rates (e.g., $1/mile first 10, $2/mile after)
        Conditional // All-or-nothing based on condition evaluation
    }

    /// @notice Tier definition for tiered pledges
    struct Tier {
        uint256 threshold;  // Units at which this tier starts
        uint256 rate;       // Rate per unit in this tier (in wei)
    }

    /// @notice Calculation parameters for advanced pledge types
    struct CalculationParams {
        // Per-unit parameters
        uint256 perUnitAmount;      // Amount per unit (wei)
        string unitField;           // Oracle field containing unit value
        uint256 cap;                // Maximum release amount (0 = no cap)

        // Tiered parameters (encoded as bytes for flexibility)
        bytes tiersData;            // Encoded Tier[] array

        // Conditional parameters
        string conditionField;      // Oracle field to evaluate
        uint8 conditionOperator;    // 0=exists, 1=eq, 2=gt, 3=gte, 4=lt, 5=lte
        uint256 conditionValue;     // Value to compare against
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

    /// @notice Emitted when an advanced pledge is created with calculation params
    event AdvancedPledgeCreated(
        bytes32 indexed pledgeId,
        bytes32 indexed campaignId,
        PledgeType pledgeType,
        bytes calculationData
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

    /// @notice Creates a new flat pledge
    function createPledge(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName
    ) external payable returns (bytes32 pledgeId);

    /// @notice Creates a new pledge with calculation parameters (Phase 4)
    function createAdvancedPledge(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName,
        CalculationParams calldata params
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

    /// @notice Gets calculation parameters for a pledge
    function getCalculationParams(bytes32 pledgeId) external view returns (CalculationParams memory);

    /// @notice Gets all pledge IDs for a campaign
    function getCampaignPledges(bytes32 campaignId) external view returns (bytes32[] memory);

    /// @notice Gets all pledge IDs for a backer
    function getBackerPledges(address backer) external view returns (bytes32[] memory);

    /// @notice Checks if a pledge exists
    function pledgeExists(bytes32 pledgeId) external view returns (bool);
}
