// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICampaignRegistry.sol";

/**
 * @title CampaignRegistry
 * @notice Manages campaign lifecycle for Pledge Protocol
 * @dev Phase 1 implementation with basic campaign management
 */
contract CampaignRegistry is ICampaignRegistry, AccessControl, ReentrancyGuard {
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    /// @notice Mapping of campaign ID to campaign data
    mapping(bytes32 => Campaign) private campaigns;

    /// @notice Mapping of creator address to their campaign IDs
    mapping(address => bytes32[]) private creatorCampaigns;

    /// @notice Array of all campaign IDs
    bytes32[] private allCampaigns;

    /// @notice Nonce for generating unique campaign IDs
    uint256 private campaignNonce;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROTOCOL_ROLE, msg.sender);
    }

    /// @notice Creates a new campaign
    function createCampaign(
        address beneficiary,
        uint256 pledgeWindowStart,
        uint256 pledgeWindowEnd,
        uint256 resolutionDeadline,
        uint256 minimumPledge,
        uint256 maximumPledge,
        string calldata metadataUri
    ) external returns (bytes32 campaignId) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(pledgeWindowStart < pledgeWindowEnd, "Invalid pledge window");
        require(pledgeWindowEnd < resolutionDeadline, "Resolution must be after pledge window");
        require(bytes(metadataUri).length > 0, "Metadata URI required");

        campaignId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                campaignNonce++
            )
        );

        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            beneficiary: beneficiary,
            pledgeWindowStart: pledgeWindowStart,
            pledgeWindowEnd: pledgeWindowEnd,
            resolutionDeadline: resolutionDeadline,
            status: CampaignStatus.Draft,
            totalEscrowed: 0,
            totalReleased: 0,
            totalRefunded: 0,
            pledgeCount: 0,
            minimumPledge: minimumPledge,
            maximumPledge: maximumPledge,
            metadataUri: metadataUri
        });

        creatorCampaigns[msg.sender].push(campaignId);
        allCampaigns.push(campaignId);

        emit CampaignCreated(campaignId, msg.sender, beneficiary, metadataUri);
    }

    /// @notice Activates a draft campaign
    function activateCampaign(bytes32 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];

        require(campaign.creator != address(0), "Campaign does not exist");
        require(campaign.creator == msg.sender, "Only creator can activate");
        require(campaign.status == CampaignStatus.Draft, "Campaign must be in draft");
        require(block.timestamp < campaign.pledgeWindowEnd, "Pledge window already ended");

        CampaignStatus oldStatus = campaign.status;
        campaign.status = CampaignStatus.Active;

        emit CampaignStatusChanged(campaignId, oldStatus, CampaignStatus.Active);
        emit CampaignActivated(campaignId, block.timestamp);
    }

    /// @notice Closes the pledge window
    function closePledgeWindow(bytes32 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];

        require(campaign.creator != address(0), "Campaign does not exist");
        require(
            campaign.creator == msg.sender || hasRole(PROTOCOL_ROLE, msg.sender),
            "Not authorized"
        );
        require(campaign.status == CampaignStatus.Active, "Campaign must be active");

        CampaignStatus oldStatus = campaign.status;
        campaign.status = CampaignStatus.PledgingClosed;

        emit CampaignStatusChanged(campaignId, oldStatus, CampaignStatus.PledgingClosed);
    }

    /// @notice Resolves a campaign (called by PledgeManager)
    function resolveCampaign(
        bytes32 campaignId,
        uint256 totalReleased,
        uint256 totalRefunded
    ) external onlyRole(PROTOCOL_ROLE) {
        Campaign storage campaign = campaigns[campaignId];

        require(campaign.creator != address(0), "Campaign does not exist");
        require(
            campaign.status == CampaignStatus.Active ||
            campaign.status == CampaignStatus.PledgingClosed,
            "Invalid campaign status"
        );

        CampaignStatus oldStatus = campaign.status;
        campaign.status = CampaignStatus.Resolved;
        campaign.totalReleased = totalReleased;
        campaign.totalRefunded = totalRefunded;

        emit CampaignStatusChanged(campaignId, oldStatus, CampaignStatus.Resolved);
        emit CampaignResolved(campaignId, totalReleased, totalRefunded);
    }

    /// @notice Cancels a campaign
    function cancelCampaign(bytes32 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];

        require(campaign.creator != address(0), "Campaign does not exist");
        require(campaign.creator == msg.sender, "Only creator can cancel");
        require(
            campaign.status == CampaignStatus.Draft ||
            campaign.status == CampaignStatus.Active,
            "Cannot cancel in current status"
        );

        CampaignStatus oldStatus = campaign.status;
        campaign.status = CampaignStatus.Cancelled;

        emit CampaignStatusChanged(campaignId, oldStatus, CampaignStatus.Cancelled);
        emit CampaignCancelled(campaignId, campaign.totalEscrowed);
    }

    /// @notice Gets campaign data
    function getCampaign(bytes32 campaignId) external view returns (Campaign memory) {
        require(campaigns[campaignId].creator != address(0), "Campaign does not exist");
        return campaigns[campaignId];
    }

    /// @notice Checks if a campaign exists
    function campaignExists(bytes32 campaignId) external view returns (bool) {
        return campaigns[campaignId].creator != address(0);
    }

    /// @notice Checks if pledging is currently allowed
    function isPledgingOpen(bytes32 campaignId) external view returns (bool) {
        Campaign storage campaign = campaigns[campaignId];

        if (campaign.status != CampaignStatus.Active) {
            return false;
        }

        if (block.timestamp < campaign.pledgeWindowStart) {
            return false;
        }

        if (block.timestamp > campaign.pledgeWindowEnd) {
            return false;
        }

        return true;
    }

    /// @notice Updates escrow totals (called by EscrowVault)
    function updateEscrowTotals(
        bytes32 campaignId,
        uint256 escrowed,
        uint256 released,
        uint256 refunded
    ) external onlyRole(PROTOCOL_ROLE) {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign does not exist");

        campaign.totalEscrowed = escrowed;
        campaign.totalReleased = released;
        campaign.totalRefunded = refunded;
    }

    /// @notice Increments pledge count
    function incrementPledgeCount(bytes32 campaignId) external onlyRole(PROTOCOL_ROLE) {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.creator != address(0), "Campaign does not exist");
        campaign.pledgeCount++;
    }

    /// @notice Gets all campaigns for a creator
    function getCreatorCampaigns(address creator) external view returns (bytes32[] memory) {
        return creatorCampaigns[creator];
    }

    /// @notice Gets total number of campaigns
    function getCampaignCount() external view returns (uint256) {
        return allCampaigns.length;
    }

    /// @notice Gets campaign ID by index
    function getCampaignAtIndex(uint256 index) external view returns (bytes32) {
        require(index < allCampaigns.length, "Index out of bounds");
        return allCampaigns[index];
    }

    /// @notice Grants protocol role to an address
    function grantProtocolRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROTOCOL_ROLE, account);
    }

    /// @notice Gets the beneficiary for a campaign
    function getBeneficiary(bytes32 campaignId) external view returns (address) {
        require(campaigns[campaignId].creator != address(0), "Campaign does not exist");
        return campaigns[campaignId].beneficiary;
    }
}
