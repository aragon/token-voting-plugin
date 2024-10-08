import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {METADATA} from '../../plugin-settings';
import {
  ERC20,
  ERC20__factory,
  GovernanceERC20,
  GovernanceERC20__factory,
  GovernanceWrappedERC20,
  GovernanceWrappedERC20__factory,
  IERC20Upgradeable__factory,
  IVotesUpgradeable__factory,
} from '../../typechain';
import {plugins} from '../../typechain/@aragon/osx-v1.0.0';
import {IGovernanceWrappedERC20__factory} from '../../typechain/factories/src/ERC20/governance';
import {MajorityVotingBase} from '../../typechain/src/MajorityVotingBase';
import {
  ANY_ADDR,
  CREATE_PROPOSAL_PERMISSION_ID,
  MINT_PERMISSION_ID,
  SET_TARGET_CONFIG_PERMISSION_ID,
  TargetConfig,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
} from '../test-utils/token-voting-constants';
import {Operation as Op} from '../test-utils/token-voting-constants';
import {
  TokenVoting__factory,
  TokenVotingSetup,
  TokenVotingSetup__factory,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {
  DAO_PERMISSIONS,
  getInterfaceId,
  Operation,
  PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS,
} from '@aragon/osx-commons-sdk';
import {getNamedTypesFromMetadata} from '@aragon/osx-commons-sdk';
import {TIME} from '@aragon/osx-commons-sdk';
import {pctToRatio} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
import {BigNumber} from '@ethersproject/bignumber';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

const abiCoder = ethers.utils.defaultAbiCoder;
const AddressZero = ethers.constants.AddressZero;

type FixtureResult = {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
  pluginSetup: TokenVotingSetup;
  defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct;
  defaultTokenSettings: {
    addr: string;
    name: string;
    symbol: string;
  };
  defaultTargetConfig: TargetConfig;
  defaultMintSettings: GovernanceERC20.MintSettingsStruct;
  defaultMinApproval: BigNumber;
  defaultMetadata: string;
  updateMinApproval: BigNumber;
  updateMetadata: string;
  updateTargetConfig: TargetConfig;
  prepareInstallationInputs: string;
  prepareUninstallationInputs: string;
  prepareUpdateBuild3Inputs: string;
  dao: DAO;
  governanceERC20Base: GovernanceERC20;
  governanceWrappedERC20Base: GovernanceWrappedERC20;
  erc20: ERC20;
};

async function fixture(): Promise<FixtureResult> {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  // Deploy a DAO proxy.
  const dummyMetadata = '0x12345678';
  const dao = await createDaoProxy(deployer, dummyMetadata);

  const defaultTokenSettings = {
    addr: AddressZero,
    name: 'Name',
    symbol: 'SYMB',
  };
  const defaultMintSettings = {receivers: [], amounts: []};

  const erc20 = await new ERC20__factory(deployer).deploy('erc20', 'ERC20');

  // Deploy the GovernanceERC20 token base class
  const governanceERC20Base = await new GovernanceERC20__factory(
    deployer
  ).deploy(AddressZero, 'gov', 'GOV', defaultMintSettings);

  // Deploy the GovernanceWrappedERC20 token base class
  const governanceWrappedERC20Base = await new GovernanceWrappedERC20__factory(
    deployer
  ).deploy(AddressZero, 'wrappedGov', 'wGOV');

  // Deploy a plugin setup contract
  const pluginSetup = await new TokenVotingSetup__factory(deployer).deploy(
    governanceERC20Base.address,
    governanceWrappedERC20Base.address
  );

  const defaultTargetConfig: TargetConfig = {
    target: dao.address,
    operation: Op.call,
  };

  const defaultMetadata: string = '0x11';

  const defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
    votingMode: VotingMode.EarlyExecution,
    supportThreshold: pctToRatio(50),
    minParticipation: pctToRatio(20),
    minDuration: TIME.HOUR,
    minProposerVotingPower: 0,
  };

  const defaultMinApproval = pctToRatio(30);

  // Provide installation inputs
  const prepareInstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareInstallation.inputs
    ),
    [
      Object.values(defaultVotingSettings),
      Object.values(defaultTokenSettings),
      Object.values(defaultMintSettings),
      Object.values(defaultTargetConfig),
      defaultMinApproval,
      defaultMetadata,
    ]
  );

  // Provide uninstallation inputs
  const prepareUninstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareUninstallation.inputs
    ),
    []
  );

  const updateMinApproval = pctToRatio(35);
  const updateTargetConfig: TargetConfig = {
    target: pluginSetup.address,
    operation: Op.call,
  };
  const updateMetadata: string = '0x11';

  // Provide update inputs
  const prepareUpdateBuild3Inputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareUpdate[3].inputs
    ),
    [updateMinApproval, updateTargetConfig, updateMetadata]
  );

  return {
    deployer,
    alice,
    bob,
    carol,
    pluginSetup,
    defaultVotingSettings,
    defaultTokenSettings,
    defaultMintSettings,
    defaultMinApproval,
    defaultMetadata,
    defaultTargetConfig,
    updateMinApproval,
    updateTargetConfig,
    updateMetadata,
    prepareInstallationInputs,
    prepareUninstallationInputs,
    prepareUpdateBuild3Inputs,
    dao,
    governanceERC20Base,
    governanceWrappedERC20Base,
    erc20,
  };
}

