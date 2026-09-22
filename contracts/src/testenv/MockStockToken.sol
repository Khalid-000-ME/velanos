// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockStockToken
 * @notice Stand-in for a Robinhood Chain Stock Token when `STOCK_TOKEN_MODE=mock`.
 *
 * Used instead of the faucet tokens by default so a demo never fails because a faucet is
 * empty or rate-limited. In `official` mode these are not deployed at all and the real
 * addresses are read from the explorer, with `decimals()` read on-chain rather than assumed.
 */
contract MockStockToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
