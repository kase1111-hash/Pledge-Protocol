// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/IOracleRegistry.sol";

/**
 * @title OracleRegistry
 * @notice Manages oracle registration and attestations
 * @dev Phase 1 implementation with manual attestation only
 */
contract OracleRegistry is IOracleRegistry, AccessControl {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant ORACLE_ADMIN_ROLE = keccak256("ORACLE_ADMIN_ROLE");

    /// @notice Mapping of oracle ID to oracle data
    mapping(bytes32 => Oracle) private oracles;

    /// @notice Mapping of attestor address to oracle ID
    mapping(address => bytes32) private attestorToOracle;

    /// @notice Mapping of campaign+milestone to attestation
    mapping(bytes32 => mapping(bytes32 => Attestation)) private attestations;

    /// @notice Nonce for generating unique oracle IDs
    uint256 private oracleNonce;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ADMIN_ROLE, msg.sender);
    }

    /// @notice Registers a new oracle
    function registerOracle(
        address attestor,
        string calldata name,
        OracleType oracleType
    ) external onlyRole(ORACLE_ADMIN_ROLE) returns (bytes32 oracleId) {
        require(attestor != address(0), "Invalid attestor address");
        require(bytes(name).length > 0, "Name required");
        require(attestorToOracle[attestor] == bytes32(0), "Attestor already registered");

        // Phase 1: Only attestation oracles supported
        require(oracleType == OracleType.Attestation, "Only attestation oracles in Phase 1");

        oracleId = keccak256(
            abi.encodePacked(
                attestor,
                name,
                block.timestamp,
                oracleNonce++
            )
        );

        oracles[oracleId] = Oracle({
            oracleId: oracleId,
            name: name,
            oracleType: oracleType,
            attestor: attestor,
            active: true,
            createdAt: block.timestamp
        });

        attestorToOracle[attestor] = oracleId;

        emit OracleRegistered(oracleId, attestor, name, oracleType);
    }

    /// @notice Submits an attestation
    function submitAttestation(
        bytes32 campaignId,
        bytes32 milestoneId,
        bool completed,
        uint256 value,
        string calldata evidenceUri,
        string calldata notes,
        bytes calldata signature
    ) external {
        bytes32 oracleId = attestorToOracle[msg.sender];
        require(oracleId != bytes32(0), "Not a registered attestor");

        Oracle storage oracle = oracles[oracleId];
        require(oracle.active, "Oracle not active");

        // Verify no existing attestation
        require(
            attestations[campaignId][milestoneId].timestamp == 0,
            "Attestation already exists"
        );

        // Verify signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                campaignId,
                milestoneId,
                completed,
                value,
                evidenceUri
            )
        );

        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        require(signer == msg.sender, "Invalid signature");

        attestations[campaignId][milestoneId] = Attestation({
            campaignId: campaignId,
            milestoneId: milestoneId,
            completed: completed,
            value: value,
            evidenceUri: evidenceUri,
            notes: notes,
            attestor: msg.sender,
            timestamp: block.timestamp,
            signature: signature
        });

        emit AttestationSubmitted(oracleId, campaignId, milestoneId, completed, value);
    }

    /// @notice Gets an attestation
    function getAttestation(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (Attestation memory) {
        return attestations[campaignId][milestoneId];
    }

    /// @notice Checks if a milestone has been attested
    function isAttested(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (bool) {
        return attestations[campaignId][milestoneId].timestamp > 0;
    }

    /// @notice Gets milestone completion status
    function getMilestoneStatus(
        bytes32 campaignId,
        bytes32 milestoneId
    ) external view returns (bool completed, uint256 value) {
        Attestation storage att = attestations[campaignId][milestoneId];
        return (att.completed, att.value);
    }

    /// @notice Gets oracle data
    function getOracle(bytes32 oracleId) external view returns (Oracle memory) {
        require(oracles[oracleId].createdAt > 0, "Oracle does not exist");
        return oracles[oracleId];
    }

    /// @notice Gets oracle by attestor address
    function getOracleByAttestor(address attestor) external view returns (Oracle memory) {
        bytes32 oracleId = attestorToOracle[attestor];
        require(oracleId != bytes32(0), "Attestor not registered");
        return oracles[oracleId];
    }

    /// @notice Deactivates an oracle
    function deactivateOracle(bytes32 oracleId) external onlyRole(ORACLE_ADMIN_ROLE) {
        require(oracles[oracleId].createdAt > 0, "Oracle does not exist");
        oracles[oracleId].active = false;

        emit OracleDeactivated(oracleId);
    }

    /// @notice Reactivates an oracle
    function reactivateOracle(bytes32 oracleId) external onlyRole(ORACLE_ADMIN_ROLE) {
        require(oracles[oracleId].createdAt > 0, "Oracle does not exist");
        oracles[oracleId].active = true;
    }

    /// @notice Checks if an address is an authorized attestor
    function isAuthorizedAttestor(bytes32 oracleId, address attestor) external view returns (bool) {
        Oracle storage oracle = oracles[oracleId];
        return oracle.active && oracle.attestor == attestor;
    }

    /// @notice Checks if an address is any registered attestor
    function isRegisteredAttestor(address attestor) external view returns (bool) {
        return attestorToOracle[attestor] != bytes32(0);
    }

    /// @notice Grants oracle admin role
    function grantOracleAdminRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ORACLE_ADMIN_ROLE, account);
    }
}
