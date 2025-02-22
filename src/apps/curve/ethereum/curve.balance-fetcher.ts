import { Inject } from '@nestjs/common';

import { Register } from '~app-toolkit/decorators';
import { presentBalanceFetcherResponse } from '~app-toolkit/helpers/presentation/balance-fetcher-response.present';
import { BalanceFetcher } from '~balance/balance-fetcher.interface';
import { APP_TOOLKIT, IAppToolkit } from '~lib';
import { isClaimable } from '~position/position.utils';
import { Network } from '~types/network.interface';

import {
  CurveContractFactory,
  CurveDoubleGauge,
  CurveGauge,
  CurveGaugeV2,
  CurveNGauge,
  CurveVestingEscrow,
  CurveVotingEscrow,
  CurveVotingEscrowReward,
} from '../contracts';
import { CURVE_DEFINITION } from '../curve.definition';
import { CurveVestingEscrowContractPositionBalanceHelper } from '../helpers/curve.vesting-escrow.contract-position-balance-helper';
import { CurveVotingEscrowContractPositionBalanceHelper } from '../helpers/curve.voting-escrow.contract-position-balance-helper';

const network = Network.ETHEREUM_MAINNET;

@Register.BalanceFetcher(CURVE_DEFINITION.id, Network.ETHEREUM_MAINNET)
export class EthereumCurveBalanceFetcher implements BalanceFetcher {
  constructor(
    @Inject(APP_TOOLKIT) private readonly appToolkit: IAppToolkit,
    @Inject(CurveVotingEscrowContractPositionBalanceHelper)
    private readonly curveVotingEscrowContractPositionBalanceHelper: CurveVotingEscrowContractPositionBalanceHelper,
    @Inject(CurveVestingEscrowContractPositionBalanceHelper)
    private readonly curveVestingEscrowContractPositionBalanceHelper: CurveVestingEscrowContractPositionBalanceHelper,
    @Inject(CurveContractFactory) private readonly curveContractFactory: CurveContractFactory,
  ) {}

  private async getPoolTokenBalances(address: string) {
    return this.appToolkit.helpers.tokenBalanceHelper.getTokenBalances({
      network,
      appId: CURVE_DEFINITION.id,
      groupId: CURVE_DEFINITION.groups.pool.id,
      address,
    });
  }

