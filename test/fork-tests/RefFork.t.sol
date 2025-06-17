// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.17;

import {ForkTestBase} from "../lib/ForkTestBase.sol";

import {ForkBuilder} from "../builders/ForkBuilder.sol";
import {DAO} from "@aragon/osx/core/dao/DAO.sol";
import {DaoUnauthorized} from "@aragon/osx-commons-contracts/src/permission/auth/auth.sol";
import {PluginRepo} from "@aragon/osx/framework/plugin/repo/PluginRepo.sol";

import {TokenVotingSetup} from "../../src/TokenVotingSetup.sol";
import {TokenVoting} from "../../src/TokenVoting.sol";
import {NON_EMPTY_BYTES} from "../constants.sol";

contract TokenVotingForkTest is ForkTestBase {
    DAO internal dao;
    TokenVoting internal plugin;
    PluginRepo internal repo;
    TokenVotingSetup internal setup;

    function setUp() public virtual override {
        super.setUp();
        setup = new TokenVotingSetup();

        (dao, repo, setup, plugin) = new ForkBuilder().build();
    }

    function test_endToEndFlow1() public {
        // Check the Repo
        PluginRepo.Version memory version = repo.getLatestVersion(repo.latestRelease());
        assertEq(version.pluginSetup, address(setup));
        assertEq(version.buildMetadata, NON_EMPTY_BYTES);

        // Check the DAO
        assertEq(keccak256(bytes(dao.daoURI())), keccak256(bytes("http://host/")));
    }

    function test_endToEndFlow2() public {
        (dao, repo, setup, plugin) = new ForkBuilder().build();

        // Check the Repo
        PluginRepo.Version memory version = repo.getLatestVersion(repo.latestRelease());
        assertEq(version.pluginSetup, address(setup));
        assertEq(version.buildMetadata, NON_EMPTY_BYTES);

        // Check the DAO
        assertEq(keccak256(bytes(dao.daoURI())), keccak256(bytes("http://host/")));
    }
}
