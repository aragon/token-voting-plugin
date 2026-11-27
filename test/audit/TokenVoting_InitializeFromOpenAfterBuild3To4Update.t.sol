// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.28;

// Regression test for finding C-01 (audit of the governance plugins, proof by Hacky).
//
// A TokenVoting plugin updated from build 3 to build 4 through the PluginSetupProcessor (PSP) was
// left with `initializeFrom` callable by anyone. Build 3 initialised the proxy at version 2, build 4's
// `initializeFrom` is `reinitializer(3)`, and the build 4 setup returned empty initData for a 3 -> 4
// update, so the PSP did a bare `upgradeTo` and version 3 was never consumed. An outsider could then
// re-initialise the plugin with its own target config (a `DelegateCall` to attacker code) and drain
// the DAO through the next passed proposal.
//
// The fix has two layers, both checked here through the real PSP update path from builds 1, 2 and 3,
// for the standard and the zkSync setup:
// 1. the setup returns `initializeFrom` initData for every build below 4, so the PSP consumes the
//    reinitializer inside `upgradeToAndCall`;
// 2. `initializeFrom` needs `UPGRADE_PLUGIN_PERMISSION`, which only the upgrade path holds.

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IVotesUpgradeable} from "@openzeppelin/contracts-upgradeable/governance/utils/IVotesUpgradeable.sol";

import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {ENSSubdomainRegistrar} from "@aragon/osx/framework/utils/ens/ENSSubdomainRegistrar.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";
import {PluginRepoRegistry} from "@aragon/osx/framework/plugin/repo/PluginRepoRegistry.sol";
import {PluginSetupProcessor} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessor.sol";
import {PluginSetupRef, hashHelpers} from "@aragon/osx/framework/plugin/setup/PluginSetupProcessorHelpers.sol";
import {IDAO} from "@aragon/osx-commons-contracts/src/dao/IDAO.sol";
import {IPlugin} from "@aragon/osx-commons-contracts/src/plugin/IPlugin.sol";
import {IPluginSetup} from "@aragon/osx-commons-contracts/src/plugin/setup/IPluginSetup.sol";
import {Action} from "@aragon/osx-commons-contracts/src/executors/IExecutor.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";

import {TokenVoting} from "../../src/TokenVoting.sol";
import {TokenVotingSetup} from "../../src/TokenVotingSetup.sol";
import {TokenVotingSetupZkSync} from "../../src/TokenVotingSetupZkSync.sol";
import {IMajorityVoting} from "../../src/base/IMajorityVoting.sol";
import {GovernanceERC20} from "../../src/erc20/GovernanceERC20.sol";
import {GovernanceWrappedERC20} from "../../src/erc20/GovernanceWrappedERC20.sol";

import {TokenVoting as TokenVotingR1B1} from "../old-versions/v1.1/TokenVoting.sol";
import {MajorityVotingBase as MajorityVotingBaseR1B1} from "../old-versions/v1.1/MajorityVotingBase.sol";
import {IDAO as IDAOR1B1} from "../old-versions/v1.1/IDAO.sol";
import {TokenVoting as TokenVotingR1B2} from "../old-versions/v1.2/TokenVoting.sol";
import {MajorityVotingBase as MajorityVotingBaseR1B2} from "../old-versions/v1.2/MajorityVotingBase.sol";
import {IDAO as IDAOR1B2} from "../old-versions/v1.2/IDAO.sol";
import {TokenVoting as TokenVotingR1B3} from "plugin-version-1.3/TokenVoting.sol";
import {MajorityVotingBase as MajorityVotingBaseR1B3} from "plugin-version-1.3/MajorityVotingBase.sol";

import {SimpleBuilder} from "../builders/SimpleBuilder.sol";
import {ERC20ClockMock} from "../mocks/ERC20ClockMock.sol";
import {LegacySetupMock} from "../mocks/LegacySetupMock.sol";

/// @dev The harmless target of the proposal governance approves after the update.
contract Sink {
    uint256 public hits;

    function ping() external {
        hits++;
    }
}

