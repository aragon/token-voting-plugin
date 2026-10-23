// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PluginSettings} from "../script/PluginSettings.sol";

contract PluginSettingsTest is Test {
    // Tests run in parallel and the env is process-wide: each test uses its own variable name.

    function test_unsetEnvFallsBackToTheConstant() public view {
        assertEq(PluginSettings.resolve("PLUGIN_SETTINGS_TEST_UNSET", "ipfs://fallback"), bytes("ipfs://fallback"));
    }

    function test_emptyEnvFallsBackToTheConstant() public {
        vm.setEnv("PLUGIN_SETTINGS_TEST_EMPTY", "");
        assertEq(PluginSettings.resolve("PLUGIN_SETTINGS_TEST_EMPTY", "ipfs://fallback"), bytes("ipfs://fallback"));
    }

    function test_envOverridesTheConstant() public {
        vm.setEnv("PLUGIN_SETTINGS_TEST_SET", "ipfs://override");
        assertEq(PluginSettings.resolve("PLUGIN_SETTINGS_TEST_SET", "ipfs://fallback"), bytes("ipfs://override"));
    }

    function test_envOverridesAnEmptyConstant() public {
        vm.setEnv("PLUGIN_SETTINGS_TEST_SET_NO_FALLBACK", "ipfs://override");
        assertEq(PluginSettings.resolve("PLUGIN_SETTINGS_TEST_SET_NO_FALLBACK", ""), bytes("ipfs://override"));
    }

    function test_RevertWhen_bothAreEmpty() public {
        vm.setEnv("PLUGIN_SETTINGS_TEST_NOTHING", "");
        vm.expectRevert(bytes("PLUGIN_SETTINGS_TEST_NOTHING is empty in both the env and script/PluginSettings.sol"));
        this.resolve("PLUGIN_SETTINGS_TEST_NOTHING", "");
    }

    /// @dev External so that `expectRevert` can catch the library's revert.
    function resolve(string memory envName, string memory fallbackValue) external view returns (bytes memory) {
        return PluginSettings.resolve(envName, fallbackValue);
    }
}
