// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {VelanosVault} from "../src/VelanosVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {BondManager} from "../src/BondManager.sol";
import {PolicyGuard} from "../src/PolicyGuard.sol";
import {ViolationCourt} from "../src/ViolationCourt.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {PerpAdapterDeployer, VaultDeployer} from "../src/VaultDeployer.sol";
import {VelanosPriceOracle} from "../src/oracle/VelanosPriceOracle.sol";
import {StockSwapAdapter} from "../src/adapters/StockSwapAdapter.sol";
import {MockStockToken} from "../src/testenv/MockStockToken.sol";
import {MockUSDG} from "../src/testenv/MockUSDG.sol";
import {OracleSwapPool} from "../src/testenv/OracleSwapPool.sol";
import {IntentKind, Mandate, TradeIntent, VaultKind} from "../src/VelanosTypes.sol";

/**
 * @notice Stands up the entire protocol the way the deploy script does, then exposes helpers
 *         for signing intents as the agent.
 *
 * Integration-first on purpose: the interesting failures in this system are at the seams —
 * vault calls court calls bond manager calls back into vault — so unit-mocking those boundaries
 * would test the mocks rather than the protocol.
 */
contract Harness is Test {
    uint256 internal constant ONE_USDG = 1e6;
    uint256 internal constant ONE_STOCK = 1e18;

    // Prices in 8-decimal USD, matching the demo seed.
    uint256 internal constant TSLA_PRICE = 250e8;
    uint256 internal constant AMZN_PRICE = 200e8;
    uint256 internal constant PLTR_PRICE = 40e8;

    uint64 internal constant WARN_COOLDOWN = 120;
    uint64 internal constant SETTLE_GRACE = 300;
    uint64 internal constant BOND_COOLDOWN = 300;

    // ── actors ──
    uint256 internal agentPk = 0xA6E7;
    uint256 internal roguePk = 0xBAD;
    address internal agentSigner;
    address internal rogueSigner;
    address internal deployer = makeAddr("deployer");
    address internal operator = makeAddr("operator");
    address internal depositor = makeAddr("depositor");
    address internal watcher = makeAddr("watcher");
    address internal guardian = makeAddr("guardian");

    // ── protocol ──
    VelanosPriceOracle internal oracle;
    PolicyGuard internal guard;
    VaultFactory internal factory;
    AgentRegistry internal registry;
    ViolationCourt internal court;
    BondManager internal bond;
    StockSwapAdapter internal stockAdapter;

    // ── test environment ──
    MockUSDG internal usdg;
    MockStockToken internal tsla;
    MockStockToken internal amzn;
    MockStockToken internal pltr;
    OracleSwapPool internal tslaPool;
    OracleSwapPool internal amznPool;

    uint256 internal agentId;
    VelanosVault internal vault;

    function setUp() public virtual {
        agentSigner = vm.addr(agentPk);
        rogueSigner = vm.addr(roguePk);

        _deployProtocol();
        _deployTestEnv();
        _registerAgent();
        vault = _createSpotVault("Delta Equities I", "aDELTA1", 1_000 * ONE_USDG);
        _bondAndFund(vault, 300 * ONE_USDG, 1_000 * ONE_USDG);
    }

    // ───────────────────────────────── deployment ───────────────────────────────

    function _deployProtocol() internal {
        vm.startPrank(deployer);
        oracle = new VelanosPriceOracle(deployer);
        guard = new PolicyGuard();
        factory = new VaultFactory(address(guard), address(oracle), WARN_COOLDOWN, SETTLE_GRACE, deployer);
        registry = new AgentRegistry(address(factory));
        court = new ViolationCourt(address(guard), address(factory));
        bond = new BondManager(address(court), address(factory), BOND_COOLDOWN);

        factory.setDeployers(
            address(new VaultDeployer(address(factory))), address(new PerpAdapterDeployer(address(factory)))
        );
        factory.wire(address(registry), address(court), address(bond), guardian);
        vm.stopPrank();
    }

    function _deployTestEnv() internal {
        vm.startPrank(deployer);
        usdg = new MockUSDG(deployer);
        tsla = new MockStockToken("Test Tesla", "tTSLA", 18, deployer);
        amzn = new MockStockToken("Test Amazon", "tAMZN", 18, deployer);
        pltr = new MockStockToken("Test Palantir", "tPLTR", 18, deployer);

        oracle.pinSettlementAsset(address(usdg));
        oracle.setPrice(address(tsla), TSLA_PRICE);
        oracle.setPrice(address(amzn), AMZN_PRICE);
        oracle.setPrice(address(pltr), PLTR_PRICE);

        stockAdapter = new StockSwapAdapter(address(usdg), address(factory), deployer);
        tslaPool = new OracleSwapPool(address(usdg), address(tsla), address(oracle), deployer);
        amznPool = new OracleSwapPool(address(usdg), address(amzn), address(oracle), deployer);
        stockAdapter.setPool(address(tsla), address(tslaPool));
        stockAdapter.setPool(address(amzn), address(amznPool));
        factory.setAdapterAllowed(address(stockAdapter), true);

        // Deep inventory so the venue is never the reason a test fails.
        usdg.mint(deployer, 10_000_000 * ONE_USDG);
        tsla.mint(deployer, 100_000 * ONE_STOCK);
        amzn.mint(deployer, 100_000 * ONE_STOCK);

        usdg.approve(address(tslaPool), type(uint256).max);
        tsla.approve(address(tslaPool), type(uint256).max);
        usdg.approve(address(amznPool), type(uint256).max);
        amzn.approve(address(amznPool), type(uint256).max);
        tslaPool.seed(500_000 * ONE_USDG, 10_000 * ONE_STOCK);
        amznPool.seed(500_000 * ONE_USDG, 10_000 * ONE_STOCK);

        usdg.mint(operator, 100_000 * ONE_USDG);
        usdg.mint(depositor, 100_000 * ONE_USDG);
        vm.stopPrank();
    }

    function _registerAgent() internal {
        vm.prank(operator);
        agentId = registry.register(agentSigner, "Delta", "ipfs://delta", 0);
    }

    // ───────────────────────────────── mandates ─────────────────────────────────

    function spotMandate(uint256 maxAllocation) internal view returns (Mandate memory m) {
        address[] memory assets = new address[](2);
        assets[0] = address(tsla);
        assets[1] = address(amzn);
        address[] memory adapters = new address[](1);
        adapters[0] = address(stockAdapter);

        m = Mandate({
            agentSigner: agentSigner,
            operator: operator,
            settlementAsset: address(usdg),
            kind: VaultKind.SPOT,
            allowedAssets: assets,
            allowedAdapters: adapters,
            maxAllocation: maxAllocation,
            maxTradeAmount: 250 * ONE_USDG,
            maxAssetExposureBps: 4_000,
            maxSlippageBps: 100,
            maxLeverageBps: 10_000,
            maxDrawdownBps: 800,
            maxDailyLossBps: 300,
            start: uint64(block.timestamp),
            expiry: uint64(block.timestamp + 2 hours),
            bondRequired: 300 * ONE_USDG,
            perViolationPenalty: 50 * ONE_USDG,
            reporterBountyBps: 1_000,
            riskTier: 1,
            metadataURI: "ipfs://mandate"
        });
    }

    function _createSpotVault(string memory name, string memory symbol, uint256 maxAllocation)
        internal
        returns (VelanosVault v)
    {
        vm.prank(operator);
        (address addr,) = factory.createVault(agentId, spotMandate(maxAllocation), name, symbol);
        v = VelanosVault(addr);
    }

    function _bondAndFund(VelanosVault v, uint256 bondAmount, uint256 deposit) internal {
        vm.startPrank(operator);
        usdg.approve(address(bond), bondAmount);
        bond.stake(address(v), bondAmount);
        vm.stopPrank();

        if (deposit > 0) {
            vm.startPrank(depositor);
            usdg.approve(address(v), deposit);
            v.deposit(deposit, depositor);
            vm.stopPrank();
        }
    }

    // ──────────────────────────────── intents ───────────────────────────────────

    function buyIntent(VelanosVault v, address stock, uint256 amountIn, uint256 nonce)
        internal
        view
        returns (TradeIntent memory)
    {
        return TradeIntent({
            vault: address(v),
            kind: IntentKind.SPOT_BUY,
            adapter: address(stockAdapter),
            assetIn: address(usdg),
            assetOut: stock,
            amountIn: amountIn,
            minOut: 0,
            leverageBps: 10_000,
            isLong: true,
            nonce: nonce,
            issuedAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp + 60),
            rationaleHash: keccak256("momentum looks constructive")
        });
    }

    function sellIntent(VelanosVault v, address stock, uint256 amountIn, uint256 nonce)
        internal
        view
        returns (TradeIntent memory)
    {
        TradeIntent memory i = buyIntent(v, stock, amountIn, nonce);
        i.kind = IntentKind.SPOT_SELL;
        i.assetIn = stock;
        i.assetOut = address(usdg);
        return i;
    }

    function sign(VelanosVault v, TradeIntent memory i, uint256 pk) internal view returns (bytes memory) {
        (uint8 yParity, bytes32 r, bytes32 s) = vm.sign(pk, v.hashIntent(i));
        return abi.encodePacked(r, s, yParity);
    }

    function signAsAgent(VelanosVault v, TradeIntent memory i) internal view returns (bytes memory) {
        return sign(v, i, agentPk);
    }

    /// @dev Submits as the watcher by default, so bounty behaviour is exercised unless a test
    ///      deliberately submits as the agent or the operator.
    function executeAsWatcher(VelanosVault v, TradeIntent memory i) internal returns (bytes memory sig) {
        sig = signAsAgent(v, i);
        vm.prank(watcher);
        v.execute(i, sig);
    }

    /// @dev Oracle moves are role-gated, so tests go through the deployer like the keeper does.
    function _shock(address token, int16 bps) internal {
        vm.prank(deployer);
        oracle.shock(token, bps);
    }

    function bondAvailable(VelanosVault v) internal view returns (uint256 available) {
        (available,,) = bond.bondOf(address(v));
    }
}
