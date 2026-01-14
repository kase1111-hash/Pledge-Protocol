// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PledgeToken
 * @notice ERC-721 token representing an active pledge
 * @dev Transferable NFT that represents a backer's stake in a campaign
 */
contract PledgeToken is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @notice Mapping of token ID to pledge ID
    mapping(uint256 => bytes32) private tokenToPledge;

    /// @notice Mapping of pledge ID to token ID
    mapping(bytes32 => uint256) private pledgeToToken;

    /// @notice Base URI for token metadata
    string private _baseTokenURI;

    /// @notice Token ID counter
    uint256 private _tokenIdCounter;

    /// @notice Pledge metadata structure
    struct PledgeMetadata {
        bytes32 campaignId;
        address backer;
        uint256 escrowedAmount;
        uint256 createdAt;
        string campaignName;
        string backerName;
    }

    /// @notice Mapping of token ID to metadata
    mapping(uint256 => PledgeMetadata) private tokenMetadata;

    constructor(string memory baseURI) ERC721("Pledge Token", "PLEDGE") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _baseTokenURI = baseURI;
    }

    /// @notice Mints a new pledge token
    function mint(
        address to,
        bytes32 pledgeId,
        bytes32 campaignId,
        uint256 escrowedAmount,
        string calldata campaignName,
        string calldata backerName,
        string calldata tokenUri
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        require(pledgeToToken[pledgeId] == 0, "Token already exists for pledge");

        _tokenIdCounter++;
        tokenId = _tokenIdCounter;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);

        tokenToPledge[tokenId] = pledgeId;
        pledgeToToken[pledgeId] = tokenId;

        tokenMetadata[tokenId] = PledgeMetadata({
            campaignId: campaignId,
            backer: to,
            escrowedAmount: escrowedAmount,
            createdAt: block.timestamp,
            campaignName: campaignName,
            backerName: backerName
        });
    }

    /// @notice Burns a pledge token (on resolution)
    function burn(uint256 tokenId) external onlyRole(BURNER_ROLE) {
        bytes32 pledgeId = tokenToPledge[tokenId];
        require(pledgeId != bytes32(0), "Token does not exist");

        delete tokenToPledge[tokenId];
        delete pledgeToToken[pledgeId];
        delete tokenMetadata[tokenId];

        _burn(tokenId);
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

    /// @notice Gets pledge metadata for a token
    function getPledgeMetadata(uint256 tokenId) external view returns (PledgeMetadata memory) {
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

    /// @notice Grants burner role
    function grantBurnerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(BURNER_ROLE, account);
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
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }
}
