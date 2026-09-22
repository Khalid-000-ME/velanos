// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AegisConstants, Mandate, VaultKind} from "./AegisTypes.sol";
import {AegisVault} from "./AegisVault.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {PerpAdapterDeployer, VaultDeployer} from "./VaultDeployer.sol";

interface IFactoryBondManager {
    function registerVault(address vault) external;
}

interface IFactoryCourt {
    function setBondManager(address bondManager) external;
}

/**
 * @title VaultFactory
 * @notice Creates vaults and is the registry of which addresses are real ones.
 *
 * Everything downstream trusts `isVault`. The court will only slash a vault it created, the
 * bond manager will only custody for one, and the adapters will only move tokens for one — so
 * an attacker cannot deploy a look-alike vault with a mandate of its own choosing and have the
 * rest of the protocol treat it as legitimate.
 */
contract VaultFactory is Ownable {
    uint8 public constant MAX_ARRAY_ENTRIES = 8;

    AgentRegistry public registry;
    VaultDeployer public vaultDeployer;
    PerpAdapterDeployer public perpAdapterDeployer;
    address public immutable guard;
    address public immutable oracle;
    address public court;
    address public bondManager;
    address public guardian;

    uint64 public immutable warnCooldown;
    uint64 public immutable settleGrace;

    /// @notice Adapters any mandate is allowed to name. A per-vault allowlist chosen by the
    ///         operator can only ever be a subset of this.
    mapping(address => bool) public isAllowedAdapter;
    mapping(address => bool) public isVault;

    address[] public allVaults;
    bool public perpModeMock;

    event VaultCreated(
        address indexed vault,
        uint256 indexed agentId,
        VaultKind kind,
        bytes32 mandateHash,
        address perpAdapter,
        string name
    );
    event AdapterAllowed(address indexed adapter, bool allowed);
    event Wired(address registry, address court, address bondManager, address guardian);
    event DeployersSet(address vaultDeployer, address perpAdapterDeployer);

    error AlreadyWired();
    error SignerMismatch(address mandateSigner, address registeredSigner);
    error BondTooSmall(uint256 provided, uint256 required);
    error BadTerm(uint64 start, uint64 expiry);
    error EmptyArray();
    error TooManyEntries(uint256 length);
    error AdapterNotGloballyAllowed(address adapter);
    error ZeroAllocation();
    error SettlementAssetMismatch();
    error NotOperator();
    error DeployersAlreadySet();

    bool private _wired;
    bool private _deployersSet;

    constructor(address guard_, address oracle_, uint64 warnCooldown_, uint64 settleGrace_, address owner_)
        Ownable(owner_)
    {
        guard = guard_;
        oracle = oracle_;
        warnCooldown = warnCooldown_;
        settleGrace = settleGrace_;
    }

    /// @dev Deployment is circular — the registry and bond manager both need the factory's
    ///      address — so wiring is a one-shot follow-up call rather than a constructor arg.
    function wire(address registry_, address court_, address bondManager_, address guardian_) external onlyOwner {
        if (_wired) revert AlreadyWired();
        _wired = true;
        registry = AgentRegistry(registry_);
        court = court_;
        bondManager = bondManager_;
        guardian = guardian_;
        IFactoryCourt(court_).setBondManager(bondManager_);
        emit Wired(registry_, court_, bondManager_, guardian_);
    }

    /// @dev Set once, immediately after deployment, by the deploy script.
    function setDeployers(address vaultDeployer_, address perpAdapterDeployer_) external onlyOwner {
        if (_deployersSet) revert DeployersAlreadySet();
        _deployersSet = true;
        vaultDeployer = VaultDeployer(vaultDeployer_);
        perpAdapterDeployer = PerpAdapterDeployer(perpAdapterDeployer_);
        emit DeployersSet(vaultDeployer_, perpAdapterDeployer_);
    }

    function setAdapterAllowed(address adapter, bool allowed) external onlyOwner {
        isAllowedAdapter[adapter] = allowed;
        emit AdapterAllowed(adapter, allowed);
    }

    function setPerpModeMock(bool mock) external onlyOwner {
        perpModeMock = mock;
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    /**
     * @notice Deploys a vault for `agentId` under `m`, which can never change afterwards.
     * @return vault the new vault
     * @return perpAdapter a dedicated perp adapter for PERP vaults, else the zero address
     *
     * @dev The bond floor is checked here rather than trusted from the operator. Without it an
     *      operator could advertise a 1,000 allocation behind a 1-token bond and the loss floor
     *      shown to depositors would be fiction.
     */
    function createVault(uint256 agentId, Mandate calldata m, string calldata name, string calldata symbol)
        external
        returns (address vault, address perpAdapter)
    {
        _validate(agentId, m);

        Mandate memory mem = m;
        if (m.kind == VaultKind.PERP) {
            // One adapter per perps vault keeps position accounting unambiguous: the adapter
            // is the position owner, so "this vault's position" is never a shared balance.
            perpAdapter = perpAdapterDeployer.deploy(m.settlementAsset, oracle);
            address[] memory adapters = new address[](m.allowedAdapters.length + 1);
            for (uint256 k; k < m.allowedAdapters.length; ++k) {
                adapters[k] = m.allowedAdapters[k];
            }
            adapters[m.allowedAdapters.length] = perpAdapter;
            mem.allowedAdapters = adapters;
        }

        AegisVault.Config memory cfg = AegisVault.Config({
            mandate: mem,
            court: court,
            bondManager: bondManager,
            guard: guard,
            oracle: oracle,
            factory: address(this),
            registry: address(registry),
            guardian: guardian,
            agentId: agentId,
            warnCooldown: warnCooldown,
            settleGrace: settleGrace,
            name: name,
            symbol: symbol
        });

        AegisVault v = AegisVault(vaultDeployer.deploy(abi.encode(cfg)));
        vault = address(v);
        isVault[vault] = true;
        allVaults.push(vault);
        IFactoryBondManager(bondManager).registerVault(vault);

        emit VaultCreated(vault, agentId, m.kind, v.mandateHash(), perpAdapter, name);
    }

    function _validate(uint256 agentId, Mandate calldata m) internal view {
        AgentRegistry.Agent memory a = registry.agent(agentId);
        if (msg.sender != a.operator) revert NotOperator();
        if (m.agentSigner != a.signer) revert SignerMismatch(m.agentSigner, a.signer);
        if (m.operator != a.operator) revert NotOperator();
        if (m.expiry <= m.start) revert BadTerm(m.start, m.expiry);
        if (m.maxAllocation == 0) revert ZeroAllocation();
        if (m.settlementAsset == address(0)) revert SettlementAssetMismatch();

        if (m.allowedAssets.length == 0 || m.allowedAdapters.length == 0) revert EmptyArray();
        if (m.allowedAssets.length > MAX_ARRAY_ENTRIES) revert TooManyEntries(m.allowedAssets.length);
        if (m.allowedAdapters.length > MAX_ARRAY_ENTRIES) revert TooManyEntries(m.allowedAdapters.length);

        for (uint256 k; k < m.allowedAdapters.length; ++k) {
            if (!isAllowedAdapter[m.allowedAdapters[k]]) revert AdapterNotGloballyAllowed(m.allowedAdapters[k]);
        }

        uint16 bps = registry.requiredBondBps(agentId, m.riskTier);
        uint256 required = Math.mulDiv(m.maxAllocation, bps, AegisConstants.BPS);
        if (m.bondRequired < required) revert BondTooSmall(m.bondRequired, required);
    }
}
