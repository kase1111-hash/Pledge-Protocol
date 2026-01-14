// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IEscrowVault.sol";
import "./interfaces/ICampaignRegistry.sol";

/**
 * @title EscrowVault
 * @notice Manages escrowed funds for pledges
 * @dev Phase 1 implementation with deposit, release, and refund operations
 */
contract EscrowVault is IEscrowVault, AccessControl, ReentrancyGuard {
    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");

    /// @notice Reference to the CampaignRegistry contract
    ICampaignRegistry public campaignRegistry;

    /// @notice Pledge escrow data
    struct PledgeEscrow {
        bytes32 campaignId;
        address backer;
        uint256 amount;
        bool released;
        bool refunded;
    }

    /// @notice Mapping of campaign ID to total escrowed balance
    mapping(bytes32 => uint256) private campaignBalances;

    /// @notice Mapping of pledge ID to escrow data
    mapping(bytes32 => PledgeEscrow) private pledgeEscrows;

    /// @notice Mapping of campaign ID to array of pledge IDs
    mapping(bytes32 => bytes32[]) private campaignPledgeIds;

    constructor(address _campaignRegistry) {
        require(_campaignRegistry != address(0), "Invalid registry address");
        campaignRegistry = ICampaignRegistry(_campaignRegistry);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROTOCOL_ROLE, msg.sender);
    }

    /// @notice Deposits funds for a pledge
    function deposit(
        bytes32 campaignId,
        bytes32 pledgeId,
        address backer
    ) external payable onlyRole(PROTOCOL_ROLE) nonReentrant {
        require(msg.value > 0, "Must deposit funds");
        require(backer != address(0), "Invalid backer address");
        require(pledgeEscrows[pledgeId].backer == address(0), "Pledge already exists");
        require(campaignRegistry.campaignExists(campaignId), "Campaign does not exist");

        pledgeEscrows[pledgeId] = PledgeEscrow({
            campaignId: campaignId,
            backer: backer,
            amount: msg.value,
            released: false,
            refunded: false
        });

        campaignBalances[campaignId] += msg.value;
        campaignPledgeIds[campaignId].push(pledgeId);

        emit Deposited(campaignId, pledgeId, backer, msg.value);
    }

    /// @notice Releases funds to the beneficiary
    function release(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 amount
    ) external onlyRole(PROTOCOL_ROLE) nonReentrant {
        PledgeEscrow storage escrow = pledgeEscrows[pledgeId];

        require(escrow.backer != address(0), "Pledge does not exist");
        require(escrow.campaignId == campaignId, "Campaign mismatch");
        require(!escrow.released && !escrow.refunded, "Already processed");
        require(amount <= escrow.amount, "Amount exceeds escrow");

        address beneficiary = campaignRegistry.getBeneficiary(campaignId);
        require(beneficiary != address(0), "Invalid beneficiary");

        escrow.released = true;
        campaignBalances[campaignId] -= amount;

        (bool success, ) = beneficiary.call{value: amount}("");
        require(success, "Transfer failed");

        emit Released(campaignId, pledgeId, beneficiary, amount);
    }

    /// @notice Refunds funds to the backer
    function refund(
        bytes32 campaignId,
        bytes32 pledgeId
    ) external onlyRole(PROTOCOL_ROLE) nonReentrant {
        PledgeEscrow storage escrow = pledgeEscrows[pledgeId];

        require(escrow.backer != address(0), "Pledge does not exist");
        require(escrow.campaignId == campaignId, "Campaign mismatch");
        require(!escrow.released && !escrow.refunded, "Already processed");

        uint256 amount = escrow.amount;
        address backer = escrow.backer;

        escrow.refunded = true;
        campaignBalances[campaignId] -= amount;

        (bool success, ) = backer.call{value: amount}("");
        require(success, "Transfer failed");

        emit Refunded(campaignId, pledgeId, backer, amount);
    }

    /// @notice Partial release and refund for per-unit pledges
    function partialRelease(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    ) external onlyRole(PROTOCOL_ROLE) nonReentrant {
        PledgeEscrow storage escrow = pledgeEscrows[pledgeId];

        require(escrow.backer != address(0), "Pledge does not exist");
        require(escrow.campaignId == campaignId, "Campaign mismatch");
        require(!escrow.released && !escrow.refunded, "Already processed");
        require(releaseAmount + refundAmount == escrow.amount, "Amounts must equal escrow");

        address beneficiary = campaignRegistry.getBeneficiary(campaignId);
        require(beneficiary != address(0), "Invalid beneficiary");

        escrow.released = true;
        campaignBalances[campaignId] -= escrow.amount;

        // Release to beneficiary
        if (releaseAmount > 0) {
            (bool successRelease, ) = beneficiary.call{value: releaseAmount}("");
            require(successRelease, "Release transfer failed");
            emit Released(campaignId, pledgeId, beneficiary, releaseAmount);
        }

        // Refund to backer
        if (refundAmount > 0) {
            (bool successRefund, ) = escrow.backer.call{value: refundAmount}("");
            require(successRefund, "Refund transfer failed");
            emit Refunded(campaignId, pledgeId, escrow.backer, refundAmount);
        }
    }

    /// @notice Gets the total balance for a campaign
    function getCampaignBalance(bytes32 campaignId) external view returns (uint256) {
        return campaignBalances[campaignId];
    }

    /// @notice Gets the balance for a specific pledge
    function getPledgeBalance(bytes32 pledgeId) external view returns (uint256) {
        PledgeEscrow storage escrow = pledgeEscrows[pledgeId];
        if (escrow.released || escrow.refunded) {
            return 0;
        }
        return escrow.amount;
    }

    /// @notice Gets the backer address for a pledge
    function getPledgeBacker(bytes32 pledgeId) external view returns (address) {
        return pledgeEscrows[pledgeId].backer;
    }

    /// @notice Gets all pledge IDs for a campaign
    function getCampaignPledgeIds(bytes32 campaignId) external view returns (bytes32[] memory) {
        return campaignPledgeIds[campaignId];
    }

    /// @notice Gets escrow details for a pledge
    function getEscrowDetails(bytes32 pledgeId) external view returns (
        bytes32 campaignId,
        address backer,
        uint256 amount,
        bool released,
        bool refunded
    ) {
        PledgeEscrow storage escrow = pledgeEscrows[pledgeId];
        return (
            escrow.campaignId,
            escrow.backer,
            escrow.amount,
            escrow.released,
            escrow.refunded
        );
    }

    /// @notice Grants protocol role to an address
    function grantProtocolRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PROTOCOL_ROLE, account);
    }

    /// @notice Updates the campaign registry address
    function setCampaignRegistry(address _campaignRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_campaignRegistry != address(0), "Invalid registry address");
        campaignRegistry = ICampaignRegistry(_campaignRegistry);
    }
}
