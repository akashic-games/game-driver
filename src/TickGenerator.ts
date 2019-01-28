"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import StorageOnTick from "./StorageOnTick";
import { EventBuffer } from "./EventBuffer";
import { JoinResolver } from "./JoinResolver";

export interface TickGeneratorParameterObject {
	amflow: amf.AMFlow;
	eventBuffer: EventBuffer;
	errorHandler?: (err: Error) => void;
	errorHandlerOwner?: any;
}

/**
 * `playlog.Tick` の生成器。
 * `next()` が呼ばれる度に、EventBuffer に蓄積されたイベントを集めてtickを生成、`tickTrigger` で通知する。
 */
export class TickGenerator {
	tickTrigger: g.Trigger<pl.Tick>;
	gotStorageTrigger: g.Trigger<StorageOnTick>;
	errorTrigger: g.Trigger<Error>;

	_amflow: amf.AMFlow;
	_eventBuffer: EventBuffer;
	_joinResolver: JoinResolver;

	_nextAge: number;
	_storageDataForNext: pl.StorageData[];
	_generatingTick: boolean;
	_waitingStorage: boolean;

	_onGotStorageData_bound: (err: Error, sds: pl.StorageData[]) => void;

	constructor(param: TickGeneratorParameterObject) {
		this.tickTrigger = new g.Trigger<pl.Tick>();
		this.gotStorageTrigger = new g.Trigger<StorageOnTick>();
		this.errorTrigger = new g.Trigger<Error>();

		if (param.errorHandler)
			this.errorTrigger.handle(param.errorHandlerOwner, param.errorHandler);

		this._amflow = param.amflow;
		this._eventBuffer = param.eventBuffer;
		this._joinResolver = new JoinResolver({
			amflow: param.amflow,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});

		this._nextAge = 0;
		this._storageDataForNext = null;
		this._generatingTick = false;
		this._waitingStorage = false;
		this._onGotStorageData_bound = this._onGotStorageData.bind(this);
	}

	next(): void {
		if (!this._generatingTick || this._waitingStorage)
			return;

		var joinLeaves = this._eventBuffer.readJoinLeaves();
		if (joinLeaves) {
			for (var i = 0; i < joinLeaves.length; ++i)
				this._joinResolver.request(joinLeaves[i]);
		}

		var evs = this._eventBuffer.readEvents();
		var resolvedJoinLeaves = this._joinResolver.readResolved();
		if (resolvedJoinLeaves) {
			if (evs) {
				evs.push.apply(evs, resolvedJoinLeaves);
			} else {
				evs = resolvedJoinLeaves;
			}
		}

		var sds = this._storageDataForNext;
		this._storageDataForNext = null;
		this.tickTrigger.fire([
			this._nextAge++,  // 0: フレーム番号
			evs,              // 1?: イベント
			sds               // 2?: ストレージデータ
		]);
	}

	forceNext(): void {
		if (this._waitingStorage) {
			this.errorTrigger.fire(new Error("TickGenerator#forceNext(): cannot generate tick while waiting storage."));
			return;
		}
		var origValue = this._generatingTick;
		this._generatingTick = true;
		this.next();
		this._generatingTick = origValue;
	}

	startStopGenerate(toGenerate: boolean): void {
		this._generatingTick = toGenerate;
	}

	startTick(): void {
		this._generatingTick = true;
	}

	stopTick(): void {
		this._generatingTick = false;
	}

	setNextAge(age: number): void {
		if (this._waitingStorage) {
			// エッジケース: 次のtickにストレージを乗せるはずだったが、ageが変わってしまうのでできない。
			// Activeでストレージ要求(シーン切り替え)して待っている間にここに来るとこのパスにかかる。
			// 現実にはActiveで実行開始した後にageを変えるケースは想像しにくい(tickが飛び飛びになったり重複したりする)。
			this.errorTrigger.fire(new Error("TickGenerator#setNextAge(): cannot change the next age while waiting storage."));
			return;
		}
		this._nextAge = age;
	}

	/**
	 * 次に生成するtickにstorageDataを持たせる。
	 * 取得が完了するまで、次のtickは生成されない。
	 */
	requestStorageTick(keys: pl.StorageReadKey[]): number {
		if (this._waitingStorage) {
			var err = g.ExceptionFactory.createAssertionError("TickGenerator#requestStorageTick(): Unsupported: multiple storage request");
			this.errorTrigger.fire(err);
			return -1;
		}
		this._waitingStorage = true;
		this._amflow.getStorageData(keys, this._onGotStorageData_bound);
		return this._nextAge;
	}

	setRequestValuesForJoin(keys: g.StorageKey[]): void {
		this._joinResolver.setRequestValuesForJoin(keys);
	}

	_onGotStorageData(err: Error, sds: pl.StorageData[]): void {
		this._waitingStorage = false;
		if (err) {
			this.errorTrigger.fire(err);
			return;
		}
		this._storageDataForNext = sds;
		this.gotStorageTrigger.fire({ age: this._nextAge, storageData: sds });
	}
}
