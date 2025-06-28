
export interface PositionFields {
  fee_growth_inside_x_last: string;
  fee_growth_inside_y_last: string;
  fee_rate: string;
  id: { id: string };
  liquidity: string;
  owed_coin_x: string;
  owed_coin_y: string;
  pool_id: string;
  reward_infos: unknown[];
  tick_lower_index: unknown;
  tick_upper_index: unknown;
  type_x: { type: string; fields: { name: string } };
  type_y: { type: string; fields: { name: string } };
}

export interface PositionObject {
  data: {
    objectId: string;
    type: string;
    content: {
      dataType: string;
      type: string;
      hasPublicTransfer: boolean;
      fields: PositionFields;
    };
  };
}

export interface PoolFields {
  reserve_x: string;
  reserve_y: string;
  liquidity: string;
  type_x: { fields: { name: string } };
  type_y: { fields: { name: string } };
}

export interface PoolObject {
  data: {
    objectId: string;
    content: {
      fields: PoolFields;
    };
  };
}

export interface ProcessedLP {
  protocol: string;
  poolName: string;
  initialWorthUSD: number;
  txDigest: string;
  type: "add" | "remove" | "claim";
  timestamp: string;
  amounts: { [coinType: string]: string };
  currentWorthUSD?: number;
}

export type SuiTransaction = {
  events?: SuiEvent[];
  transaction?: {
    data?: {
      transaction?: {
        kind?: string;
        transactions?: Array<{ MoveCall?: {
          module: string;
          function: string;
          type_arguments?: string[];
        } }>;
      };
    };
  };
  digest: string;
  timestampMs?: string;
};

export type SuiEvent = {
  type: string;
  parsedJson?: {
    amount_x?: string;
    amount_y?: string;
    pool_id?: string;
    position_id?: string;
  };
};