// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {TokenVotingSetupZkSync} from "../src/TokenVotingSetupZkSync.sol";

/// @notice Clients (App, SDK) ABI-encode the `prepareInstallation` and `prepareUpdate` data from the build
///         metadata. Any type drift against what the contracts decode makes installations or updates revert.
contract BuildMetadataTest is Test {
    string constant METADATA_PATH = "script/metadata/build-metadata.json";
    string constant INSTALL_INPUTS = ".pluginSetup.prepareInstallation.inputs";
    string constant UPDATES = ".pluginSetup.prepareUpdate";
    uint16 constant LATEST_BUILD = 5;

    string json;

    function setUp() public {
        json = vm.readFile(METADATA_PATH);
    }

    function test_installationInputsMatchTheSetupAbi() public view {
        // `encodeInstallationParameters` mirrors the tuple decoded by `prepareInstallation`,
        // so its compiler-generated selector is the canonical ABI to match.
        string memory signature = string.concat("encodeInstallationParameters(", _canonicalList(INSTALL_INPUTS), ")");

        assertEq(bytes4(keccak256(bytes(signature))), TokenVotingSetup.encodeInstallationParameters.selector, signature);
        assertEq(
            bytes4(keccak256(bytes(signature))), TokenVotingSetupZkSync.encodeInstallationParameters.selector, signature
        );
    }

    /// `prepareUpdate` inputs are keyed by the build the update comes from. The setup passes the update data
    /// to `initializeFrom` as `_initData`, so each entry must have the types it decodes for that build.
    function test_updateInputsMatchWhatInitializeFromDecodes() public view {
        for (uint16 fromBuild = 1; fromBuild < LATEST_BUILD; fromBuild++) {
            string memory inputs = string.concat(UPDATES, ".", vm.toString(fromBuild), ".inputs");
            string memory label = string.concat("update from build ", vm.toString(fromBuild));
            assertTrue(vm.keyExistsJson(json, inputs), label);
            assertEq(_canonicalList(inputs), _decodedByInitializeFrom(fromBuild), label);
        }
        assertFalse(
            vm.keyExistsJson(json, string.concat(UPDATES, ".", vm.toString(LATEST_BUILD))),
            "no update from the latest build"
        );
    }

    /// @dev Mirrors the `abi.decode` in `TokenVoting.initializeFrom`: builds below 3 pass
    ///      (minApprovals, TargetConfig, pluginMetadata), later builds pass nothing.
    function _decodedByInitializeFrom(uint16 fromBuild) internal pure returns (string memory) {
        return fromBuild < 3 ? "uint256,(address,uint8),bytes" : "";
    }

    /// @dev Comma-joined canonical types of the JSON array of ABI params at `path`.
    function _canonicalList(string memory path) internal view returns (string memory list) {
        for (uint256 i;; i++) {
            string memory item = string.concat(path, "[", vm.toString(i), "]");
            if (!vm.keyExistsJson(json, item)) return list;
            list = i == 0 ? _canonicalType(item) : string.concat(list, ",", _canonicalType(item));
        }
    }

    /// @dev `tuple`, `tuple[]`, `tuple[N]` expand to `(components...)` plus the array suffix.
    function _canonicalType(string memory path) internal view returns (string memory) {
        bytes memory t = bytes(vm.parseJsonString(json, string.concat(path, ".type")));
        if (t.length < 5 || keccak256(_slice(t, 0, 5)) != keccak256("tuple")) return string(t);

        return
            string.concat("(", _canonicalList(string.concat(path, ".components")), ")", string(_slice(t, 5, t.length)));
    }

    function _slice(bytes memory b, uint256 from, uint256 to) internal pure returns (bytes memory out) {
        out = new bytes(to - from);
        for (uint256 i = from; i < to; i++) {
            out[i - from] = b[i];
        }
    }
}
