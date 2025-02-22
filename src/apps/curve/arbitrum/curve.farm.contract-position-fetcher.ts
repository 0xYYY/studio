import { Inject } from '@nestjs/common';

import { Register } from '~app-toolkit/decorators';
import { APP_TOOLKIT, IAppToolkit } from '~lib';
import { PositionFetcher } from '~position/position-fetcher.interface';
import { ContractPosition } from '~position/position.interface';
import { Network } from '~types/network.interface';

import { CurveContractFactory, CurveGaugeV2 } from '../contracts';
import { CURVE_DEFINITION } from '../curve.definition';
import { CurveGaugeV2RewardTokenStrategy } from '../helpers/curve.gauge-v2.reward-token-strategy';
import { CurveGaugeV2RoiStrategy } from '../helpers/curve.gauge-v2.roi-strategy';

import { CURVE_V1_POOL_DEFINITIONS, CURVE_V2_POOL_DEFINITIONS } from './curve.pool.definitions';

const appId = CURVE_DEFINITION.id;
const groupId = CURVE_DEFINITION.groups.farm.id;
const network = Network.ARBITRUM_MAINNET;

@Register.ContractPositionFetcher({ appId, groupId, network })
export class ArbitrumCurveFarmContractPositionFetcher implements PositionFetcher<ContractPosition> {
  constructor(
    @Inject(APP_TOOLKIT) private readonly appToolkit: IAppToolkit,
    @Inject(CurveContractFactory)
    private readonly curveContractFactory: CurveContractFactory,
    @Inject(CurveGaugeV2RoiStrategy)
    private readonly curveGaugeV2RoiStrategy: CurveGaugeV2RoiStrategy,
    @Inject(CurveGaugeV2RewardTokenStrategy)
    private readonly curveGaugeV2RewardTokenStrategy: CurveGaugeV2RewardTokenStrategy,
  ) {}

  async getPositions() {
    const definitions = [CURVE_V1_POOL_DEFINITIONS, CURVE_V2_POOL_DEFINITIONS].flat().filter(v => !!v.gaugeAddress);
    return this.appToolkit.helpers.singleStakingFarmContractPositionHelper.getContractPositions<CurveGaugeV2>({
      network,
      appId,
      groupId,
      dependencies: [{ appId: CURVE_DEFINITION.id, groupIds: [CURVE_DEFINITION.groups.pool.id], network }],
      resolveFarmAddresses: () => definitions.map(v => v.gaugeAddress ?? null),
      resolveFarmContract: ({ address, network }) => this.curveContractFactory.curveGaugeV2({ address, network }),
      resolveStakedTokenAddress: ({ contract, multicall }) => multicall.wrap(contract).lp_token(),
      resolveRewardTokenAddresses: this.curveGaugeV2RewardTokenStrategy.build(),
      resolveIsActive: () => true,
      resolveRois: this.curveGaugeV2RoiStrategy.build({
        tokenDefinitions: definitions,
      }),
    });
  }
}
