// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {VelanosPriceOracle} from "../src/oracle/VelanosPriceOracle.sol";

contract FakeFeed {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals;

    constructor(uint8 d, int256 a) {
        decimals = d;
        answer = a;
        updatedAt = block.timestamp;
    }

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract OracleFeedTest is Test {
    VelanosPriceOracle oracle;
    address asset = address(0xA55E7);

    function setUp() public {
        oracle = new VelanosPriceOracle(address(this));
    }

    function test_feedPriceIsReadLive() public {
        FakeFeed f = new FakeFeed(8, 2_700e8);
        oracle.setFeed(asset, address(f), 1 days);
        (uint256 p,) = oracle.price(asset);
        assertEq(p, 2_700e8);
        f.set(2_600e8, block.timestamp);
        (p,) = oracle.price(asset);
        assertEq(p, 2_600e8);
        assertTrue(oracle.hasPrice(asset));
    }

    function test_feedDecimalsAreNormalisedTo8() public {
        oracle.setFeed(asset, address(new FakeFeed(18, 3e18)), 1 days);
        (uint256 p,) = oracle.price(asset);
        assertEq(p, 3e8);
    }

    function test_feedBackedAssetCannotBeSetOrShocked() public {
        oracle.setFeed(asset, address(new FakeFeed(8, 1e8)), 1 days);
        vm.expectRevert(abi.encodeWithSelector(VelanosPriceOracle.FeedBacked.selector, asset));
        oracle.setPrice(asset, 5e8);
        vm.expectRevert(abi.encodeWithSelector(VelanosPriceOracle.FeedBacked.selector, asset));
        oracle.shock(asset, -500);
    }

    function test_staleFeedReverts() public {
        FakeFeed f = new FakeFeed(8, 1e8);
        oracle.setFeed(asset, address(f), 1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert();
        oracle.price(asset);
    }

    function test_nonPositiveAnswerReverts() public {
        oracle.setFeed(asset, address(new FakeFeed(8, 0)), 1 days);
        vm.expectRevert();
        oracle.price(asset);
    }

    function test_onlyAdminSetsFeed() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        oracle.setFeed(asset, address(1), 1 days);
    }
}
