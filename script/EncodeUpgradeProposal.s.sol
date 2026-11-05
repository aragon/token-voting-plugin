// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";

import {Action} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {PluginSettings} from "./PluginSettings.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IPluginRepo} from "@aragon/osx/framework/plugin/repo/IPluginRepo.sol";

/**
 * This script performs the following tasks:
 * - Encodes the management DAO multisig proposal that publishes a deployed plugin setup as a new version
 */
contract EncodeUpgradeProposalScript is Script {
    uint8 constant RELEASE = 1;

    TokenVotingSetup pluginSetup;
    address mgmtDaoMultisig;
    PluginRepo pluginRepo;
    bytes proposalMetadataUri;
    bytes releaseMetadataUri;
    bytes buildMetadataUri;

    function setUp() public {
        // Pick the contract addresses from
        // https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json

        pluginSetup = TokenVotingSetup(vm.envAddress("PLUGIN_SETUP"));
        pluginRepo = PluginRepo(vm.envAddress("TOKEN_VOTING_PLUGIN_REPO_ADDRESS"));
        mgmtDaoMultisig = vm.envAddress("MANAGEMENT_DAO_MULTISIG_ADDRESS");

        proposalMetadataUri = bytes(vm.envString("PROPOSAL_METADATA_URI"));
        releaseMetadataUri = PluginSettings.releaseMetadataUri();
        buildMetadataUri = PluginSettings.buildMetadataUri();
        requireNewBuildMetadata(pluginRepo, buildMetadataUri);
    }

    /// @notice Reverts when `_buildMetadataUri` is the build metadata of the latest published build. A build's
    ///         metadata can't be changed once published, so a new build must never reuse the previous one's.
    /// @param _pluginRepo The token-voting plugin repo.
    /// @param _buildMetadataUri The build metadata URI the proposal would publish.
    function requireNewBuildMetadata(PluginRepo _pluginRepo, bytes memory _buildMetadataUri) public view {
        if (_pluginRepo.buildCount(RELEASE) == 0) return;
        bytes memory latest = _pluginRepo.getLatestVersion(RELEASE).buildMetadata;
        if (keccak256(_buildMetadataUri) == keccak256(latest)) {
            revert(
                "BUILD_METADATA_URI is the latest published build's: run `just pin-metadata` and set BUILD_METADATA_URI to the new build's URI"
            );
        }
    }

    /// @notice The actions of the management DAO proposal: publish `_pluginSetup` as the next build of release 1.
    /// @param _pluginSetup The deployed plugin setup.
    /// @param _pluginRepo The token-voting plugin repo.
    /// @param _buildMetadataUri The build metadata URI.
    /// @param _releaseMetadataUri The release metadata URI.
    /// @return actions The single `createVersion` action.
    function publishActions(
        address _pluginSetup,
        PluginRepo _pluginRepo,
        bytes memory _buildMetadataUri,
        bytes memory _releaseMetadataUri
    ) public pure returns (Action[] memory actions) {
        actions = new Action[](1);
        actions[0].to = address(_pluginRepo);
        actions[0].data =
            abi.encodeCall(IPluginRepo.createVersion, (RELEASE, _pluginSetup, _buildMetadataUri, _releaseMetadataUri));
    }

    function run() public view {
        // Pick the .env contract addresses from:
        // https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json
        // https://github.com/aragon/token-voting-plugin/blob/main/npm-artifacts/src/addresses.json

        Action[] memory actions = publishActions(address(pluginSetup), pluginRepo, buildMetadataUri, releaseMetadataUri);
        bytes memory actionData = actions[0].data;
        uint64 expirationDate = uint64(vm.envUint("TIMESTAMP")) + 3 weeks;
        bytes memory createProposalData = abi.encodeCall(
            IMultisigProposal.createProposal, (proposalMetadataUri, actions, 0, true, false, 0, expirationDate)
        );

        console2.log("Proposal details:");
        console2.log("- Proposal plugin:           ", address(mgmtDaoMultisig), " (Multisig)");
        console2.log("- Action[0].to:              ", address(pluginRepo), " (TokenVoting repo)");
        console2.log("- Action[0].data:            ", vm.toString(actionData));
        console2.log("");
        console2.log("Action signature:");
        console2.log("- createVersion(uint8 release, address pluginSetup, bytes buildMetadata, bytes releaseMetadata)");
        console2.log("");
        console2.log("");
        console2.log("Creating the proposal with Foundry");
        console2.log("");
        console2.log("Function signature:");
        console2.log(
            "- createProposal(bytes calldata _metadata, Action[] calldata _actions, uint256 _allowFailureMap, bool _approveProposal, bool _tryExecution, uint64 _startDate, uint64 _endDate)"
        );
        console2.log("");
        console2.log("$ export FROM_ADDRESS=<your-address>");
        console2.log("$ export RPC_URL='https://chain-name-here.drpc.org'");
        console2.log("");
        console2.log("$ export WALLET_TYPE=\"--trezor\"   (Set the appropriate value)");
        console2.log("$ export WALLET_TYPE=\"--ledger\"");
        console2.log("");
        console2.log(
            "$ cast send $WALLET_TYPE --from $FROM_ADDRESS --rpc-url $RPC_URL",
            vm.toString(address(mgmtDaoMultisig)),
            vm.toString(createProposalData)
        );
        console2.log("");
        console2.log("The transaction can be verified via `cast 4byte-decode <data>`");
        console2.log("");
    }
}

interface IMultisigProposal {
    function createProposal(
        bytes calldata _metadata,
        Action[] calldata _actions,
        uint256 _allowFailureMap,
        bool _approveProposal,
        bool _tryExecution,
        uint64 _startDate,
        uint64 _endDate
    ) external returns (uint256 proposalId);
}
