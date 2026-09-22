// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDG
 * @notice Stand-in for Paxos USDG on testnets, used when `USDG_MODE=mock`.
 *
 * Six decimals, matching USDG, because decimals are exactly the kind of detail that silently
 * breaks a settlement path. The public faucet is here so a judge can fund a vault from the UI
 * without us handing over a key.
 */
contract MockUSDG is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000e6;
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint64) public lastFaucetAt;

    error FaucetCooldown(uint64 availableAt);

    constructor(address owner_) ERC20("Test Global Dollar", "tUSDG") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice 10,000 tUSDG per address per day.
    function faucet() external {
        uint64 last = lastFaucetAt[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldown(uint64(last + FAUCET_COOLDOWN));
        }
        lastFaucetAt[msg.sender] = uint64(block.timestamp);
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
