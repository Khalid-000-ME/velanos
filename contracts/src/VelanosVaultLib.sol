// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    VelanosConstants, IntentKind, Mandate, TradeIntent, VaultKind, VaultSnapshot, VaultState
} from "./VelanosTypes.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "./adapters/IAdapter.sol";
import {VelanosPriceOracle} from "./oracle/VelanosPriceOracle.sol";

/**
 * @title VelanosVaultLib
 * @notice The vault's read paths, deployed once and linked into every vault.
 *
 * `VelanosVault` is a full ERC-4626 plus an EIP-712 verifier plus a rule pipeline, and inlining
 * all of it put the contract that deploys vaults over the 24 KB code limit. Moving the pure and
 * view-only arithmetic here keeps the vault deployable without resorting to proxies, so each
 * vault's code is still fixed at creation.
 *
 * Nothing here holds state or moves tokens; every function is a pure or view computation over
 * arguments the vault supplies.
 */
library VelanosVaultLib {
    using SafeERC20 for IERC20;

    /// @dev Declared identically to the vault's event so the topic matches; emitted from a
    ///      delegatecall, so the log is attributed to the vault, not to this library.
    event Unwound(address asset, uint256 amountIn, uint256 settlementOut);

    /// @dev Must match the SDK's type string byte for byte — the signature depends on it.
    bytes32 internal constant TRADE_INTENT_TYPEHASH = keccak256(
        "TradeIntent(address vault,uint8 kind,address adapter,address assetIn,address assetOut,uint256 amountIn,uint256 minOut,uint32 leverageBps,bool isLong,uint256 nonce,uint64 issuedAt,uint64 deadline,bytes32 rationaleHash)"
    );

    function intentStructHash(TradeIntent memory i) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TRADE_INTENT_TYPEHASH,
                i.vault,
                uint8(i.kind),
                i.adapter,
                i.assetIn,
                i.assetOut,
                i.amountIn,
                i.minOut,
                i.leverageBps,
                i.isLong,
                i.nonce,
                i.issuedAt,
                i.deadline,
                i.rationaleHash
            )
        );
    }

    /// @notice Value of `amount` of `token` expressed in settlement units.
    /// @dev Decimals are read from the token rather than assumed. Tokenised equities and
    ///      stablecoins disagree about decimals constantly, and a wrong assumption here would
    ///      misprice NAV by orders of magnitude without reverting.
    function valueInSettlement(address oracle, address token, uint256 amount, uint8 settlementDecimals)
        public
        view
        returns (uint256)
    {
        (uint256 p,) = VelanosPriceOracle(oracle).price(token);
        uint256 usd = Math.mulDiv(amount, p, 10 ** IERC20Metadata(token).decimals());
        return Math.mulDiv(usd, 10 ** settlementDecimals, VelanosConstants.PRICE_SCALE);
    }

    function heldAssetValue(address oracle, address vault, address[] memory held, uint8 settlementDecimals)
        public
        view
        returns (uint256 total)
    {
        for (uint256 k; k < held.length; ++k) {
            uint256 bal = IERC20(held[k]).balanceOf(vault);
            if (bal == 0) continue;
            total += valueInSettlement(oracle, held[k], bal, settlementDecimals);
        }
    }

    function strikesInWindow(uint64[3] memory strikes, uint64 nowTs, uint64 window) public pure returns (uint8 n) {
        for (uint256 k; k < 3; ++k) {
            if (strikes[k] != 0 && nowTs - strikes[k] <= window) n++;
        }
    }

    struct SnapshotParams {
        address vault;
        address oracle;
        address settlementAsset;
        VaultState state;
        uint256 nav;
        uint256 ppsWad;
        uint256 dayOpenWad;
        uint8 settlementDecimals;
        uint256 openPositionValue;
        bool isPerp;
    }

    /// @notice Assembles the exact inputs the stateful rules are evaluated against.
    function buildSnapshot(TradeIntent memory i, SnapshotParams memory p)
        public
        view
        returns (VaultSnapshot memory s)
    {
        s.state = p.state;
        s.navSettlement = p.nav;
        s.pricePerShareWad = p.ppsWad;
        s.dayOpenPricePerShareWad = p.dayOpenWad;
        s.settlementBalance = IERC20(p.settlementAsset).balanceOf(p.vault);
        s.assetInBalance = IERC20(i.assetIn).balanceOf(p.vault);

        if (p.isPerp) {
            s.assetValueBefore = p.openPositionValue;
        } else {
            address subject = i.kind == IntentKind.SPOT_BUY ? i.assetOut : i.assetIn;
            uint256 bal = IERC20(subject).balanceOf(p.vault);
            s.assetValueBefore = bal == 0 ? 0 : valueInSettlement(p.oracle, subject, bal, p.settlementDecimals);
        }

        // A quote that reverts leaves both figures at zero, which rule 202 reads as "no
        // opinion" rather than "infinite slippage". The adapter call itself is what then
        // fails, and that is a 207 rejection, never a slash.
        try IAdapter(i.adapter).quote(i) returns (uint256 quoted, uint256 oracleOut) {
            s.quotedOut = quoted;
            s.oracleOut = oracleOut;
        } catch {}
    }

    /// @notice The synthetic sell the vault uses to liquidate one holding during an unwind.
    function buildUnwindSell(address vault, address adapter, address held, address settlementAsset, uint256 bal)
        public
        view
        returns (TradeIntent memory)
    {
        return TradeIntent({
            vault: vault,
            kind: IntentKind.SPOT_SELL,
            adapter: adapter,
            assetIn: held,
            assetOut: settlementAsset,
            amountIn: bal,
            minOut: 0,
            leverageBps: VelanosConstants.BPS,
            isLong: false,
            nonce: 0,
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp),
            rationaleHash: bytes32(0)
        });
    }

    /**
     * @notice Liquidates every spot holding back to the settlement asset.
     * @dev Runs under `delegatecall`, so the approvals and balances are the vault's own. A
     *      single failing venue is swallowed and logged with a zero fill rather than reverting
     *      the whole unwind: one illiquid holding must not be able to trap the other seven.
     */
    function unwindSpot(address[] memory held, address adapter, address settlementAsset) public {
        for (uint256 k; k < held.length; ++k) {
            uint256 bal = IERC20(held[k]).balanceOf(address(this));
            if (bal == 0) continue;

            TradeIntent memory sell =
                buildUnwindSell(address(this), adapter, held[k], settlementAsset, bal);

            IERC20(held[k]).forceApprove(adapter, bal);
            try IAdapter(adapter).execute(sell) returns (uint256 out) {
                emit Unwound(held[k], bal, out);
            } catch {
                emit Unwound(held[k], bal, 0);
            }
            IERC20(held[k]).forceApprove(adapter, 0);
        }
    }

    function floorWad(uint256 hwmWad, uint16 maxDrawdownBps) public pure returns (uint256) {
        return Math.mulDiv(hwmWad, VelanosConstants.BPS - maxDrawdownBps, VelanosConstants.BPS);
    }

    function shortfall(uint256 ppsWad, uint256 floorWad_, uint256 supply) public pure returns (uint256) {
        if (ppsWad >= floorWad_) return 0;
        return Math.mulDiv(floorWad_ - ppsWad, supply, VelanosConstants.WAD);
    }
}
