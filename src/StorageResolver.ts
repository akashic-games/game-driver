"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import * as sf from "./StorageFunc";
import ExecutionMode from "./ExecutionMode";
import StorageOnTick from "./StorageOnTick";
import { Game } from "./Game";
import { TickGenerator } from "./TickGenerator";
import { TickBuffer } from "./TickBuffer";

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
	errorTrigger: g.Trigger<Error>;

	getStorageFunc: sf.StorageGetFunc;
	putStorageFunc: sf.StoragePutFunc;
	requestValuesForJoinFunc: sf.RequestValuesForJoinFunc;

	_game: Game;
	_amflow: amf.AMFlow;
	_tickGenerator: TickGenerator;
	_tickBuffer: TickBuffer;
	_executionMode: ExecutionMode;

	_unresolvedLoaders: { [index: number]: g.StorageLoader };
	_unresolvedStorages: { [index: number]: pl.StorageData[] };

	_onStoragePut_bound: (err: Error | null) => void;

	constructor(param: StorageResolverParameterObject) {
		this.errorTrigger = new g.Trigger<Error>();

		if (param.errorHandler)
			this.errorTrigger.handle(param.errorHandlerOwner, param.errorHandler);

		this.getStorageFunc = this._getStorage.bind(this);
		this.putStorageFunc = this._putStorage.bind(this);
		this.requestValuesForJoinFunc = this._requestValuesForJoin.bind(this);

		this._game = param.game;
		this._amflow = param.amflow;
		this._tickGenerator = param.tickGenerator;
		this._tickBuffer = param.tickBuffer;
		this._executionMode = null; // 後続のsetExecutionMode()で設定する。
		this.setExecutionMode(param.executionMode);

		this._unresolvedLoaders = {};
		this._unresolvedStorages = {};

		this._onStoragePut_bound = this._onStoragePut.bind(this);
	}

	/**
	 * ExecutionModeを変更する。
	 */
	setExecutionMode(executionMode: ExecutionMode): void {
		if (this._executionMode === executionMode)
			return;
		this._executionMode = executionMode;
		var tickBuf = this._tickBuffer;
		var tickGen = this._tickGenerator;
		if (executionMode === ExecutionMode.Active) {
			tickBuf.gotStorageTrigger.remove(this, this._onGotStorageOnTick);
			tickGen.gotStorageTrigger.handle(this, this._onGotStorageOnTick);
		} else {
			tickGen.gotStorageTrigger.remove(this, this._onGotStorageOnTick);
			tickBuf.gotStorageTrigger.handle(this, this._onGotStorageOnTick);
		}
	}

	_onGotStorageOnTick(storageOnTick: StorageOnTick): void {
		var resolvingAge = storageOnTick.age;
		var storageData = storageOnTick.storageData;

		var loader = this._unresolvedLoaders[resolvingAge];
		if (!loader) {
			this._unresolvedStorages[resolvingAge] = storageData;
			return;
		}
		delete this._unresolvedLoaders[resolvingAge];
		var serialization = resolvingAge;
		var values = storageData.map((d: pl.StorageData) => { return d.values; });
		loader._onLoaded(values, serialization);
	}

	_getStorage(keys: g.StorageKey[], loader: g.StorageLoader, ser?: g.StorageValueStoreSerialization): void {
		var resolvingAge: number;
		if (ser != null) {
			// akashic-engineにとって `ser' の型は単にanyである。実態は実装(game-driver)に委ねられている。
			// game-driverはシリアリゼーションとして「ストレージが含められていたTickのage」を採用する。
			resolvingAge = <number>ser;
			this._tickBuffer.requestTicks(resolvingAge, 1); // request しておけば後は _onGotStorageOnTick() に渡ってくる
		} else {
			if (this._executionMode === ExecutionMode.Active) {
				resolvingAge = this._tickGenerator.requestStorageTick(keys);
			} else {
				resolvingAge = this._game.age; // TODO: gameを参照せずともageがとれるようにすべき。
				this._tickBuffer.requestTicks(resolvingAge, 1); // request しておけば後は _onGotStorageOnTick() に渡ってくる
			}
		}

		var sd = this._unresolvedStorages[resolvingAge];
		if (!sd) {
			this._unresolvedLoaders[resolvingAge] = loader;
			return;
		}
		delete this._unresolvedStorages[resolvingAge];
		var serialization = resolvingAge;
		var values = sd.map((d: pl.StorageData) => { return d.values; });
		loader._onLoaded(values, serialization);
	}

	_putStorage(key: g.StorageKey, value: g.StorageValue, option: g.StorageWriteOption): void {
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
