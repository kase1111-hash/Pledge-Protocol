// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CommemorativeToken
 * @notice ERC-5192 Soulbound token representing proof of backing
 * @dev Non-transferable NFT minted after campaign resolution
 */
contract CommemorativeToken is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice ERC-5192 interface ID
    bytes4 private constant IERC5192_ID = 0xb45a3c0e;

    /// @notice Emitted when a token is locked (soulbound)
    event Locked(uint256 indexed tokenId);

    /// @notice Mapping of token ID to pledge ID
    mapping(uint256 => bytes32) private tokenToPledge;

    /// @notice Mapping of pledge ID to token ID
    mapping(bytes32 => uint256) private pledgeToToken;

    /// @notice Base URI for token metadata
    string private _baseTokenURI;

    /// @notice Token ID counter
    uint256 private _tokenIdCounter;

    /// @notice Commemorative metadata structure
    struct CommemorativeMetadata {
        bytes32 campaignId;
        bytes32 pledgeId;
        address holder;
        uint256 contributionAmount;
        uint256 totalCampaignRaised;
        uint256 pledgedAt;
        uint256 resolvedAt;
        string campaignName;
        string subjectName;
        string beneficiaryName;
        string outcomeSummary;
        string backerName;
    }

    /// @notice Mapping of token ID to metadata
    mapping(uint256 => CommemorativeMetadata) private tokenMetadata;

    /// @notice Mapping of token ID to transferability
    mapping(uint256 => bool) private tokenTransferable;

    /// @notice Mapping of token ID to transfer lock time
    mapping(uint256 => uint256) private transferableAfter;

    constructor(string memory baseURI) ERC721("Commemorative Token", "COMMEM") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _baseTokenURI = baseURI;
    }

    /// @notice Mints a new commemorative token (soulbound by default)
    function mint(
        address to,
        bytes32 pledgeId,
        CommemorativeMetadata calldata metadata,
        string calldata tokenUri,
        bool transferable,
        uint256 lockDuration
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(pledgeToToken[pledgeId] == 0, "Token already exists for pledge");

        _tokenIdCounter++;
        tokenId = _tokenIdCounter;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);

        tokenToPledge[tokenId] = pledgeId;
        pledgeToToken[pledgeId] = tokenId;
        tokenMetadata[tokenId] = metadata;

        if (transferable) {
            if (lockDuration > 0) {
                // Time-locked transferability
                transferableAfter[tokenId] = block.timestamp + lockDuration;
            } else {
                // Immediately transferable
                tokenTransferable[tokenId] = true;
            }
        } else {
            // Soulbound - emit Locked event
            emit Locked(tokenId);
        }
    }

    /// @notice ERC-5192: Returns whether a token is locked (soulbound)
    function locked(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        // If explicitly transferable, not locked
        if (tokenTransferable[tokenId]) {
            return false;
        }

        // If time-locked and time has passed, not locked
        if (transferableAfter[tokenId] > 0 && block.timestamp >= transferableAfter[tokenId]) {
            return false;
        }

        // Otherwise, locked (soulbound)
        return true;
    }

    /// @notice Gets the pledge ID for a token
    function pledgeOf(uint256 tokenId) external view returns (bytes32) {
        require(tokenToPledge[tokenId] != bytes32(0), "Token does not exist");
        return tokenToPledge[tokenId];
    }

    /// @notice Gets the token ID for a pledge
    function tokenOfPledge(bytes32 pledgeId) external view returns (uint256) {
        require(pledgeToToken[pledgeId] != 0, "No token for pledge");
        return pledgeToToken[pledgeId];
    }

    /// @notice Gets commemorative metadata for a token
    function getCommemorativeMetadata(uint256 tokenId) external view returns (CommemorativeMetadata memory) {
        require(tokenToPledge[tokenId] != bytes32(0), "Token does not exist");
        return tokenMetadata[tokenId];
    }

    /// @notice Sets the base URI
    function setBaseURI(string calldata baseURI) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseURI;
    }

    /// @notice Grants minter role
    function grantMinterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }

    /// @notice Check if token can be transferred
    function canTransfer(uint256 tokenId) public view returns (bool) {
        if (tokenTransferable[tokenId]) {
            return true;
        }
        if (transferableAfter[tokenId] > 0 && block.timestamp >= transferableAfter[tokenId]) {
            return true;
        }
        return false;
    }

    // Override functions

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        // Add ERC-5192 support
        return interfaceId == IERC5192_ID || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting (from == address(0))
        // Block transfers if soulbound
        if (from != address(0) && to != address(0)) {
            require(canTransfer(tokenId), "Token is soulbound");
        }

        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
