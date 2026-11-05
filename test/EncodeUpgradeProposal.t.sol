// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";

import {TokenVoting} from "../src/TokenVoting.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";
import {EncodeUpgradeProposalScript} from "../script/EncodeUpgradeProposal.s.sol";
import {PluginSettings} from "../script/PluginSettings.sol";

/// @notice The proposal that publishes a new build must not reuse the build metadata of the latest published
///         build: a published build's metadata can't be changed afterwards.
contract EncodeUpgradeProposalTest is Test {
    bytes internal constant PUBLISHED_BUILD_METADATA = "ipfs://published-build";

    EncodeUpgradeProposalScript internal encoder;
    PluginRepo internal repo;

    function setUp() public {
        encoder = new EncodeUpgradeProposalScript();
        repo = PluginRepo(
            address(new ERC1967Proxy(address(new PluginRepo()), abi.encodeCall(PluginRepo.initialize, (address(this)))))
        );
    }

    function test_RevertWhen_theBuildMetadataIsTheLatestPublishedBuilds() public {
        repo.createVersion(1, _newSetup(), PUBLISHED_BUILD_METADATA, "ipfs://release");

        vm.expectRevert(
            "BUILD_METADATA_URI is the latest published build's: run `just pin-metadata` and set BUILD_METADATA_URI to the new build's URI"
        );
        encoder.requireNewBuildMetadata(repo, PUBLISHED_BUILD_METADATA);
    }

    function test_WhenTheBuildMetadataIsNew() public {
        repo.createVersion(1, _newSetup(), PUBLISHED_BUILD_METADATA, "ipfs://release");

        encoder.requireNewBuildMetadata(repo, "ipfs://new-build");
    }

    function test_WhenTheRepoHasNoBuildYet() public view {
        encoder.requireNewBuildMetadata(repo, PUBLISHED_BUILD_METADATA);
    }

    /// Until `just pin-metadata` fills it, the build metadata URI is unset and the proposal can't be encoded.
    function test_RevertWhen_theBuildMetadataUriIsNotSetYet() public {
        vm.expectRevert("BUILD_METADATA_URI is empty in both the env and script/PluginSettings.sol");
        this.readBuildMetadataUri();
    }

    function readBuildMetadataUri() external view returns (bytes memory) {
        return PluginSettings.buildMetadataUri();
    }

    function _newSetup() internal returns (address) {
        return address(
            new TokenVotingSetup(
                new TokenVoting(),
                new GovernanceERC20(
                    IDAO(address(0)), "", "", GovernanceERC20.MintSettings(new address[](0), new uint256[](0), false)
                ),
                new GovernanceWrappedERC20(IERC20Upgradeable(address(0x1)), "", "")
            )
        );
    }
}
