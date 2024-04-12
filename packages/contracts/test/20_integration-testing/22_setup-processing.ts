import {METADATA, VERSION} from '../../plugin-settings';
import {GovernanceERC20} from '../../typechain';
import {MajorityVotingBase} from '../../typechain/src/MajorityVotingBase';
import {getProductionNetworkName, findPluginRepo} from '../../utils/helpers';
import {
  GovernanceERC20__factory,
  TokenVotingSetup,
  TokenVotingSetup__factory,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {
  createDaoProxy,
  installPLugin,
  uninstallPLugin,
  updateFromBuildTest,
} from './test-helpers';
import {
  getLatestNetworkDeployment,
  getNetworkNameByAlias,
} from '@aragon/osx-commons-configs';
import {
  DAO_PERMISSIONS,
  PLUGIN_SETUP_PROCESSOR_PERMISSIONS,
  TIME,
  UnsupportedNetworkError,
  getNamedTypesFromMetadata,
  pctToRatio,
} from '@aragon/osx-commons-sdk';
import {
  PluginSetupProcessor,
  PluginRepo,
  PluginSetupProcessorStructs,
  PluginSetupProcessor__factory,
  DAO,
  TokenVoting__factory,
} from '@aragon/osx-ethers';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import env, {deployments, ethers} from 'hardhat';

const productionNetworkName = getProductionNetworkName(env);

type FixtureResult = {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  dao: DAO;
  psp: PluginSetupProcessor;
  pluginRepo: PluginRepo;
  pluginSetup: TokenVotingSetup;
  pluginSetupRefLatestBuild: PluginSetupProcessorStructs.PluginSetupRefStruct;
  defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
  defaultTokenSettings: {
    addr: string;
    name: string;
    symbol: string;
  };
  defaultMintSettings: GovernanceERC20.MintSettingsStruct;
};

async function fixture(): Promise<FixtureResult> {
  // Deploy all contracts
  const tags = ['CreateRepo', 'NewVersion'];
  await deployments.fixture(tags);

  const [deployer, alice, bob] = await ethers.getSigners();
  const dummyMetadata = ethers.utils.hexlify(
    ethers.utils.toUtf8Bytes('0x123456789')
  );
  const dao = await createDaoProxy(deployer, dummyMetadata);

  const network = getNetworkNameByAlias(productionNetworkName);
  if (network === null) {
    throw new UnsupportedNetworkError(productionNetworkName);
  }
  const networkDeployments = getLatestNetworkDeployment(network);
  if (networkDeployments === null) {
    throw `Deployments are not available on network ${network}.`;
  }

  // Get the `PluginSetupProcessor` from the network
  const psp = PluginSetupProcessor__factory.connect(
    networkDeployments.PluginSetupProcessor.address,
    deployer
  );

  const token = await new GovernanceERC20__factory(deployer).deploy(
    dao.address,
    'GovernanceERC20',
    'GOV',
    {
      receivers: [deployer.address],
      amounts: ['100'],
    }
  );

  // Get the deployed `PluginRepo`
  const {pluginRepo, ensDomain} = await findPluginRepo(env);
  if (pluginRepo === null) {
    throw `PluginRepo '${ensDomain}' does not exist yet.`;
  }

  const release = 1;
  const latestVersion = await pluginRepo['getLatestVersion(uint8)'](release);

  const pluginSetup = TokenVotingSetup__factory.connect(
    latestVersion.pluginSetup,
    deployer
  );

  const pluginSetupRefLatestBuild = {
    versionTag: {
      release: VERSION.release,
      build: VERSION.build,
    },
    pluginSetupRepo: pluginRepo.address,
  };

  const defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
    votingMode: VotingMode.EarlyExecution,
    supportThreshold: pctToRatio(50),
    minParticipation: pctToRatio(20),
    minDuration: TIME.HOUR,
    minProposerVotingPower: 0,
  };

  const defaultTokenSettings = {
    addr: token.address,
    name: '', // only relevant if `address(0)` is provided as the token address
    symbol: '', // only relevant if `address(0)` is provided as the token address
  };

  const defaultMintSettings = {
    receivers: [],
    amounts: [],
  };

  return {
    deployer,
    alice,
    bob,
    psp,
    dao,
    pluginRepo,
    pluginSetup,
    pluginSetupRefLatestBuild,
    defaultVotingSettings,
    defaultTokenSettings,
    defaultMintSettings,
  };
}