  private async getStakedBalances(address: string) {
    return Promise.all([
      // Single Gauge
      this.appToolkit.helpers.singleStakingContractPositionBalanceHelper.getBalances<CurveGauge>({
        address,
        network,
        appId: CURVE_DEFINITION.id,
        groupId: CURVE_DEFINITION.groups.farm.id,
        farmFilter: farm => farm.dataProps.implementation === 'single-gauge',
        resolveContract: ({ address, network }) => this.curveContractFactory.curveGauge({ address, network }),
        resolveStakedTokenBalance: ({ contract, address, multicall }) => multicall.wrap(contract).balanceOf(address),
        resolveRewardTokenBalances: ({ contract, address, multicall }) =>
          multicall.wrap(contract).claimable_tokens(address),
      }),
      // Double Gauge
      this.appToolkit.helpers.singleStakingContractPositionBalanceHelper.getBalances<CurveDoubleGauge>({
        address,
        network,
        appId: CURVE_DEFINITION.id,
        groupId: CURVE_DEFINITION.groups.farm.id,
        farmFilter: farm => farm.dataProps.implementation === 'double-gauge',
        resolveContract: ({ address, network }) => this.curveContractFactory.curveDoubleGauge({ address, network }),
        resolveStakedTokenBalance: ({ contract, address, multicall }) => multicall.wrap(contract).balanceOf(address),
        resolveRewardTokenBalances: async ({ contract, address, multicall, contractPosition }) => {
          const rewardTokens = contractPosition.tokens.filter(isClaimable);
          const wrappedContract = multicall.wrap(contract);
          const primaryRewardBalance = await wrappedContract.claimable_tokens(address);
          const rewardBalances = [primaryRewardBalance.toString()];

          if (rewardTokens.length > 1) {
            const [secondaryRewardBalanceTotal, secondaryRewardBalanceClaimed] = await Promise.all([
              wrappedContract.claimable_reward(address),
              wrappedContract.claimed_rewards_for(address),
            ]);

            const secondaryRewardBalance = this.appToolkit
              .getBigNumber(secondaryRewardBalanceTotal)
              .minus(this.appToolkit.getBigNumber(secondaryRewardBalanceClaimed))
              .toFixed(0);
            rewardBalances.push(secondaryRewardBalance);
          }

          return rewardBalances;
        },
      }),
      this.appToolkit.helpers.singleStakingContractPositionBalanceHelper.getBalances<CurveNGauge>({
        address,
        network,
        appId: CURVE_DEFINITION.id,
        groupId: CURVE_DEFINITION.groups.farm.id,
        farmFilter: farm => farm.dataProps.implementation === 'n-gauge',
        resolveContract: ({ address, network }) => this.curveContractFactory.curveNGauge({ address, network }),
        resolveStakedTokenBalance: ({ contract, address, multicall }) => multicall.wrap(contract).balanceOf(address),
        resolveRewardTokenBalances: async ({ contract, address, multicall, contractPosition }) => {
          const rewardTokens = contractPosition.tokens.filter(isClaimable);
          const wrappedContract = multicall.wrap(contract);
          const primaryRewardBalance = await wrappedContract.claimable_tokens(address);
          const rewardBalances = [primaryRewardBalance];

          if (rewardTokens.length > 1) {
            const secondaryRewardBalance = await wrappedContract.claimable_reward(address, rewardTokens[1].address);
            rewardBalances.push(secondaryRewardBalance);
          }

          return rewardBalances;
        },
      }),
      this.appToolkit.helpers.singleStakingContractPositionBalanceHelper.getBalances<CurveGaugeV2>({
        address,
        network,
        appId: CURVE_DEFINITION.id,
        groupId: CURVE_DEFINITION.groups.farm.id,
        farmFilter: farm => farm.dataProps.implementation === 'n-gauge-v2',
        resolveContract: ({ address, network }) => this.curveContractFactory.curveGaugeV2({ address, network }),
        resolveStakedTokenBalance: ({ contract, address, multicall }) => multicall.wrap(contract).balanceOf(address),
        resolveRewardTokenBalances: ({ contract, address, multicall, contractPosition }) => {
          const rewardTokens = contractPosition.tokens.filter(isClaimable);
          const wrappedContract = multicall.wrap(contract);
          return Promise.all(rewardTokens.map(v => wrappedContract.claimable_reward_write(address, v.address)));
        },
      }),
    ]).then(v => v.flat());
  }

  private async getVotingEscrowBalances(address: string) {
    return this.curveVotingEscrowContractPositionBalanceHelper.getBalances<CurveVotingEscrow, CurveVotingEscrowReward>({
      address,
      appId: CURVE_DEFINITION.id,
      groupId: CURVE_DEFINITION.groups.votingEscrow.id,
      network,
      resolveContract: ({ contractFactory, address }) => contractFactory.curveVotingEscrow({ network, address }),
      resolveRewardContract: ({ contractFactory, address }) =>
        contractFactory.curveVotingEscrowReward({ network, address }),
      resolveLockedTokenBalance: ({ contract, multicall }) =>
        multicall
          .wrap(contract)
          .locked(address)
          .then(v => v.amount),
      resolveRewardTokenBalance: ({ contract }) => contract.callStatic['claim()']({ from: address }),
    });
  }

  private async getVestingEscrowBalances(address: string) {
    return this.curveVestingEscrowContractPositionBalanceHelper.getBalances<CurveVestingEscrow>({
      address,
      appId: CURVE_DEFINITION.id,
      groupId: CURVE_DEFINITION.groups.vestingEscrow.id,
      network,
      resolveContract: ({ contractFactory, address }) => contractFactory.curveVestingEscrow({ network, address }),
      resolveLockedBalance: ({ contract, multicall }) => multicall.wrap(contract).lockedOf(address),
      resolveUnlockedBalance: ({ contract, multicall }) => multicall.wrap(contract).balanceOf(address),
    });
  }

  async getBalances(address: string) {
    const [poolTokenBalances, stakedBalances, votingEscrowBalances, vestingEscrowBalances] = await Promise.all([
      this.getPoolTokenBalances(address),
      this.getStakedBalances(address),
      this.getVotingEscrowBalances(address),
      this.getVestingEscrowBalances(address),
    ]);

    return presentBalanceFetcherResponse([
      {
        label: 'Pools',
        assets: poolTokenBalances,
      },
      {
        label: 'Staking',
        assets: stakedBalances,
      },
      {
        label: 'Voting Escrow',
        assets: votingEscrowBalances,
      },
      {
        label: 'Vesting',
        assets: vestingEscrowBalances,
      },
    ]);
  }
}
