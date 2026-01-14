// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ICampaignRegistry
 * @notice Interface for the Campaign Registry contract
 */
interface ICampaignRegistry {
    /// @notice Campaign status enum
    enum CampaignStatus {
        Draft,          // Not yet activated
        Active,         // Accepting pledges
        PledgingClosed, // Event period, no new pledges
        Resolved,       // Funds distributed
        Expired,        // Deadline passed without resolution
        Cancelled       // Manually cancelled
    }

    /// @notice Campaign data structure
    struct Campaign {
        address creator;
        address beneficiary;
        uint256 pledgeWindowStart;
        uint256 pledgeWindowEnd;
        uint256 resolutionDeadline;
        CampaignStatus status;
        uint256 totalEscrowed;
        uint256 totalReleased;
        uint256 totalRefunded;
        uint256 pledgeCount;
        uint256 minimumPledge;
        uint256 maximumPledge; // 0 = no maximum
        string metadataUri;
    }

    /// @notice Emitted when a campaign is created
    event CampaignCreated(
        bytes32 indexed campaignId,
        address indexed creator,
        address indexed beneficiary,
        string metadataUri
    );

    /// @notice Emitted when a campaign is activated
    event CampaignActivated(bytes32 indexed campaignId, uint256 timestamp);

    /// @notice Emitted when a campaign status changes
    event CampaignStatusChanged(
        bytes32 indexed campaignId,
        CampaignStatus oldStatus,
        CampaignStatus newStatus
    );

    /// @notice Emitted when a campaign is resolved
    event CampaignResolved(
        bytes32 indexed campaignId,
        uint256 totalReleased,
        uint256 totalRefunded
    );

    /// @notice Emitted when a campaign is cancelled
    event CampaignCancelled(bytes32 indexed campaignId, uint256 refundedAmount);

    /// @notice Creates a new campaign
    function createCampaign(
        address beneficiary,
        uint256 pledgeWindowStart,
        uint256 pledgeWindowEnd,
        uint256 resolutionDeadline,
        uint256 minimumPledge,
        uint256 maximumPledge,
        string calldata metadataUri
    ) external returns (bytes32 campaignId);

    /// @notice Activates a draft campaign
    function activateCampaign(bytes32 campaignId) external;

    /// @notice Closes the pledge window
    function closePledgeWindow(bytes32 campaignId) external;

    /// @notice Resolves a campaign (called by PledgeManager)
    function resolveCampaign(
        bytes32 campaignId,
        uint256 totalReleased,
        uint256 totalRefunded
    ) external;

    /// @notice Cancels a campaign
    function cancelCampaign(bytes32 campaignId) external;

    /// @notice Gets campaign data
    function getCampaign(bytes32 campaignId) external view returns (Campaign memory);

    /// @notice Checks if a campaign exists
    function campaignExists(bytes32 campaignId) external view returns (bool);

    /// @notice Checks if pledging is currently allowed
    function isPledgingOpen(bytes32 campaignId) external view returns (bool);

    /// @notice Updates escrow totals (called by EscrowVault)
    function updateEscrowTotals(
        bytes32 campaignId,
        uint256 escrowed,
        uint256 released,
        uint256 refunded
    ) external;

    /// @notice Increments pledge count
    function incrementPledgeCount(bytes32 campaignId) external;
}
