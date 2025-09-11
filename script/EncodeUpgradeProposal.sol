// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IDAO} from "@aragon/osx/core/dao/DAO.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/Executor.sol";
import {TokenVotingSetup} from "../src/TokenVotingSetup.sol";
import {GovernanceERC20} from "../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../src/erc20/GovernanceWrappedERC20.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {IPluginRepo} from "@aragon/osx/framework/plugin/repo/IPluginRepo.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// import {hashHelpers, PluginSetupRef} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";

/**
 * This script performs the following tasks:
 * - Deploys the plugin setup
 * - Encodes the calldata of the proposal to publish it as a new version
 */
contract DeployTokenVoting_1_4Script is Script {
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
        pluginRepo = PluginRepo(vm.envAddress("PLUGIN_REPO_ADDRESS"));
        mgmtDaoMultisig = vm.envAddress("MANAGEMENT_DAO_MULTISIG_ADDRESS");

        proposalMetadataUri = bytes(vm.envString("PROPOSAL_METADATA_URI"));
        releaseMetadataUri = bytes(vm.envString("RELEASE_METADATA_URI"));
        buildMetadataUri = bytes(vm.envString("BUILD_METADATA_URI"));
    }

    function run() public view {
        // Pick the .env contract addresses from:
        // https://github.com/aragon/osx/blob/main/packages/artifacts/src/addresses.json
        // https://github.com/aragon/token-voting-plugin/blob/main/artifacts/
        // https://github.com/aragon/token-voting-plugin-hardhat/blob/main/packages/artifacts/src/addresses.json

        bytes memory actionData = abi.encodeCall(
            IPluginRepo.createVersion, (RELEASE, address(pluginSetup), buildMetadataUri, releaseMetadataUri)
        );

        Action[] memory actions = new Action[](1);
        actions[0].to = address(pluginRepo);
        actions[0].data = actionData;
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
