import {createDaoProxy} from '../20_integration-testing/test-helpers';
import {METADATA} from '../../plugin-settings';
import {
  ERC20,
  ERC20__factory,
  GovernanceERC20,
  GovernanceERC20__factory,
  GovernanceWrappedERC20,
  GovernanceWrappedERC20__factory,
} from '../../typechain';
import {ITokenVoting as MajorityVotingBase} from '../../typechain';
import {
  MINT_PERMISSION_ID,
  UPDATE_VOTING_SETTINGS_PERMISSION_ID,
} from '../test-utils/token-voting-constants';
import {
  TokenVoting__factory,
  TokenVotingSetup,
  TokenVotingSetup__factory,
} from '../test-utils/typechain-versions';
import {VotingMode} from '../test-utils/voting-helpers';
import {
  DAO_PERMISSIONS,
  Operation,
  PLUGIN_UUPS_UPGRADEABLE_PERMISSIONS,
} from '@aragon/osx-commons-sdk';
import {getNamedTypesFromMetadata} from '@aragon/osx-commons-sdk';
import {TIME} from '@aragon/osx-commons-sdk';
import {pctToRatio} from '@aragon/osx-commons-sdk';
import {DAO} from '@aragon/osx-ethers';
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
  defaultMintSettings: GovernanceERC20.MintSettingsStruct;
  defaultSkipTokenValidation: boolean;
  prepareInstallationInputs: string;
  prepareUninstallationInputs: string;
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
  const defaultSkipTokenValidation = false;

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

  const defaultVotingSettings: MajorityVotingBase.VotingSettingsStruct = {
    votingMode: VotingMode.EarlyExecution,
    supportThreshold: pctToRatio(50),
    minParticipation: pctToRatio(20),
    minDuration: TIME.HOUR,
    minProposerVotingPower: 0,
  };

  // Provide installation inputs
  const prepareInstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareInstallation.inputs
    ),
    [
      Object.values(defaultVotingSettings),
      Object.values(defaultTokenSettings),
      Object.values(defaultMintSettings),
      defaultSkipTokenValidation,
    ]
  );

  // Provide uninstallation inputs
  const prepareUninstallationInputs = ethers.utils.defaultAbiCoder.encode(
    getNamedTypesFromMetadata(
      METADATA.build.pluginSetup.prepareUninstallation.inputs
    ),
    []
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
    defaultSkipTokenValidation,
    prepareInstallationInputs,
    prepareUninstallationInputs,
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
      const {pluginSetup, dao, prepareInstallationInputs} = await loadFixture(
        fixture
      );

      // Try calling `prepareInstallation` without input data.
      await expect(pluginSetup.prepareInstallation(dao.address, [])).to.be
        .reverted;

      // Try calling `prepareInstallation` without input data of wrong length.
      const trimmedData = prepareInstallationInputs.substring(
        0,
        prepareInstallationInputs.length - 2
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
        defaultSkipTokenValidation,
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
          defaultSkipTokenValidation,
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
        defaultSkipTokenValidation,
      } = await loadFixture(fixture);

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [alice.address, '', ''], // Instead of a token address, we pass Alice's address here.
          Object.values(defaultMintSettings),
          defaultSkipTokenValidation,
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
        defaultSkipTokenValidation,
      } = await loadFixture(fixture);

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [dao.address, '', ''],
          Object.values(defaultMintSettings),
          defaultSkipTokenValidation,
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
        defaultSkipTokenValidation,
        erc20,
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
          defaultSkipTokenValidation,
        ]
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(dao.address, data);

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([anticipatedWrappedTokenAddress]);
      expect(permissions.length).to.be.equal(2);
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
      ]);
    });

    it('correctly sets up `GovernanceWrappedERC20` helper, when an ERC20 token address is supplied', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        defaultSkipTokenValidation,
        erc20,
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
          defaultSkipTokenValidation,
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
    });

    it('Skips all checks when we choose to bypass the token validation', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultMintSettings,
        erc20,

        governanceERC20Base,
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
          true,
        ]
      );

      await pluginSetup.prepareInstallation(dao.address, data);

      // we should have the name of the erc20 token
      const GovernanceWrappedERC20Factory = new GovernanceWrappedERC20__factory(
        deployer
      );
      const governanceWrappedERC20Contract =
        GovernanceWrappedERC20Factory.attach(erc20.address);

      expect(await governanceWrappedERC20Contract.name()).to.be.equal('erc20');
      expect(await governanceWrappedERC20Contract.symbol()).to.be.equal(
        'ERC20'
      );

      // this won't work because it was never wrapped
      await expect(governanceWrappedERC20Contract.underlying()).to.be.reverted;

      const mintPermission = await governanceERC20Base.MINT_PERMISSION_ID();

      // finally check that mint permission was not granted
      const p1 = dao.isGranted(
        erc20.address, // where
        dao.address, // who
        mintPermission, // id
        '0x' // data
      );

      const p2 = dao.isGranted(
        anticipatedWrappedTokenAddress, // where
        dao.address, // who
        mintPermission, // id
        '0x' // data
      );

      const [isGranted0, isGranted1] = await Promise.all([p1, p2]);

      expect(isGranted0).to.be.false;
      expect(isGranted1).to.be.false;
    });

    it('correctly returns plugin, helpers and permissions, when a governance token address is supplied', async () => {
      const {
        deployer,
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultSkipTokenValidation,
        defaultMintSettings,
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

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          [governanceERC20.address, '', ''],
          Object.values(defaultMintSettings),
          defaultSkipTokenValidation,
        ]
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(dao.address, data);

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([governanceERC20.address]);
      expect(permissions.length).to.be.equal(2);
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
      ]);
    });

    it('correctly returns plugin, helpers and permissions, when a token address is not supplied', async () => {
      const {
        pluginSetup,
        dao,
        defaultVotingSettings,
        defaultTokenSettings,
        defaultMintSettings,
        defaultSkipTokenValidation,
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

      const data = abiCoder.encode(
        getNamedTypesFromMetadata(
          METADATA.build.pluginSetup.prepareInstallation.inputs
        ),
        [
          Object.values(defaultVotingSettings),
          Object.values(defaultTokenSettings),
          Object.values(defaultMintSettings),
          defaultSkipTokenValidation,
        ]
      );

      const {
        plugin,
        preparedSetupData: {helpers, permissions},
      } = await pluginSetup.callStatic.prepareInstallation(dao.address, data);

      expect(plugin).to.be.equal(anticipatedPluginAddress);
      expect(helpers.length).to.be.equal(1);
      expect(helpers).to.be.deep.equal([anticipatedTokenAddress]);
      expect(permissions.length).to.be.equal(3);
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
        defaultSkipTokenValidation,
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
          defaultSkipTokenValidation,
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

      // check helpers
      const token = new GovernanceERC20__factory(deployer).attach(
        anticipatedTokenAddress
      );

      expect(await token.dao()).to.be.equal(daoAddress);
      expect(await token.name()).to.be.equal(defaultTokenSettings.name);
      expect(await token.symbol()).to.be.equal(defaultTokenSettings.symbol);
    });
  });

  describe('prepareUninstallation', async () => {
    it('fails when the wrong number of helpers is supplied', async () => {
      const {pluginSetup, dao, prepareUninstallationInputs} = await loadFixture(
        fixture
      );

      const plugin = ethers.Wallet.createRandom().address;

      await expect(
        pluginSetup.prepareUninstallation(dao.address, {
          plugin,
          currentHelpers: [],
          data: prepareUninstallationInputs,
        })
      )
        .to.be.revertedWithCustomError(pluginSetup, 'WrongHelpersArrayLength')
        .withArgs(0);

      await expect(
        pluginSetup.prepareUninstallation(dao.address, {
          plugin,
          currentHelpers: [AddressZero, AddressZero, AddressZero],
          data: prepareUninstallationInputs,
        })
      )
        .to.be.revertedWithCustomError(pluginSetup, 'WrongHelpersArrayLength')
        .withArgs(3);
    });

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
      ];

      expect(permissions1.length).to.be.equal(2);
      expect(permissions1).to.deep.equal(essentialPermissions);

      const permissions2 = await pluginSetup.callStatic.prepareUninstallation(
        dao.address,
        {
          plugin,
          currentHelpers: [governanceERC20.address],
          data: prepareUninstallationInputs,
        }
      );

      expect(permissions2.length).to.be.equal(2);
      expect(permissions2).to.deep.equal(essentialPermissions);
    });
  });
});
