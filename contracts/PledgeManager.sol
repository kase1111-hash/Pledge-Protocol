// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPledgeManager.sol";
import "./interfaces/ICampaignRegistry.sol";
import "./interfaces/IEscrowVault.sol";
import "./interfaces/IOracleRegistry.sol";

/**
 * @title PledgeManager
 * @notice Manages pledge creation, resolution, and cancellation
 * @dev Phase 4: Supports all pledge types (Flat, PerUnit, Tiered, Conditional)
 */
contract PledgeManager is IPledgeManager, AccessControl, ReentrancyGuard {
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    /// @notice Reference contracts
    ICampaignRegistry public campaignRegistry;
    IEscrowVault public escrowVault;
    IOracleRegistry public oracleRegistry;

    /// @notice Mapping of pledge ID to pledge data
    mapping(bytes32 => Pledge) private pledges;

    /// @notice Mapping of pledge ID to calculation parameters
    mapping(bytes32 => CalculationParams) private pledgeCalculationParams;

    /// @notice Mapping of campaign ID to array of pledge IDs
    mapping(bytes32 => bytes32[]) private campaignPledges;

    /// @notice Mapping of backer address to array of pledge IDs
    mapping(address => bytes32[]) private backerPledges;

    /// @notice Nonce for generating unique pledge IDs
    uint256 private pledgeNonce;

    /// @notice Token ID counter
    uint256 private tokenIdCounter;

    constructor(
        address _campaignRegistry,
        address _escrowVault,
        address _oracleRegistry
    ) {
        require(_campaignRegistry != address(0), "Invalid registry address");
        require(_escrowVault != address(0), "Invalid escrow address");
        require(_oracleRegistry != address(0), "Invalid oracle address");

        campaignRegistry = ICampaignRegistry(_campaignRegistry);
        escrowVault = IEscrowVault(_escrowVault);
        oracleRegistry = IOracleRegistry(_oracleRegistry);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROTOCOL_ROLE, msg.sender);
        _grantRole(RESOLVER_ROLE, msg.sender);
    }

    /// @notice Creates a new pledge (flat pledges or simple advanced pledges)
    function createPledge(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName
    ) external payable nonReentrant returns (bytes32 pledgeId) {
        require(msg.value > 0, "Must send funds");
        require(campaignRegistry.isPledgingOpen(campaignId), "Pledging not open");

        ICampaignRegistry.Campaign memory campaign = campaignRegistry.getCampaign(campaignId);

        require(msg.value >= campaign.minimumPledge, "Below minimum pledge");
        if (campaign.maximumPledge > 0) {
            require(msg.value <= campaign.maximumPledge, "Exceeds maximum pledge");
        }

        pledgeId = _createPledgeInternal(campaignId, pledgeType, backerName);

        emit PledgeCreated(pledgeId, campaignId, msg.sender, msg.value, pledgeType);
    }

    /// @notice Creates a new pledge with calculation parameters (Phase 4)
    function createAdvancedPledge(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName,
        CalculationParams calldata params
    ) external payable nonReentrant returns (bytes32 pledgeId) {
        require(msg.value > 0, "Must send funds");
        require(campaignRegistry.isPledgingOpen(campaignId), "Pledging not open");
        require(pledgeType != PledgeType.Flat, "Use createPledge for flat pledges");

        ICampaignRegistry.Campaign memory campaign = campaignRegistry.getCampaign(campaignId);

        require(msg.value >= campaign.minimumPledge, "Below minimum pledge");
        if (campaign.maximumPledge > 0) {
            require(msg.value <= campaign.maximumPledge, "Exceeds maximum pledge");
        }

        // Validate calculation parameters based on pledge type
        _validateCalculationParams(pledgeType, params);

        pledgeId = _createPledgeInternal(campaignId, pledgeType, backerName);

        // Store calculation parameters
        pledgeCalculationParams[pledgeId] = params;

        // Emit advanced pledge event with encoded params
        emit AdvancedPledgeCreated(
            pledgeId,
            campaignId,
            pledgeType,
            abi.encode(params)
        );
    }

    /// @notice Internal function to create a pledge
    function _createPledgeInternal(
        bytes32 campaignId,
        PledgeType pledgeType,
        string calldata backerName
    ) private returns (bytes32 pledgeId) {
        pledgeId = keccak256(
            abi.encodePacked(
                msg.sender,
                campaignId,
                block.timestamp,
                pledgeNonce++
            )
        );

        tokenIdCounter++;

        pledges[pledgeId] = Pledge({
            campaignId: campaignId,
            backer: msg.sender,
            escrowedAmount: msg.value,
            finalAmount: 0,
            pledgeType: pledgeType,
            status: PledgeStatus.Active,
            createdAt: block.timestamp,
            resolvedAt: 0,
            tokenId: tokenIdCounter,
            backerName: backerName
        });

        campaignPledges[campaignId].push(pledgeId);
        backerPledges[msg.sender].push(pledgeId);

        // Deposit to escrow
        escrowVault.deposit{value: msg.value}(campaignId, pledgeId, msg.sender);

        // Update campaign pledge count
        campaignRegistry.incrementPledgeCount(campaignId);
    }

    /// @notice Validates calculation parameters for advanced pledge types
    function _validateCalculationParams(
        PledgeType pledgeType,
        CalculationParams calldata params
    ) private pure {
        if (pledgeType == PledgeType.PerUnit) {
            require(params.perUnitAmount > 0, "Per-unit amount must be positive");
            require(bytes(params.unitField).length > 0, "Unit field required");
        } else if (pledgeType == PledgeType.Tiered) {
            require(params.tiersData.length > 0, "Tiers data required");
            // Tiers will be decoded and validated off-chain before resolution
        } else if (pledgeType == PledgeType.Conditional) {
            require(bytes(params.conditionField).length > 0, "Condition field required");
            require(params.conditionOperator <= 5, "Invalid operator");
        }
    }

    /// @notice Resolves a single pledge
    function resolvePledge(
        bytes32 pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    ) external onlyRole(RESOLVER_ROLE) nonReentrant {
        Pledge storage pledge = pledges[pledgeId];

        require(pledge.backer != address(0), "Pledge does not exist");
        require(pledge.status == PledgeStatus.Active, "Pledge not active");
        require(
            releaseAmount + refundAmount == pledge.escrowedAmount,
            "Amounts must equal escrow"
        );

        pledge.status = PledgeStatus.Resolved;
        pledge.finalAmount = releaseAmount;
        pledge.resolvedAt = block.timestamp;

        // Execute escrow operations
        if (releaseAmount > 0 && refundAmount > 0) {
            escrowVault.partialRelease(
                pledge.campaignId,
                pledgeId,
                releaseAmount,
                refundAmount
            );
        } else if (releaseAmount > 0) {
            escrowVault.release(pledge.campaignId, pledgeId, releaseAmount);
        } else {
            escrowVault.refund(pledge.campaignId, pledgeId);
        }

        emit PledgeResolved(pledgeId, releaseAmount, refundAmount);
    }

    /// @notice Batch resolve all pledges for a campaign
    function resolveAllPledges(
        bytes32 campaignId,
        bool milestoneCompleted
    ) external onlyRole(RESOLVER_ROLE) nonReentrant {
        bytes32[] memory pledgeIds = campaignPledges[campaignId];

        uint256 totalReleased = 0;
        uint256 totalRefunded = 0;

        for (uint256 i = 0; i < pledgeIds.length; i++) {
            bytes32 pledgeId = pledgeIds[i];
            Pledge storage pledge = pledges[pledgeId];

            if (pledge.status != PledgeStatus.Active) {
                continue;
            }

            pledge.resolvedAt = block.timestamp;

            if (milestoneCompleted) {
                // Release full amount to beneficiary
                pledge.status = PledgeStatus.Resolved;
                pledge.finalAmount = pledge.escrowedAmount;
                escrowVault.release(campaignId, pledgeId, pledge.escrowedAmount);
                totalReleased += pledge.escrowedAmount;

                emit PledgeResolved(pledgeId, pledge.escrowedAmount, 0);
            } else {
                // Refund full amount to backer
                pledge.status = PledgeStatus.Refunded;
                pledge.finalAmount = 0;
                escrowVault.refund(campaignId, pledgeId);
                totalRefunded += pledge.escrowedAmount;

                emit PledgeRefunded(pledgeId, pledge.escrowedAmount);
            }
        }

        // Update campaign as resolved
        campaignRegistry.resolveCampaign(campaignId, totalReleased, totalRefunded);
    }

    /// @notice Cancels a pledge (if allowed)
    function cancelPledge(bytes32 pledgeId) external nonReentrant {
        Pledge storage pledge = pledges[pledgeId];

        require(pledge.backer != address(0), "Pledge does not exist");
        require(pledge.backer == msg.sender, "Only backer can cancel");
        require(pledge.status == PledgeStatus.Active, "Pledge not active");

        // Check if campaign allows cancellation
        ICampaignRegistry.Campaign memory campaign = campaignRegistry.getCampaign(pledge.campaignId);

        // Can only cancel during pledge window
        require(
            block.timestamp >= campaign.pledgeWindowStart &&
            block.timestamp <= campaign.pledgeWindowEnd,
            "Cannot cancel outside pledge window"
        );

        uint256 refundAmount = pledge.escrowedAmount;
        pledge.status = PledgeStatus.Cancelled;
        pledge.resolvedAt = block.timestamp;

        escrowVault.refund(pledge.campaignId, pledgeId);

        emit PledgeCancelled(pledgeId, refundAmount);
    }

    /// @notice Gets pledge data
    function getPledge(bytes32 pledgeId) external view returns (Pledge memory) {
        require(pledges[pledgeId].backer != address(0), "Pledge does not exist");
        return pledges[pledgeId];
    }

    /// @notice Gets calculation parameters for a pledge
    function getCalculationParams(bytes32 pledgeId) external view returns (CalculationParams memory) {
        require(pledges[pledgeId].backer != address(0), "Pledge does not exist");
        return pledgeCalculationParams[pledgeId];
    }

    /// @notice Gets all pledge IDs for a campaign
    function getCampaignPledges(bytes32 campaignId) external view returns (bytes32[] memory) {
        return campaignPledges[campaignId];
    }

    /// @notice Gets all pledge IDs for a backer
    function getBackerPledges(address backer) external view returns (bytes32[] memory) {
        return backerPledges[backer];
    }

    /// @notice Checks if a pledge exists
    function pledgeExists(bytes32 pledgeId) external view returns (bool) {
        return pledges[pledgeId].backer != address(0);
    }

    /// @notice Gets the total escrowed amount for a campaign
    function getCampaignTotalEscrowed(bytes32 campaignId) external view returns (uint256) {
        bytes32[] memory pledgeIds = campaignPledges[campaignId];
        uint256 total = 0;

        for (uint256 i = 0; i < pledgeIds.length; i++) {
            Pledge storage pledge = pledges[pledgeIds[i]];
            if (pledge.status == PledgeStatus.Active) {
                total += pledge.escrowedAmount;
            }
        }

        return total;
    }

    /// @notice Grants protocol role to an address
    function grantProtocolRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROTOCOL_ROLE, account);
    }

    /// @notice Grants resolver role to an address
    function grantResolverRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(RESOLVER_ROLE, account);
    }

    /// @notice Updates contract references
    function setContracts(
        address _campaignRegistry,
        address _escrowVault,
        address _oracleRegistry
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_campaignRegistry != address(0)) {
            campaignRegistry = ICampaignRegistry(_campaignRegistry);
        }
        if (_escrowVault != address(0)) {
            escrowVault = IEscrowVault(_escrowVault);
        }
        if (_oracleRegistry != address(0)) {
            oracleRegistry = IOracleRegistry(_oracleRegistry);
        }
    }
}
