"use strict";
import * as g from "@akashic/akashic-engine";

// TODO: この定義を akashic-engine に移管
export type StorageGetFunc = (keys: g.StorageKey[], loader: g.StorageLoader, serialization?: g.StorageValueStoreSerialization) => void;
export type StoragePutFunc = (key: g.StorageKey, value: g.StorageValue, option: g.StorageWriteOption) => void;
export type RequestValuesForJoinFunc = (keys: g.StorageKey[]) => void;

export interface StorageFunc {
	storageGetFunc: StorageGetFunc;
	storagePutFunc: StoragePutFunc;
	requestValuesForJoinFunc: RequestValuesForJoinFunc;
}