describe(`PluginSetup processing on network '${productionNetworkName}'`, function () {
  it('installs & uninstalls the current build with a token', async () => {
    const {
      alice,
      deployer,
      psp,
      dao,
      pluginSetupRefLatestBuild,
      defaultVotingSettings,
      defaultTokenSettings,
      defaultMintSettings,
    } = await loadFixture(fixture);

    // Grant deployer all required permissions
    await dao
      .connect(deployer)
      .grant(
        psp.address,
        deployer.address,
        PLUGIN_SETUP_PROCESSOR_PERMISSIONS.APPLY_INSTALLATION_PERMISSION_ID
      );
    await dao
      .connect(deployer)
      .grant(
        psp.address,
        deployer.address,
        PLUGIN_SETUP_PROCESSOR_PERMISSIONS.APPLY_UNINSTALLATION_PERMISSION_ID
      );
    await dao
      .connect(deployer)
      .grant(dao.address, psp.address, DAO_PERMISSIONS.ROOT_PERMISSION_ID);

    const prepareInstallData = {
      votingSettings: Object.values(defaultVotingSettings),
      tokenSettings: Object.values(defaultTokenSettings),
      mintSettings: Object.values(defaultMintSettings),
    };

    const prepareInstallInputType = getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareInstallation.inputs
    );

    const results = await installPLugin(
      deployer,
      psp,
      dao,
      pluginSetupRefLatestBuild,
      ethers.utils.defaultAbiCoder.encode(
        prepareInstallInputType,
        Object.values(prepareInstallData)
      )
    );

    const plugin = TokenVoting__factory.connect(
      results.preparedEvent.args.plugin,
      deployer
    );

    const pluginToken = await plugin.getVotingToken();

    // we used an existing token so the deployer (who was minted tokens)
    // in the test fixture will be a member, but alice won't be
    expect(await plugin.isMember(alice.address)).to.be.false;
    expect(await plugin.isMember(deployer.address)).to.be.true;

    // Uninstall the current build.
    await uninstallPLugin(
      deployer,
      psp,
      dao,
      plugin,
      pluginSetupRefLatestBuild,
      ethers.utils.defaultAbiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareUninstallation.inputs
        ),
        []
      ),
      [pluginToken]
    );
  });

  it('installs & uninstalls the current build without a token', async () => {
    const {
      alice,
      deployer,
      psp,
      dao,
      defaultVotingSettings,
      pluginSetupRefLatestBuild,
    } = await loadFixture(fixture);

    // Grant deployer all required permissions
    await dao
      .connect(deployer)
      .grant(
        psp.address,
        deployer.address,
        PLUGIN_SETUP_PROCESSOR_PERMISSIONS.APPLY_INSTALLATION_PERMISSION_ID
      );
    await dao
      .connect(deployer)
      .grant(
        psp.address,
        deployer.address,
        PLUGIN_SETUP_PROCESSOR_PERMISSIONS.APPLY_UNINSTALLATION_PERMISSION_ID
      );
    await dao
      .connect(deployer)
      .grant(dao.address, psp.address, DAO_PERMISSIONS.ROOT_PERMISSION_ID);

    const prepareInstallData = {
      votingSettings: Object.values(defaultVotingSettings),
      tokenSettings: [ethers.constants.AddressZero, 'testToken', 'TEST'],
      mintSettings: [[alice.address], ['1000']],
    };

    const prepareInstallInputType = getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareInstallation.inputs
    );

    const results = await installPLugin(
      deployer,
      psp,
      dao,
      pluginSetupRefLatestBuild,
      ethers.utils.defaultAbiCoder.encode(
        prepareInstallInputType,
        Object.values(prepareInstallData)
      )
    );

    const plugin = TokenVoting__factory.connect(
      results.preparedEvent.args.plugin,
      deployer
    );

    const pluginToken = await plugin.getVotingToken();

    // We didn't pass a token so one was created and the deployer (who was minted tokens)
    // is not yet a member, but alice is - as the mint settings were set to mint tokens for her
    expect(await plugin.isMember(alice.address)).to.be.true;
    expect(await plugin.isMember(deployer.address)).to.be.false;

    // Uninstall the current build.
    await uninstallPLugin(
      deployer,
      psp,
      dao,
      plugin,
      pluginSetupRefLatestBuild,
      ethers.utils.defaultAbiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareUninstallation.inputs
        ),
        []
      ),
      [pluginToken]
    );
  });

  it('updates from build 1 to the current build', async () => {
    const {
      deployer,
      psp,
      dao,
      defaultVotingSettings,
      defaultTokenSettings,
      defaultMintSettings,
      pluginRepo,
      pluginSetupRefLatestBuild,
    } = await loadFixture(fixture);

    const prepareInstallData = {
      votingSettings: Object.values(defaultVotingSettings),
      tokenSettings: Object.values(defaultTokenSettings),
      mintSettings: Object.values(defaultMintSettings),
    };

    await updateFromBuildTest(
      dao,
      deployer,
      psp,
      pluginRepo,
      pluginSetupRefLatestBuild,
      1,
      Object.values(prepareInstallData),
      []
    );
  });

  it('updates from build 2 to the current build', async () => {
    const {
      deployer,
      psp,
      dao,
      pluginRepo,
      pluginSetupRefLatestBuild,
      defaultVotingSettings,
      defaultTokenSettings,
      defaultMintSettings,
    } = await loadFixture(fixture);

    const prepareInstallData = {
      votingSettings: Object.values(defaultVotingSettings),
      tokenSettings: Object.values(defaultTokenSettings),
      mintSettings: Object.values(defaultMintSettings),
    };

    await updateFromBuildTest(
      dao,
      deployer,
      psp,
      pluginRepo,
      pluginSetupRefLatestBuild,
      2,
      Object.values(prepareInstallData),
      []
    );
  });
});