describe('TokenVotingSetup', function () {
  it('does not support the empty interface', async () => {
    const {pluginSetup} = await loadFixture(fixture);
    expect(await pluginSetup.supportsInterface('0xffffffff')).to.be.false;
  });

  it('stores the bases provided through the constructor', async () => {
    const {pluginSetup, governanceERC20Base, governanceWrappedERC20Base} =
      await loadFixture(fixture);

    expect(await pluginSetup.governanceERC20Base()).to.be.eq(
      governanceERC20Base.address
    );
    expect(await pluginSetup.governanceWrappedERC20Base()).to.be.eq(
      governanceWrappedERC20Base.address
    );
  });

  describe('prepareInstallation', async () => {
    it('fails if data is empty, or not of minimum length', async () => {
      const {pluginSetup, dao, prepareInstallationInputs, defaultMetadata} =
        await loadFixture(fixture);

      // Try calling `prepareInstallation` without input data.
      await expect(pluginSetup.prepareInstallation(dao.address, [])).to.be
        .reverted;

      // Try calling `prepareInstallation` with input data of wrong length.
      const trimmedData = prepareInstallationInputs.substring(
        0,
        prepareInstallationInputs.length - 100
      );
      await expect(pluginSetup.prepareInstallation(dao.address, trimmedData)).to
        .be.reverted;

      // Check that `prepareInstallation` can be called with the correct input data.
      await expect(
        pluginSetup.prepareInstallation(dao.address, prepareInstallationInputs)
      ).not.to.be.reverted;
    });

    it('fails if `MintSettings` arrays do not have the same length', async () => {
      const {
        alice,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultTokenSettings,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const receivers: string[] = [AddressZero];
      const amounts: number[] = [];
      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          Object.values(defaultTokenSettings),
          {receivers, amounts},
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce,
      });

      const GovernanceERC20 = new GovernanceERC20__factory(alice);

      const govToken = GovernanceERC20.attach(anticipatedPluginAddress);

      await expect(pluginSetup.prepareInstallation(dao.address, data))
        .to.be.revertedWithCustomError(
          govToken,
          'MintSettingsArrayLengthMismatch'
        )
        .withArgs(1, 0);
    });

    it('fails if passed token address is not a contract', async () => {
      const {
        alice,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [alice.address, '', ''], // Instead of a token address, we pass Alice's address here.
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      await expect(pluginSetup.prepareInstallation(dao.address, data))
        .to.be.revertedWithCustomError(pluginSetup, 'TokenNotContract')
        .withArgs(alice.address);
    });

    it('fails if passed token address is not ERC20', async () => {
      const {
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [dao.address, '', ''],
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      await expect(pluginSetup.prepareInstallation(dao.address, data))
        .to.be.revertedWithCustomError(pluginSetup, 'TokenNotERC20')
        .withArgs(dao.address);
    });

    it('correctly returns plugin, helpers and permissions, when an ERC20 token address is supplied', async () => {
      const {
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultTokenSettings,
        defaultMintSettings,
        erc20,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );
      const anticipatedWrappedTokenAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce,
      });
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });
      const anticipatedCondition = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 2,
      });

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),

          [
            erc20.address,
            defaultTokenSettings.name,
            defaultTokenSettings.symbol,
          ],
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(dao.address, data);

      expect(await pluginSetup.supportsIVotesInterface(erc20.address)).to.be
        .false;

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(2);
      expect(helpers).to.be.deep.equal([
        anticipatedWrappedTokenAddress,
        anticipatedCondition,
      ]);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          dao.address,
          plugin,
          AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          plugin,
          ANY_ADDR,
          anticipatedCondition,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        erc20,
        defaultTargetConfig,
        defaultMinApproval,
        defaultMetadata,
      } = await loadFixture(fixture);

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );
      const anticipatedWrappedTokenAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce,
      });

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [erc20.address, 'myName', 'mySymb'],
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      await pluginSetup.prepareInstallation(dao.address, data);

      const GovernanceWrappedERC20Factory = new GovernanceWrappedERC20__factory(
        deployer
      );
      const governanceWrappedERC20Contract =
        GovernanceWrappedERC20Factory.attach(anticipatedWrappedTokenAddress);

      expect(await governanceWrappedERC20Contract.name()).to.be.equal('myName');
      expect(await governanceWrappedERC20Contract.symbol()).to.be.equal(
        'mySymb'
      );
      expect(await governanceWrappedERC20Contract.underlying()).to.be.equal(
        erc20.address
      );

      expect(await pluginSetup.supportsIVotesInterface(erc20.address)).to.be
        .false;

      // If a token address is not passed, it must have deployed GovernanceERC20.
      const ivotesInterfaceId = getInterfaceId(
        IVotesUpgradeable__factory.createInterface()
      );
      const iERC20InterfaceId = getInterfaceId(
        IERC20Upgradeable__factory.createInterface()
      );
      const iGovernanceWrappedERC20 = getInterfaceId(
        IGovernanceWrappedERC20__factory.createInterface()
      );

      expect(
        await governanceWrappedERC20Contract.supportsInterface(
          ivotesInterfaceId
        )
      ).to.be.true;
      expect(
        await governanceWrappedERC20Contract.supportsInterface(
          iERC20InterfaceId
        )
      ).to.be.true;
      expect(
        await governanceWrappedERC20Contract.supportsInterface(
          iGovernanceWrappedERC20
        )
      ).to.be.true;
    });

    it('correctly returns plugin, helpers and permissions, when a governance token address is supplied', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const governanceERC20 = await new GovernanceERC20__factory(
        deployer
      ).deploy(dao.address, 'name', 'symbol', {receivers: [], amounts: []});

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );

      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce,
      });

      const anticipatedCondition = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [governanceERC20.address, '', ''],
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(dao.address, data);

      expect(await pluginSetup.supportsIVotesInterface(governanceERC20.address))
        .to.be.true;

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(2);
      expect(helpers).to.be.deep.equal([
        governanceERC20.address,
        anticipatedCondition,
      ]);
      expect(permissions.length).to.be.equal(4);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          dao.address,
          plugin,
          AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          plugin,
          ANY_ADDR,
          anticipatedCondition,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly returns plugin, helpers and permissions, when a token address is not supplied', async () => {
      const {
        pluginSetup,
        dao,
        defaultTokenSettings,
        prepareInstallationInputs,
      } = await loadFixture(fixture);

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );
      const anticipatedTokenAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce,
      });

      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });

      const anticipatedCondition = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 2,
      });

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(
        dao.address,
        prepareInstallationInputs
      );

      expect(
        await pluginSetup.supportsIVotesInterface(defaultTokenSettings.addr)
      ).to.be.false;

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(2);
      expect(helpers).to.be.deep.equal([
        anticipatedTokenAddress,
        anticipatedCondition,
      ]);
      expect(permissions.length).to.be.equal(5);
      expect(permissions).to.deep.equal([
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          dao.address,
          plugin,
          AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          plugin,
          ANY_ADDR,
          anticipatedCondition,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          anticipatedTokenAddress,
          dao.address,
          AddressZero,
          MINT_PERMISSION_ID,
        ],
      ]);
    });

    it('correctly sets up the plugin and helpers, when a token address is not passed', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultTokenSettings,
        defaultMintSettings,
        defaultMinApproval,
        defaultTargetConfig,
        defaultMetadata,
      } = await loadFixture(fixture);

      const daoAddress = dao.address;

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [AddressZero, defaultTokenSettings.name, defaultTokenSettings.symbol],
          Object.values(defaultMintSettings),
          defaultTargetConfig,
          defaultMinApproval,
          defaultMetadata,
        ]
      );

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );
      const anticipatedTokenAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce,
      });
      const anticipatedPluginAddress = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });

      await pluginSetup.prepareInstallation(daoAddress, data);

      // check plugin
      const tokenVoting = new TokenVoting__factory(deployer).attach(
        anticipatedPluginAddress
      );

      expect(await tokenVoting.dao()).to.be.equal(daoAddress);

      expect(await tokenVoting.minParticipation()).to.be.equal(
        defaultVotingSettings.minParticipation
      );
      expect(await tokenVoting.supportThreshold()).to.be.equal(
        defaultVotingSettings.supportThreshold
      );
      expect(await tokenVoting.minDuration()).to.be.equal(
        defaultVotingSettings.minDuration
      );
      expect(await tokenVoting.minProposerVotingPower()).to.be.equal(
        defaultVotingSettings.minProposerVotingPower
      );
      expect(await tokenVoting.getVotingToken()).to.be.equal(
        anticipatedTokenAddress
      );

      expect(await tokenVoting.getTargetConfig()).to.deep.equal([
        defaultTargetConfig.target,
        defaultTargetConfig.operation,
      ]);

      // check helpers
      const token = new GovernanceERC20__factory(deployer).attach(
        anticipatedTokenAddress
      );

      expect(await token.dao()).to.be.equal(daoAddress);
      expect(await token.name()).to.be.equal(defaultTokenSettings.name);
      expect(await token.symbol()).to.be.equal(defaultTokenSettings.symbol);

      // If a token address is not passed, it must have deployed GovernanceERC20.
      const ivotesInterfaceId = getInterfaceId(
        IVotesUpgradeable__factory.createInterface()
      );
      const iERC20InterfaceId = getInterfaceId(
        IERC20Upgradeable__factory.createInterface()
      );

      expect(await token.supportsInterface(ivotesInterfaceId)).to.be.true;
      expect(await token.supportsInterface(iERC20InterfaceId)).to.be.true;
    });
  });

  describe('prepareUpdate', async () => {
    it('returns the permissions expected for the update from build 1', async () => {
      const {
        pluginSetup,
        dao,
        prepareInstallationInputs,
        prepareUpdateBuild3Inputs,
      } = await loadFixture(fixture);

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );

      const plugin = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });

      await pluginSetup.prepareInstallation(
        dao.address,
        prepareInstallationInputs
      );

      // Make a static call to check that the plugin update data being returned is correct.
      const {
        initData: initData,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareUpdate(dao.address, 1, {
        currentHelpers: [
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ],
        data: prepareUpdateBuild3Inputs,
        plugin,
      });

      // Check the return data.
      expect(initData).to.be.eq(
        TokenVoting__factory.createInterface().encodeFunctionData(
          'initializeFrom',
          [1, prepareUpdateBuild3Inputs]
        )
      );

      const currentNonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );

      const anticipatedCondition = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: currentNonce,
      });

      expect(helpers).to.deep.equal([anticipatedCondition]);
      expect(permissions.length).to.be.eql(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          plugin,
          dao.address,
          AddressZero,
          PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          plugin,
          ANY_ADDR,
          anticipatedCondition,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
      ]);
    });

    it('returns the permissions expected for the update from build 2', async () => {
      const {
        pluginSetup,
        dao,
        prepareInstallationInputs,
        prepareUpdateBuild3Inputs,
      } = await loadFixture(fixture);

      const nonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );

      const plugin = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: nonce + 1,
      });

      await pluginSetup.prepareInstallation(
        dao.address,
        prepareInstallationInputs
      );

      // Make a static call to check that the plugin update data being returned is correct.
      const {
        initData: initData,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareUpdate(dao.address, 2, {
        currentHelpers: [
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ],
        data: prepareUpdateBuild3Inputs,
        plugin,
      });

      const currentNonce = await ethers.provider.getTransactionCount(
        pluginSetup.address
      );

      const anticipatedCondition = ethers.utils.getContractAddress({
        from: pluginSetup.address,
        nonce: currentNonce,
      });

      // Check the return data.
      expect(initData).to.be.eq(
        TokenVoting__factory.createInterface().encodeFunctionData(
          'initializeFrom',
          [2, prepareUpdateBuild3Inputs]
        )
      );
      expect(helpers).to.be.eql([anticipatedCondition]);
      expect(permissions.length).to.be.eql(3);
      expect(permissions).to.deep.equal([
        [
          Operation.Revoke,
          plugin,
          dao.address,
          AddressZero,
          PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS.UPGRADE_PLUGIN_PERMISSION_ID,
        ],
        [
          Operation.GrantWithCondition,
          plugin,
          ANY_ADDR,
          anticipatedCondition,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
        [
          Operation.Grant,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
      ]);
    });

    it('returns the permissions expected for the update from build 3 (empty list)', async () => {
      const {pluginSetup, dao, prepareUpdateBuild3Inputs} = await loadFixture(
        fixture
      );
      const plugin = ethers.Wallet.createRandom().address;

      // Make a static call to check that the plugin update data being returned is correct.
      const {
        initData: initData,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareUpdate(dao.address, 3, {
        currentHelpers: [
          ethers.Wallet.createRandom().address,
          ethers.Wallet.createRandom().address,
        ],
        data: prepareUpdateBuild3Inputs,
        plugin,
      });

      // Check the return data. There should be no permission needed for build 3.
      expect(initData).to.be.eq('0x');
      expect(permissions.length).to.be.equal(0);
      expect(helpers.length).to.be.equal(0);
    });
  });

  describe('prepareUninstallation', async () => {
    it('correctly returns permissions, when the required number of helpers is supplied', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultTokenSettings,
        prepareUninstallationInputs,
      } = await loadFixture(fixture);

      const plugin = ethers.Wallet.createRandom().address;
      const governanceERC20 = await new GovernanceERC20__factory(
        deployer
      ).deploy(
        dao.address,
        defaultTokenSettings.name,
        defaultTokenSettings.symbol,
        {
          receivers: [],
          amounts: [],
        }
      );

      const governanceWrappedERC20 = await new GovernanceWrappedERC20__factory(
        deployer
      ).deploy(
        governanceERC20.address,
        defaultTokenSettings.name,
        defaultTokenSettings.symbol
      );

      // When the helpers contain governanceWrappedERC20 token
      const permissions1 = await pluginSetup.callStatic.prepareUninstallation(
        dao.address,
        {
          plugin,
          currentHelpers: [governanceWrappedERC20.address],
          data: prepareUninstallationInputs,
        }
      );

      const essentialPermissions = [
        [
          Operation.Revoke,
          plugin,
          dao.address,
          AddressZero,
          UPDATE_VOTING_SETTINGS_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          dao.address,
          plugin,
          AddressZero,
          DAO_PERMISSIONS.EXECUTE_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          dao.address,
          AddressZero,
          SET_TARGET_CONFIG_PERMISSION_ID,
        ],
        [
          Operation.Revoke,
          plugin,
          ANY_ADDR,
          AddressZero,
          CREATE_PROPOSAL_PERMISSION_ID,
        ],
      ];

      expect(permissions1.length).to.be.equal(4);
      expect(permissions1).to.deep.equal(essentialPermissions);

      const permissions2 = await pluginSetup.callStatic.prepareUninstallation(
        dao.address,
        {
          plugin,
          currentHelpers: [governanceERC20.address],
          data: prepareUninstallationInputs,
        }
      );

      expect(permissions2.length).to.be.equal(4);
      expect(permissions2).to.deep.equal(essentialPermissions);
    });
  });
});
