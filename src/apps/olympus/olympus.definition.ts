import { Register } from '~app-toolkit/decorators';
import { AppDefinition } from '~app/app.definition';
import { GroupType, ProtocolAction, ProtocolTag } from '~app/app.interface';
import { Network } from '~types/network.interface';

export const OLYMPUS_DEFINITION = {
  id: 'olympus',
  name: 'Olympus',
  description: `Olympus is a decentralized reserve currency protocol based on the OHM token. Each OHM token is backed by a basket of assets in the Olympus treasury, giving it an intrinsic value that it cannot fall below.`,
  url: 'https://www.olympusdao.finance/',
  tags: [ProtocolTag.ELASTIC_FINANCE],
  groups: {
    sOhmV1: { id: 's-ohm-v1', type: GroupType.TOKEN },
    sOhm: { id: 's-ohm', type: GroupType.TOKEN },
    wsOhmV1: { id: 'ws-ohm-v1', type: GroupType.TOKEN },
    gOhm: { id: 'g-ohm', type: GroupType.TOKEN },
    bond: { id: 'bond', type: GroupType.POSITION },
  },
  supportedNetworks: {
    [Network.ARBITRUM_MAINNET]: [ProtocolAction.VIEW],
    [Network.AVALANCHE_MAINNET]: [ProtocolAction.VIEW],
    [Network.ETHEREUM_MAINNET]: [ProtocolAction.VIEW],
    [Network.FANTOM_OPERA_MAINNET]: [ProtocolAction.VIEW],
    [Network.POLYGON_MAINNET]: [ProtocolAction.VIEW],
  },
};

@Register.AppDefinition(OLYMPUS_DEFINITION.id)
export class OlympusAppDefinition extends AppDefinition {
  constructor() {
    super(OLYMPUS_DEFINITION);
  }
}
