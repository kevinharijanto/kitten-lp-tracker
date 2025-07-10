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
  amounts: { [key: string]: string | number };
  currentWorthUSD?: number;
}

// Define proper interfaces for transaction effects
export interface TransactionEffects {
  status: {
    status: "success" | "failure";
    error?: string;
  };
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
    nonRefundableStorageFee: string;
  };
  transactionDigest: string;
  created?: Array<{
    owner: string | { AddressOwner: string } | { ObjectOwner: string } | { Shared: { initial_shared_version: number } };
    reference: {
      objectId: string;
      version: string;
      digest: string;
    };
  }>;
  mutated?: Array<{
    owner: string | { AddressOwner: string } | { ObjectOwner: string } | { Shared: { initial_shared_version: number } };
    reference: {
      objectId: string;
      version: string;
      digest: string;
    };
  }>;
  deleted?: Array<{
    objectId: string;
    version: string;
    digest: string;
  }>;
  gasObject: {
    owner: string | { AddressOwner: string };
    reference: {
      objectId: string;
      version: string;
      digest: string;
    };
  };
  dependencies: string[];
}

// Define interfaces for transaction data
export interface MoveCall {
  module: string;
  function: string;
  type_arguments?: string[];
  arguments?: unknown[];
  package?: string;
}

export interface ProgrammableTransaction {
  kind: "ProgrammableTransaction";
  transactions: Array<{
    MoveCall?: MoveCall;
    TransferObjects?: unknown;
    SplitCoins?: unknown;
    MergeCoins?: unknown;
    Publish?: unknown;
    MakeMoveVec?: unknown;
    Upgrade?: unknown;
  }>;
  inputs?: unknown[];
}

export interface TransactionData {
  transaction: ProgrammableTransaction | {
    kind: string;
    [key: string]: unknown;
  };
  sender: string;
  gasData: {
    payment: Array<{
      objectId: string;
      version: string;
      digest: string;
    }>;
    owner: string;
    price: string;
    budget: string;
  };
}

export type SuiTransaction = {
  effects: TransactionEffects;
  events?: SuiEvent[];
  transaction?: {
    data?: TransactionData;
  };
  digest: string;
  timestampMs?: string;
  checkpoint?: string;
  confirmedLocalExecution?: boolean;
};

export type SuiEvent = {
  type: string;
  parsedJson?: {
    amount_x?: string;
    amount_y?: string;
    pool_id?: string;
    position_id?: string;
    sender?: string;
    [key: string]: unknown; // Allow additional fields while maintaining type safety
  };
  packageId?: string;
  transactionModule?: string;
  sender?: string;
  id?: {
    txDigest: string;
    eventSeq: string;
  };
  timestampMs?: string;
};