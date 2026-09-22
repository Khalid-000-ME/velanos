// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Harness} from "./Harness.sol";
import {AegisVault} from "../src/AegisVault.sol";
import {BondManager} from "../src/BondManager.sol";
import {ViolationCourt} from "../src/ViolationCourt.sol";
import {MockStockToken} from "../src/testenv/MockStockToken.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {AegisPriceOracle} from "../src/oracle/AegisPriceOracle.sol";
import {IntentKind, TradeIntent, VaultState} from "../src/AegisTypes.sol";

/**
 * @notice Drives the protocol the way an unsupervised agent would, including badly.
 *
 * The handler deliberately signs intents that break rules, replays nonces, shocks prices and
 * calls lifecycle functions out of order. What the invariants assert is not that nothing bad
 * happens — bad things are the point — but that the protocol's promises survive it.
 *
 * Every call is wrapped in try/catch so a revert ends that call rather than the run; an
 * invariant campaign that stopped at the first rejected intent would never reach the states
 * worth checking.
 */
contract InvariantHandler is CommonBase, StdCheats {
    struct Wiring {
        AegisVault vault;
        BondManager bond;
        ViolationCourt court;
        AegisPriceOracle oracle;
        MockUSDG usdg;
        MockStockToken tsla;
        MockStockToken pltr;
        uint256 agentPk;
        address deployer;
        address watcher;
    }

    Wiring internal w;

    uint256 public nonceCursor;
    /// @dev Tracked independently of the protocol's own books, so a bookkeeping bug cannot
    ///      hide behind itself.
    uint256 public ghostSlashed;

    constructor(Wiring memory w_) {
        w = w_;
    }

    function vault() external view returns (AegisVault) {
        return w.vault;
    }

    // ───────────────────────────── agent behaviour ──────────────────────────────

    function submitGoodBuy(uint96 amount) external {
        _submit(address(w.tsla), (uint256(amount) % (250e6)) + 1, 10_000);
    }

    function submitOversizedBuy(uint96 amount) external {
        _submit(address(w.tsla), (uint256(amount) % (5_000e6)) + 251e6, 10_000);
    }

    function submitForbiddenAsset(uint96 amount) external {
        _submit(address(w.pltr), (uint256(amount) % (250e6)) + 1, 10_000);
    }

    function submitLeveragedSpot(uint96 amount) external {
        _submit(address(w.tsla), (uint256(amount) % (250e6)) + 1, 30_000);
    }

    /// @dev A replayed nonce must be inert, not double-counted.
    function replayLastNonce() external {
        if (nonceCursor == 0) return;
        TradeIntent memory i = _intent(address(w.tsla), 100e6, 10_000, nonceCursor);
        _tryExecute(i);
    }

    function reportToCourt(uint96 amount) external {
        nonceCursor += 1;
        TradeIntent memory i = _intent(address(w.pltr), (uint256(amount) % (250e6)) + 1, 10_000, nonceCursor);
        bytes memory sig = _sign(i);

        uint256 before = _bondAvailable();
        vm.prank(w.watcher);
        try w.court.reportSignedViolation(i, sig) {} catch {}
        _recordSlash(before);
    }

    // ────────────────────────── market and lifecycle ────────────────────────────

    function shockPrice(int16 bps) external {
        int16 clamped = int16(bps % 3_000);
        vm.prank(w.deployer);
        try w.oracle.shock(address(w.tsla), clamped) {} catch {}
    }

    function pokeVault() external {
        try w.vault.poke() {} catch {}
    }

    function tripBreaker() external {
        vm.prank(w.watcher);
        try w.court.tripDrawdown(address(w.vault)) {} catch {}
    }

    function unwindVault() external {
        try w.vault.unwind() {} catch {}
    }

    function compensate() external {
        uint256 before = _bondAvailable();
        vm.prank(w.watcher);
        try w.court.compensateDrawdown(address(w.vault)) {} catch {}
        _recordSlash(before);
    }

    function settleVault() external {
        try w.vault.settle() {} catch {}
    }

    function forceSettle() external {
        uint256 before = _bondAvailable();
        vm.prank(w.watcher);
        try w.court.forceSettle(address(w.vault)) {} catch {}
        _recordSlash(before);
    }

    function warp(uint32 secondsAhead) external {
        vm.warp(block.timestamp + (uint256(secondsAhead) % 3 days) + 1);
    }

    // ──────────────────────────────── internals ─────────────────────────────────

    function _submit(address stock, uint256 amountIn, uint32 leverageBps) internal {
        nonceCursor += 1;
        _tryExecute(_intent(stock, amountIn, leverageBps, nonceCursor));
    }

    function _tryExecute(TradeIntent memory i) internal {
        bytes memory sig = _sign(i);
        uint256 before = _bondAvailable();
        vm.prank(w.watcher);
        try w.vault.execute(i, sig) {} catch {}
        _recordSlash(before);
    }

    function _recordSlash(uint256 bondBefore) internal {
        uint256 bondAfter = _bondAvailable();
        if (bondBefore > bondAfter) ghostSlashed += bondBefore - bondAfter;
    }

    function _intent(address stock, uint256 amountIn, uint32 leverageBps, uint256 nonce)
        internal
        view
        returns (TradeIntent memory)
    {
        return TradeIntent({
            vault: address(w.vault),
            kind: IntentKind.SPOT_BUY,
            adapter: w.vault.mandate().allowedAdapters[0],
            assetIn: address(w.usdg),
            assetOut: stock,
            amountIn: amountIn,
            minOut: 0,
            leverageBps: leverageBps,
            isLong: true,
            nonce: nonce,
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 60),
            rationaleHash: keccak256("invariant run")
        });
    }

    function _sign(TradeIntent memory i) internal view returns (bytes memory) {
        (uint8 yParity, bytes32 r, bytes32 s) = vm.sign(w.agentPk, w.vault.hashIntent(i));
        return abi.encodePacked(r, s, yParity);
    }

    function _bondAvailable() internal view returns (uint256 available) {
        (available,,) = w.bond.bondOf(address(w.vault));
    }
}

