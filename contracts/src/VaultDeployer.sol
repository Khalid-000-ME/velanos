// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AegisVault} from "./AegisVault.sol";
import {MockPerpAdapter} from "./adapters/MockPerpAdapter.sol";

/**
 * @notice Holds `AegisVault`'s creation code so the factory does not have to.
 *
 * A full ERC-4626 vault with an EIP-712 verifier is ~19 KB of runtime code, and any contract
 * that deploys it must carry its ~24 KB of creation code. Inlining that in `VaultFactory` put
 * the factory past the EIP-170 limit, so the creation code lives here instead.
 *
 * The deployment is still a plain `CREATE` of real bytecode — no proxy, no implementation
 * pointer — so a vault's logic is fixed the moment it exists and cannot be swapped out from
 * under its depositors.
 *
 * `encodedConfig` arrives pre-encoded by the factory. Letting this contract encode the config
 * struct itself cost another 2.6 KB of ABI-encoding code, which is exactly the headroom the
 * creation code needs.
 */
contract VaultDeployer {
    address public immutable factory;

    error OnlyFactory(address caller);
    error DeploymentFailed();

    constructor(address factory_) {
        factory = factory_;
    }

    function deploy(bytes calldata encodedConfig) external returns (address vault) {
        if (msg.sender != factory) revert OnlyFactory(msg.sender);

        bytes memory initCode = abi.encodePacked(type(AegisVault).creationCode, encodedConfig);
        assembly ("memory-safe") {
            vault := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (vault == address(0)) revert DeploymentFailed();
    }
}

/// @notice Same reasoning for the per-vault mock perp adapter.
contract PerpAdapterDeployer {
    address public immutable factory;

    error OnlyFactory(address caller);

    constructor(address factory_) {
        factory = factory_;
    }

    function deploy(address settlement, address oracle) external returns (address) {
        if (msg.sender != factory) revert OnlyFactory(msg.sender);
        return address(new MockPerpAdapter(settlement, factory, oracle));
    }
}
