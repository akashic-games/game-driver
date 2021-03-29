"use strict";
import * as g from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import * as pl from "@akashic/playlog";
import { EventBuffer } from "./EventBuffer";
import { JoinResolver } from "./JoinResolver";
import StorageOnTick from "./StorageOnTick";

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
	tickTrigger: g.Trigger<pl.Tick> = new g.Trigger();
	gotStorageTrigger: g.Trigger<StorageOnTick> = new g.Trigger();
	errorTrigger: g.Trigger<Error> = new g.Trigger();

	_amflow: amf.AMFlow;
	_eventBuffer: EventBuffer;
	_joinResolver: JoinResolver;

	_nextAge: number = 0;
	_storageDataForNext: pl.StorageData[] | null = null;
	_generatingTick: boolean = false;
	_waitingStorage: boolean = false;

	_onGotStorageData_bound: (err: Error | null, storageData?: pl.StorageData[]) => void;

	constructor(param: TickGeneratorParameterObject) {
		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._amflow = param.amflow;
		this._eventBuffer = param.eventBuffer;
		this._joinResolver = new JoinResolver({
			amflow: param.amflow,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});

		this._onGotStorageData_bound = this._onGotStorageData.bind(this);
	}

	next(): void {
		if (!this._generatingTick || this._waitingStorage)
			return;

		const joinLeaves = this._eventBuffer.readJoinLeaves();
		if (joinLeaves) {
			for (let i = 0; i < joinLeaves.length; ++i)
				this._joinResolver.request(joinLeaves[i]);
		}

		let evs = this._eventBuffer.readEvents();
		const resolvedJoinLeaves = this._joinResolver.readResolved();
		if (resolvedJoinLeaves) {
			if (evs) {
				evs.push.apply(evs, resolvedJoinLeaves);
			} else {
				evs = resolvedJoinLeaves;
			}
		}

		const sds = this._storageDataForNext;
		this._storageDataForNext = null;
		if (sds) {
			this.tickTrigger.fire([
				this._nextAge++,  // 0: フレーム番号
				evs,              // 1?: イベント
				sds               // 2?: ストレージデータ
			]);
		} else {
			this.tickTrigger.fire([
				this._nextAge++,  // 0: フレーム番号
				evs               // 1?: イベント
			]);
		}
	}

	forceNext(): void {
		if (this._waitingStorage) {
			this.errorTrigger.fire(new Error("TickGenerator#forceNext(): cannot generate tick while waiting storage."));
			return;
		}
		const origValue = this._generatingTick;
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
			const err = new Error("TickGenerator#requestStorageTick(): Unsupported: multiple storage request");
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

	_onGotStorageData(err: Error | null, sds?: pl.StorageData[]): void {
		this._waitingStorage = false;
		if (err) {
			this.errorTrigger.fire(err);
			return;
		}
		if (!sds) {
			// NOTE: err が無ければ storageData は必ず存在するはずだが、念の為にバリデートする。
			return;
		}
		this._storageDataForNext = sds;
		this.gotStorageTrigger.fire({ age: this._nextAge, storageData: sds });
	}
}
