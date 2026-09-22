// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title AgentRegistry
 * @notice Identity and track record for agents, and the bond schedule derived from it.
 *
 * The record here is what makes a clean history worth something: an agent that settles
 * vaults without a slash pays progressively less bond for the same allocation. That is the
 * incentive that persuades an operator to accept liability in the first place.
 *
 * Reputation is never used in safety logic. A long clean streak lowers the *price* of a bond;
 * it never lowers the *checks*. `erc8004Id` is display-only for the same reason.
 */
contract AgentRegistry {
    struct Agent {
        address operator;
        address signer;
        string name;
        string metadataURI;
        uint256 erc8004Id;
        uint32 cleanSeasons;
        uint32 slashCount;
        uint64 registeredAt;
    }

    /// @notice Base bond, in bps of `maxAllocation`, by risk tier: conservative/balanced/aggressive.
    uint16[3] public tierBaseBps = [1_500, 2_500, 4_000];

    /// @notice Bond discount earned per clean season.
    uint16 public constant DISCOUNT_PER_CLEAN_SEASON_BPS = 250;

    address public immutable factory;

    uint256 public agentCount;
    mapping(uint256 => Agent) private _agents;
    mapping(address => uint256) public agentIdBySigner;

    event AgentRegistered(uint256 indexed agentId, address indexed operator, address indexed signer, string name);
    event SettlementRecorded(uint256 indexed agentId, bool clean, uint32 cleanSeasons, uint32 slashCount);

    error SignerAlreadyRegistered(address signer);
    error UnknownAgent(uint256 agentId);
    error NotAVault(address caller);
    error ZeroAddress();
    error BadRiskTier(uint8 tier);

    constructor(address factory_) {
        factory = factory_;
    }

    function register(address signer, string calldata name, string calldata metadataURI, uint256 erc8004Id)
        external
        returns (uint256 agentId)
    {
        if (signer == address(0)) revert ZeroAddress();
        if (agentIdBySigner[signer] != 0) revert SignerAlreadyRegistered(signer);

        agentId = ++agentCount;
        _agents[agentId] = Agent({
            operator: msg.sender,
            signer: signer,
            name: name,
            metadataURI: metadataURI,
            erc8004Id: erc8004Id,
            cleanSeasons: 0,
            slashCount: 0,
            registeredAt: uint64(block.timestamp)
        });
        agentIdBySigner[signer] = agentId;
        emit AgentRegistered(agentId, msg.sender, signer, name);
    }

    function agent(uint256 agentId) external view returns (Agent memory a) {
        a = _agents[agentId];
        if (a.signer == address(0)) revert UnknownAgent(agentId);
    }

    /**
     * @notice Called by a vault when it settles. A clean settlement earns a season; a vault
     *         that was slashed does not, and the slash is counted permanently.
     * @dev Only vaults the factory created may call this, so an operator cannot mint
     *      reputation for itself.
     */
    function recordSettlement(uint256 agentId, bool clean) external {
        if (!IVaultRegistry(factory).isVault(msg.sender)) revert NotAVault(msg.sender);
        Agent storage a = _agents[agentId];
        if (a.signer == address(0)) revert UnknownAgent(agentId);

        if (clean) a.cleanSeasons += 1;
        else a.slashCount += 1;

        emit SettlementRecorded(agentId, clean, a.cleanSeasons, a.slashCount);
    }

    /**
     * @notice Bond required, in bps of `maxAllocation`, for this agent at this tier.
     * @dev Discounts stop at half the base rate. An agent with a perfect record still posts
     *      meaningful first-loss capital, because the bond is the product — not a fee that
     *      loyalty can waive away.
     */
    function requiredBondBps(uint256 agentId, uint8 riskTier) external view returns (uint16) {
        if (riskTier > 2) revert BadRiskTier(riskTier);
        Agent memory a = _agents[agentId];
        if (a.signer == address(0)) revert UnknownAgent(agentId);

        uint16 base = tierBaseBps[riskTier];
        uint16 floor_ = base / 2;
        uint256 discount = uint256(a.cleanSeasons) * DISCOUNT_PER_CLEAN_SEASON_BPS;
        if (discount >= base - floor_) return floor_;
        return uint16(base - discount);
    }
}

/// @dev Minimal view of the factory, kept here so the registry does not import it wholesale.
interface IVaultRegistry {
    function isVault(address) external view returns (bool);
}
