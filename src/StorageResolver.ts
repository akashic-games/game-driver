"use strict";
import * as g from "@akashic/akashic-engine";
import type * as amf from "@akashic/amflow";
import type * as pl from "@akashic/playlog";
import ExecutionMode from "./ExecutionMode";
import type { Game } from "./Game";
import type * as sf from "./StorageFunc";
import type StorageOnTick from "./StorageOnTick";
import type { TickBuffer } from "./TickBuffer";
import type { TickGenerator } from "./TickGenerator";

export interface StorageResolverParameterObject {
	game: Game;
	amflow: amf.AMFlow;
	tickGenerator: TickGenerator;
	tickBuffer: TickBuffer;
	executionMode: ExecutionMode;
	errorHandler?: (err: Error) => void;
	errorHandlerOwner?: any;
}

export interface StorageRequest {
	resolvingAge: number;
	loader: g.StorageLoader;
}

/**
 * ストレージの読み書きを担うクラス。
 * Gameのストレージアクセスはすべてこのクラスが一次受けする(一次受けする関数を提供する)。
 *
 * ただし読み込みに関しては、実際にはこのクラスでは行わない。
 * Activeモードの場合、ストレージから読み込んだデータはTickに乗せる必要がある。
 * このクラスはTickGeneratorにリクエストを通知し、読み込みはTickGeneratorが解決する。
 * Passiveモードやスナップショットからの復元の場合、ストレージのデータは `TickBuffer` で受信したTickから得られる。
 * このクラスは、読み込みリクエストを得られたストレージデータと付き合わせて完了を通知する役割を持つ。
 */
export class StorageResolver {
	errorTrigger: g.Trigger<Error> = new g.Trigger<Error>();

	getStorageFunc: sf.StorageGetFunc;
	putStorageFunc: sf.StoragePutFunc;
	requestValuesForJoinFunc: sf.RequestValuesForJoinFunc;

	_game: Game;
	_amflow: amf.AMFlow;
	_tickGenerator: TickGenerator;
	_tickBuffer: TickBuffer;
	_executionMode: ExecutionMode | null;

	_unresolvedLoaders: { [index: number]: g.StorageLoader } = Object.create(null);
	_unresolvedStorages: { [index: number]: pl.StorageData[] } = Object.create(null);

	_onStoragePut_bound: (err: Error | null) => void;

	constructor(param: StorageResolverParameterObject) {
		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this.getStorageFunc = this._getStorage.bind(this);
		this.putStorageFunc = this._putStorage.bind(this);
		this.requestValuesForJoinFunc = this._requestValuesForJoin.bind(this);
		this._onStoragePut_bound = this._onStoragePut.bind(this);

		this._game = param.game;
		this._amflow = param.amflow;
		this._tickGenerator = param.tickGenerator;
		this._tickBuffer = param.tickBuffer;
		this._executionMode = null; // 後続のsetExecutionMode()で設定する。
		this.setExecutionMode(param.executionMode);
	}

	/**
	 * ExecutionModeを変更する。
	 */
	setExecutionMode(executionMode: ExecutionMode): void {
		if (this._executionMode === executionMode)
			return;
		this._executionMode = executionMode;
		const tickBuf = this._tickBuffer;
		const tickGen = this._tickGenerator;
		if (executionMode === ExecutionMode.Active) {
			tickBuf.gotStorageTrigger.remove(this._onGotStorageOnTick, this);
			tickGen.gotStorageTrigger.add(this._onGotStorageOnTick, this);
		} else {
			tickGen.gotStorageTrigger.remove(this._onGotStorageOnTick, this);
			tickBuf.gotStorageTrigger.add(this._onGotStorageOnTick, this);
		}
	}

	_onGotStorageOnTick(storageOnTick: StorageOnTick): void {
		const resolvingAge = storageOnTick.age;
		const storageData = storageOnTick.storageData;

		const loader = this._unresolvedLoaders[resolvingAge];
		if (!loader) {
			this._unresolvedStorages[resolvingAge] = storageData;
			return;
		}
		delete this._unresolvedLoaders[resolvingAge];
		const serialization = resolvingAge;
		const values = storageData.map(d => d.values);
		loader._onLoaded(values, serialization);
	}

	_getStorage(keys: g.StorageKey[], loader: g.StorageLoader, ser?: g.StorageValueStoreSerialization): void {
		let resolvingAge: number;
		if (ser != null) {
			// akashic-engineにとって `ser' の型は単にanyである。実態は実装(game-driver)に委ねられている。
			// game-driverはシリアリゼーションとして「ストレージが含められていたTickのage」を採用する。
			resolvingAge = ser;
			this._tickBuffer.requestTicks(resolvingAge, 1); // request しておけば後は _onGotStorageOnTick() に渡ってくる
		} else {
			if (this._executionMode === ExecutionMode.Active) {
				resolvingAge = this._tickGenerator.requestStorageTick(keys);
			} else {
				resolvingAge = this._game.age; // TODO: gameを参照せずともageがとれるようにすべき。
				this._tickBuffer.requestTicks(resolvingAge, 1); // request しておけば後は _onGotStorageOnTick() に渡ってくる
			}
		}

		const sd = this._unresolvedStorages[resolvingAge];
		if (!sd) {
			this._unresolvedLoaders[resolvingAge] = loader;
			return;
		}
		delete this._unresolvedStorages[resolvingAge];
		const serialization = resolvingAge;
		const values = sd.map(d => d.values);
		loader._onLoaded(values, serialization);
	}

	_putStorage(key: g.StorageKey, value: g.StorageValue, option?: g.StorageWriteOption): void {
		if (this._executionMode === ExecutionMode.Active) {
			this._amflow.putStorageData(key, value, option, this._onStoragePut_bound);
		}
	}

	_requestValuesForJoin(keys: g.StorageKey[]): void {
		this._tickGenerator.setRequestValuesForJoin(keys);
	}

	_onStoragePut(err: Error | null): void {
		if (err)
			this.errorTrigger.fire(err);
	}
}
