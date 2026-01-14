// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEscrowVault
 * @notice Interface for the Escrow Vault contract
 */
interface IEscrowVault {
    /// @notice Emitted when funds are deposited
    event Deposited(
        bytes32 indexed campaignId,
        bytes32 indexed pledgeId,
        address indexed backer,
        uint256 amount
    );

    /// @notice Emitted when funds are released to beneficiary
    event Released(
        bytes32 indexed campaignId,
        bytes32 indexed pledgeId,
        address indexed beneficiary,
        uint256 amount
    );

    /// @notice Emitted when funds are refunded to backer
    event Refunded(
        bytes32 indexed campaignId,
        bytes32 indexed pledgeId,
        address indexed backer,
        uint256 amount
    );

    /// @notice Deposits funds for a pledge
    function deposit(
        bytes32 campaignId,
        bytes32 pledgeId,
        address backer
    ) external payable;

    /// @notice Releases funds to the beneficiary
    function release(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 amount
    ) external;

    /// @notice Refunds funds to the backer
    function refund(
        bytes32 campaignId,
        bytes32 pledgeId
    ) external;

    /// @notice Partial release and refund for per-unit pledges
    function partialRelease(
        bytes32 campaignId,
        bytes32 pledgeId,
        uint256 releaseAmount,
        uint256 refundAmount
    ) external;

    /// @notice Gets the total balance for a campaign
    function getCampaignBalance(bytes32 campaignId) external view returns (uint256);

    /// @notice Gets the balance for a specific pledge
    function getPledgeBalance(bytes32 pledgeId) external view returns (uint256);

    /// @notice Gets the backer address for a pledge
    function getPledgeBacker(bytes32 pledgeId) external view returns (address);
}