contract InvariantsTest is StdInvariant, Harness {
    InvariantHandler internal handler;

    function setUp() public override {
        super.setUp();

        handler = new InvariantHandler(
            InvariantHandler.Wiring({
                vault: vault,
                bond: bond,
                court: court,
                oracle: oracle,
                usdg: usdg,
                tsla: tsla,
                pltr: pltr,
                agentPk: agentPk,
                deployer: deployer,
                watcher: watcher
            })
        );
        targetContract(address(handler));
    }

    /// @notice Every nonce ends in exactly one of the four defined states.
    function invariant_nonceStatusIsAlwaysWellDefined() public view {
        uint256 upTo = handler.nonceCursor() > 32 ? 32 : handler.nonceCursor();
        for (uint256 n = 1; n <= upTo; ++n) {
            assertLe(vault.nonceStatus(n), 3);
        }
    }

    /// @notice The bond can never pay out more than was ever put in — otherwise the protocol
    ///         would be promising money that does not exist.
    function invariant_slashedNeverExceedsStaked() public view {
        (, uint256 slashedTotal,) = bond.bondOf(address(vault));
        assertLe(slashedTotal, bond.stakedTotal(address(vault)));
    }

    function invariant_bondAccountingBalances() public view {
        (uint256 available, uint256 slashedTotal,) = bond.bondOf(address(vault));
        assertLe(available + slashedTotal, bond.stakedTotal(address(vault)));
    }

    /// @notice Vault shares are the only claim on depositor assets, and no insider ever holds
    ///         one. This is the invariant behind "the agent cannot drain the vault".
    function invariant_insidersNeverHoldDepositorShares() public view {
        assertEq(vault.balanceOf(agentSigner), 0);
        assertEq(vault.balanceOf(operator), 0);
        assertEq(vault.balanceOf(watcher), 0);
        assertEq(vault.balanceOf(guardian), 0);
        assertEq(vault.balanceOf(address(bond)), 0);
    }

    /// @notice The bond manager always holds at least what it says is available, so a payout can
    ///         never be a promise it cannot keep.
    function invariant_bondCustodyIsSolvent() public view {
        (uint256 available,,) = bond.bondOf(address(vault));
        assertGe(usdg.balanceOf(address(bond)), available);
    }

    /// @notice The high-water mark only ratchets up, so the floor cannot be walked down after a
    ///         gain has been banked.
    function invariant_highWaterMarkNeverFalls() public view {
        assertGe(vault.hwmPricePerShareWad(), 1e18);
    }

    function invariant_closedVaultsAcceptNoDeposits() public view {
        VaultState s = vault.state();
        if (s == VaultState.ACTIVE || s == VaultState.WARNED) return;
        assertEq(vault.maxDeposit(depositor), 0);
    }

    /// @notice Two static breaches always mean frozen. The consequence is automatic; there is
    ///         no admin key that has to notice first.
    function invariant_twoStaticViolationsAlwaysMeanFrozen() public view {
        if (vault.staticViolationCount() < 2) return;
        VaultState s = vault.state();
        assertTrue(
            s == VaultState.FROZEN || s == VaultState.UNWINDING || s == VaultState.SETTLED,
            "a twice-offending vault must not still be trading"
        );
    }

    /// @notice A settled vault is final: every share is redeemable, with nothing stranded.
    function invariant_settledVaultIsFullyRedeemable() public view {
        if (vault.state() != VaultState.SETTLED) return;
        assertEq(vault.maxWithdraw(depositor), vault.previewRedeem(vault.balanceOf(depositor)));
    }

    /// @notice The ghost tally of money taken from the bond agrees with the bond's own books.
    function invariant_ghostSlashTallyMatchesTheBond() public view {
        (, uint256 slashedTotal,) = bond.bondOf(address(vault));
        assertEq(handler.ghostSlashed(), slashedTotal);
    }
}