contract TokenVoting_InitializeFromOpenAfterBuild3To4UpdateTest is Test {
    bytes32 internal constant ROOT_PERMISSION_ID = keccak256("ROOT_PERMISSION");
    bytes32 internal constant EXECUTE_PERMISSION_ID = keccak256("EXECUTE_PERMISSION");
    bytes32 internal constant CREATE_PROPOSAL_PERMISSION_ID = keccak256("CREATE_PROPOSAL_PERMISSION");
    bytes32 internal constant EXECUTE_PROPOSAL_PERMISSION_ID = keccak256("EXECUTE_PROPOSAL_PERMISSION");
    bytes32 internal constant UPGRADE_PLUGIN_PERMISSION_ID = keccak256("UPGRADE_PLUGIN_PERMISSION");
    bytes32 internal constant APPLY_INSTALLATION_PERMISSION_ID = keccak256("APPLY_INSTALLATION_PERMISSION");
    bytes32 internal constant APPLY_UPDATE_PERMISSION_ID = keccak256("APPLY_UPDATE_PERMISSION");
    bytes32 internal constant REGISTER_PLUGIN_REPO_PERMISSION_ID = keccak256("REGISTER_PLUGIN_REPO_PERMISSION");
    address internal constant ANY_ADDR = address(type(uint160).max);
    uint16 internal constant LATEST_BUILD = 4;

    /// The DAO under test. This contract holds ROOT on it, and it doubles as the managing DAO of the
    /// plugin repo registry to keep the framework setup small.
    DAO internal dao;
    /// Timestamp-based clock, so the 3 -> 4 migration leaves a visible trace (`tokenIndexedByTimestamp`).
    ERC20ClockMock internal token;
    PluginSetupProcessor internal psp;
    /// Builds 1 to 3 are the old implementations behind `LegacySetupMock`; build 4 is the setup under test.
    PluginRepo internal repo;
    address internal alice = makeAddr("alice");
    address internal attacker = makeAddr("attacker");

    function setUp() public {
        (dao,,,) = new SimpleBuilder().build();
        token = new ERC20ClockMock(true);
        vm.deal(address(dao), 10 ether);

        PluginRepoRegistry registry = PluginRepoRegistry(
            address(
                new ERC1967Proxy(
                    address(new PluginRepoRegistry()),
                    abi.encodeCall(
                        PluginRepoRegistry.initialize, (IDAO(address(dao)), ENSSubdomainRegistrar(address(0)))
                    )
                )
            )
        );
        psp = new PluginSetupProcessor(registry);
        repo = PluginRepo(
            address(new ERC1967Proxy(address(new PluginRepo()), abi.encodeCall(PluginRepo.initialize, (address(this)))))
        );
        dao.grant(address(registry), address(this), REGISTER_PLUGIN_REPO_PERMISSION_ID);
        registry.registerPluginRepo("", address(repo)); // no subdomain: no ENS needed

        repo.createVersion(1, address(new LegacySetupMock(address(new TokenVotingR1B1()))), "build-1", "release-1");
        repo.createVersion(1, address(new LegacySetupMock(address(new TokenVotingR1B2()))), "build-2", "");
        repo.createVersion(1, address(new LegacySetupMock(address(new TokenVotingR1B3()))), "build-3", "");
        repo.createVersion(1, _deployLatestSetup(), "build-4", "");

        dao.grant(address(psp), address(this), APPLY_INSTALLATION_PERMISSION_ID);
        dao.grant(address(psp), address(this), APPLY_UPDATE_PERMISSION_ID);
    }

    /// The build 4 setup under test. The zkSync variant overrides it.
    function _deployLatestSetup() internal virtual returns (address) {
        GovernanceERC20 govBase = new GovernanceERC20(
            IDAO(address(dao)), "", "", GovernanceERC20.MintSettings(new address[](0), new uint256[](0), false)
        );
        GovernanceWrappedERC20 wrappedBase = new GovernanceWrappedERC20(IERC20Upgradeable(address(token)), "", "");
        return address(new TokenVotingSetup(new TokenVoting(), govBase, wrappedBase));
    }

    function test_updateFromBuild3ViaPSP_closesInitializeFrom() public {
        address plugin = _installAt(3);
        _updateToLatest(plugin, 3);
        _assertInitializeFromIsClosed(plugin);
        _assertGovernanceStillWorks(plugin);
    }

    function test_updateFromBuild2ViaPSP_closesInitializeFrom() public {
        address plugin = _installAt(2);
        _updateToLatest(plugin, 2);
        _assertInitializeFromIsClosed(plugin);
        _assertGovernanceStillWorks(plugin);
    }

    function test_updateFromBuild1ViaPSP_closesInitializeFrom() public {
        address plugin = _installAt(1);
        _updateToLatest(plugin, 1);
        _assertInitializeFromIsClosed(plugin);
        _assertGovernanceStillWorks(plugin);
    }

    /// Installs the plugin at `build` through the PSP and grants what a DAO at that build has granted.
    function _installAt(uint16 build) internal returns (address plugin) {
        IPluginSetup.PreparedSetupData memory prepared;
        (plugin, prepared) = psp.prepareInstallation(
            address(dao),
            PluginSetupProcessor.PrepareInstallationParams({pluginSetupRef: _ref(build), data: _initCalldata(build)})
        );
        psp.applyInstallation(
            address(dao),
            PluginSetupProcessor.ApplyInstallationParams({
                pluginSetupRef: _ref(build),
                plugin: plugin,
                permissions: prepared.permissions,
                helpersHash: hashHelpers(prepared.helpers)
            })
        );

        dao.grant(address(dao), plugin, EXECUTE_PERMISSION_ID);
        dao.grant(plugin, alice, CREATE_PROPOSAL_PERMISSION_ID);
        dao.grant(plugin, ANY_ADDR, EXECUTE_PROPOSAL_PERMISSION_ID);
    }

    /// Updates `plugin` from `fromBuild` to the latest build the way a DAO does it: through the PSP,
    /// with the temporary permissions an update proposal grants and revokes around `applyUpdate`.
    function _updateToLatest(address plugin, uint16 fromBuild) internal {
        // The PSP refuses to apply a setup prepared in the block of the last applied one: move on a block.
        vm.roll(block.number + 1);

        bytes memory updateData = fromBuild < 3
            ? abi.encode(
                uint256(0), IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call}), bytes("")
            )
            : bytes("");

        (bytes memory initData, IPluginSetup.PreparedSetupData memory prepared) = psp.prepareUpdate(
            address(dao),
            PluginSetupProcessor.PrepareUpdateParams({
                currentVersionTag: PluginRepo.Tag({release: 1, build: fromBuild}),
                newVersionTag: PluginRepo.Tag({release: 1, build: LATEST_BUILD}),
                pluginSetupRepo: repo,
                setupPayload: IPluginSetup.SetupPayload({plugin: plugin, currentHelpers: new address[](0), data: updateData})
            })
        );

        dao.grant(plugin, address(psp), UPGRADE_PLUGIN_PERMISSION_ID);
        dao.grant(address(dao), address(psp), ROOT_PERMISSION_ID);
        psp.applyUpdate(
            address(dao),
            PluginSetupProcessor.ApplyUpdateParams({
                plugin: plugin,
                pluginSetupRef: _ref(LATEST_BUILD),
                initData: initData,
                permissions: prepared.permissions,
                helpersHash: hashHelpers(prepared.helpers)
            })
        );
        dao.revoke(address(dao), address(psp), ROOT_PERMISSION_ID);
        dao.revoke(plugin, address(psp), UPGRADE_PLUGIN_PERMISSION_ID);
    }

    function _assertInitializeFromIsClosed(address plugin) internal {
        TokenVoting tokenVoting = TokenVoting(plugin);
        assertEq(tokenVoting.protocolVersion()[1], LATEST_BUILD, "updated to the latest build");
        assertTrue(tokenVoting.tokenIndexedByTimestamp(), "the migration to build 4 ran during the update");

        bytes memory takeover = abi.encode(
            uint256(0), IPlugin.TargetConfig({target: attacker, operation: IPlugin.Operation.DelegateCall}), bytes("")
        );

        // An outsider is not authorised, whatever build it claims the plugin comes from.
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(
                DaoUnauthorized.selector, address(dao), plugin, attacker, UPGRADE_PLUGIN_PERMISSION_ID
            )
        );
        tokenVoting.initializeFrom(1, takeover);

        // The upgrade permission does not reopen it either: the PSP consumed the version in the update.
        dao.grant(plugin, address(this), UPGRADE_PLUGIN_PERMISSION_ID);
        vm.expectRevert("Initializable: contract is already initialized");
        tokenVoting.initializeFrom(1, takeover);

        assertEq(tokenVoting.getTargetConfig().target, address(dao), "target untouched");
        assertEq(uint8(tokenVoting.getTargetConfig().operation), uint8(IPlugin.Operation.Call), "operation untouched");
        assertEq(tokenVoting.minApproval(), 0, "minApprovals untouched");
    }

    /// Governance goes on as usual: the approved action runs and the DAO keeps its funds.
    function _assertGovernanceStillWorks(address plugin) internal {
        Sink sink = new Sink();
        Action[] memory actions = new Action[](1);
        actions[0] = Action({to: address(sink), value: 0, data: abi.encodeCall(Sink.ping, ())});

        vm.prank(alice);
        uint256 proposalId =
            TokenVoting(plugin).createProposal("", actions, 0, 0, 0, IMajorityVoting.VoteOption.Yes, false);
        vm.warp(block.timestamp + 1 hours + 1);
        vm.roll(block.number + 1);
        TokenVoting(plugin).execute(proposalId);

        assertEq(sink.hits(), 1, "the approved action ran");
        assertEq(address(dao).balance, 10 ether, "the DAO kept its funds");
    }

    function _ref(uint16 build) internal view returns (PluginSetupRef memory) {
        return PluginSetupRef({versionTag: PluginRepo.Tag({release: 1, build: build}), pluginSetupRepo: repo});
    }

    /// The `initialize` calldata of each old build, as its own setup would have produced it.
    function _initCalldata(uint16 build) internal view returns (bytes memory) {
        if (build == 1) return _initCalldataBuild1();
        if (build == 2) return _initCalldataBuild2();
        return _initCalldataBuild3();
    }

    function _initCalldataBuild1() internal view returns (bytes memory) {
        MajorityVotingBaseR1B1.VotingSettings memory settings = MajorityVotingBaseR1B1.VotingSettings({
            votingMode: MajorityVotingBaseR1B1.VotingMode.Standard,
            supportThreshold: 500_000,
            minParticipation: 100_000,
            minDuration: 1 hours,
            minProposerVotingPower: 0
        });
        return abi.encodeCall(
            TokenVotingR1B1.initialize, (IDAOR1B1(address(dao)), settings, IVotesUpgradeable(address(token)))
        );
    }

    function _initCalldataBuild2() internal view returns (bytes memory) {
        MajorityVotingBaseR1B2.VotingSettings memory settings = MajorityVotingBaseR1B2.VotingSettings({
            votingMode: MajorityVotingBaseR1B2.VotingMode.Standard,
            supportThreshold: 500_000,
            minParticipation: 100_000,
            minDuration: 1 hours,
            minProposerVotingPower: 0
        });
        return abi.encodeCall(
            TokenVotingR1B2.initialize, (IDAOR1B2(address(dao)), settings, IVotesUpgradeable(address(token)))
        );
    }

    function _initCalldataBuild3() internal view returns (bytes memory) {
        MajorityVotingBaseR1B3.VotingSettings memory settings = MajorityVotingBaseR1B3.VotingSettings({
            votingMode: MajorityVotingBaseR1B3.VotingMode.Standard,
            supportThreshold: 500_000,
            minParticipation: 100_000,
            minDuration: 1 hours,
            minProposerVotingPower: 0
        });
        IPlugin.TargetConfig memory target =
            IPlugin.TargetConfig({target: address(dao), operation: IPlugin.Operation.Call});
        return abi.encodeCall(
            TokenVotingR1B3.initialize, (dao, settings, IVotesUpgradeable(address(token)), target, 0, "")
        );
    }
}

/// Same scenarios, with the zkSync setup publishing build 4.
contract TokenVotingZkSync_InitializeFromOpenAfterBuild3To4UpdateTest is
    TokenVoting_InitializeFromOpenAfterBuild3To4UpdateTest
{
    function _deployLatestSetup() internal override returns (address) {
        return address(new TokenVotingSetupZkSync(new TokenVoting()));
    }
}
