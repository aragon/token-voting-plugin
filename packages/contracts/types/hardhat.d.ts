import {Wrapper} from '../test/test-utils/wrapper';

declare module 'hardhat/types/runtime' {
    interface HardhatRuntimeEnvironment {
      wrapper: Wrapper;
    }
}