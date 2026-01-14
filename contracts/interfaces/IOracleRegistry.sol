// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IOracleRegistry
 * @notice Interface for the Oracle Registry contract
 */
interface IOracleRegistry {
    /// @notice Oracle type enum
    enum OracleType {
        Attestation, // Manual attestation by trusted party
        API,         // External API (Phase 2)
        Aggregator   // Multiple sources (Phase 2)
    }

    /// @notice Attestation data structure
    struct Attestation {
        bytes32 campaignId;
        bytes32 milestoneId;
        bool completed;
        uint256 value;       // Optional numeric value (e.g., miles completed)
        string evidenceUri;
        string notes;
        address attestor;
        uint256 timestamp;
        bytes signature;
    }

    /// @notice Oracle configuration
    struct Oracle {
        bytes32 oracleId;
        string name;
        OracleType oracleType;
        address attestor;        // For attestation oracles
        bool active;
        uint256 createdAt;
    }

    /// @notice Emitted when an oracle is registered
    event OracleRegistered(
        bytes32 indexed oracleId,
        address indexed attestor,
        string name,
        OracleType oracleType
    );

    /// @notice Emitted when an attestation is submitted
    event AttestationSubmitted(
        bytes32 indexed oracleId,
        bytes32 indexed campaignId,
        bytes32 indexed milestoneId,
        bool completed,
        uint256 value
    );

    /// @notice Emitted when an oracle is deactivated
    event OracleDeactivated(bytes32 indexed oracleId);

    /// @notice Registers a new oracle
    function registerOracle(
        address attestor,
        string calldata name,
        OracleType oracleType
    ) external returns (bytes32 oracleId);

    /// @notice Submits an attestation
    function submitAttestation(
        bytes32 campaignId,
        bytes32 milestoneId,
        bool completed,
        uint256 value,
        string calldata evidenceUri,
        string calldata notes,
        bytes calldata signature
    ) external;

    /// @notice Gets an attestation
    function getAttestation(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (Attestation memory);

    /// @notice Checks if a milestone has been attested
    function isAttested(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (bool);

    /// @notice Gets milestone completion status
    function getMilestoneStatus(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (bool completed, uint256 value);

    /// @notice Gets oracle data
    function getOracle(bytes32 oracleId) external view returns (Oracle memory);

    /// @notice Deactivates an oracle
    function deactivateOracle(bytes32 oracleId) external;

    /// @notice Checks if an address is an authorized attestor
    function isAuthorizedAttestor(bytes32 oracleId, address attestor) external view returns (bool);
}
