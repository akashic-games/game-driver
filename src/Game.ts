"use strict";
import * as g from "@akashic/akashic-engine";
import * as pl from "@akashic/playlog";
import StartPointData from "./StartPointData";
import { StorageFunc } from "./StorageFunc";
import { GameHandlerSet } from "./GameHandlerSet";

export interface GameParameterObject extends g.GameParameterObject {
	player: g.Player;
	handlerSet: GameHandlerSet; // TODO: g.GameParameterObject で定義するように
	gameArgs?: any;
	globalGameArgs?: any;
}

/**
 * Gameクラス。
 *
 * このクラスはakashic-engineに由来するクラスであり、
 * アンダースコアで始まるプロパティ (e.g. _foo) を外部から参照する場合がある点に注意。
 * (akashic-engine においては、_foo は「ゲーム開発者向けでない」ことしか意味しない。)
 */
export class Game extends g.Game {
	/**
	 * 特定ageへの到達を通知するTrigger。
	 * fire時には到達したageが渡される。
	 */
	agePassedTrigger: g.Trigger<number>;

	/**
	 * 要求を受けた後の目標時刻到達を通知するTrigger。
	 * 目標時刻関数を用いたリプレイ中でなければfireされない。
	 * fire時には到達した目標時刻が渡される。
	 */
	targetTimeReachedTrigger: g.Trigger<number>;

	/**
	 * GameLoopのスキップ状態の変化を通知するTrigger。
	 * 通常状態からスキップ状態に遷移する際にtrue、スキップ状態から通常状態に戻る時にfalseが渡される。
	 *
	 * ゲーム開発者に公開される g.Game#skippingChanged との違いに注意。
	 * 組み込み側に公開されるこちらが常にfireされる一方、`skippingChanged` は `isSkipAware` が真の時のみfireされる。
	 */
	skippingChangedTrigger: g.Trigger<boolean>;

	/**
	 * Gameの続行が断念されたことを通知するTrigger。
	 *
	 * 現在のバージョンでは、これをfireする方法は `Game#_abortGame()` の呼び出し、または
	 * それを引き起こすリトライ不能のアセットエラーだけである。
	 * ただしこの `Game#_abortGame()` の仕様は今後変動しうる。
	 */
	abortTrigger: g.Trigger<void>;

	player: g.Player;
	handlerSet: GameHandlerSet;
	_notifyPassedAgeTable: { [age: number]: boolean };
	_notifiesTargetTimeReached: boolean;
	_isSkipAware: boolean;
	_gameArgs: any;
	_globalGameArgs: any;

	constructor(param: GameParameterObject) {
		super(param);
		this.agePassedTrigger = new g.Trigger<number>();
		this.targetTimeReachedTrigger = new g.Trigger<number>();
		this.skippingChangedTrigger = new g.Trigger<boolean>();
		this.abortTrigger = new g.Trigger<void>();
		this.player = param.player;
		this.handlerSet = param.handlerSet;
		this._notifyPassedAgeTable = {};
		this._notifiesTargetTimeReached = false;
		this._isSkipAware = false;
		this._gameArgs = param.gameArgs;
		this._globalGameArgs = param.globalGameArgs;
		this.skippingChangedTrigger.add(this._onSkippingChanged, this);
	}

	/**
	 * 特定age到達時の通知を要求する。
	 * @param age 通知を要求するage
	 */
	requestNotifyAgePassed(age: number): void {
		this._notifyPassedAgeTable[age] = true;
	}

	/**
	 * 特定age到達時の通知要求を解除する。
	 * @param age 通知要求を解除するage
	 */
	cancelNotifyAgePassed(age: number): void {
		delete this._notifyPassedAgeTable[age];
	}

	/**
	 * 次に目標時刻を到達した時点を通知するよう要求する。
	 * 重複呼び出しはサポートしていない。すなわち、呼び出し後 `targetTimeReachedTrigger` がfireされるまでの呼び出しは無視される。
	 */
	requestNotifyTargetTimeReached(): void {
		this._notifiesTargetTimeReached = true;
	}

	/**
	 * 目標時刻を到達した時点を通知要求を解除する。
	 */
	cancelNofityTargetTimeReached(): void {
		this._notifiesTargetTimeReached = false;
	}

	fireAgePassedIfNeeded(): boolean {
		let age = this.age - 1;  // 通過済みのageを確認するため -1 する。
		if (this._notifyPassedAgeTable[age]) {
			delete this._notifyPassedAgeTable[age];
			this.agePassedTrigger.fire(age);
			return true;
		}
		return false;
	}

	setStorageFunc(funcs: StorageFunc): void {
		this.storage._registerLoad(funcs.storageGetFunc);
		this.storage._registerWrite(funcs.storagePutFunc);
		// TODO: akashic-engine 側で書き換えられるようにする
		this.storage.requestValuesForJoinPlayer = funcs.requestValuesForJoinFunc;
	}

	getIsSkipAware(): boolean {
		return this._isSkipAware;
	}

	setIsSkipAware(aware: boolean): void {
		this._isSkipAware = aware;
	}

	// TODO: akashic-engine 側に処理を移す
	getCurrentTime(): number {
		return this.handlerSet.getCurrentTime();
	}

	// TODO: akashic-engine 側に処理を移す
	raiseEvent(event: g.Event): void {
		this.handlerSet.raiseEvent(this._eventConverter.toPlaylogEvent(event));
	}

	// TODO: akashic-engine 側に処理を移す
	raiseTick(events?: g.Event[]): void {
		if (events != null && events.length) {
			const plEvents: pl.Event[] = [];
			for (let i = 0; i < events.length; i++) {
				plEvents.push(this._eventConverter.toPlaylogEvent(events[i]));
			}
			this.handlerSet.raiseTick(plEvents);
			return;
		}
		this.handlerSet.raiseTick();
	}

	// TODO: akashic-engine 側に処理を移す
	addEventFilter(filter: g.EventFilter, handleEmpty?: boolean): void {
		this.handlerSet.addEventFilter(filter, handleEmpty);
	}

	// TODO: akashic-engine 側に処理を移す
	removeEventFilter(filter: g.EventFilter): void {
		this.handlerSet.removeEventFilter(filter);
	}

	// TODO: akashic-engine 側に処理を移す
	shouldSaveSnapshot(): boolean {
		return this.handlerSet.isSnapshotSaver;
	}

	// NOTE: 現状実装が `shouldSaveSnapshot()` と等価なので、簡易対応としてこの実装を用いる。
	// TODO: akashic-engine 側に処理を移す
	isActiveInstance(): boolean {
		return this.shouldSaveSnapshot();
	}

	// TODO: akashic-engine 側に処理を移す
	saveSnapshot(gameSnapshot: any, timestamp: number = this.handlerSet.getCurrentTime()): void {
		this.handlerSet.saveSnapshot(this.age, gameSnapshot, this.random.serialize(), timestamp);
	}

	_destroy(): void {
		this.agePassedTrigger.destroy();
		this.agePassedTrigger = null;
		this.targetTimeReachedTrigger.destroy();
		this.targetTimeReachedTrigger = null;
		this.skippingChangedTrigger.destroy();
		this.skippingChangedTrigger = null;
		this.abortTrigger.destroy();
		this.abortTrigger = null;
		this.player = null;
		this.handlerSet = null;
		this._notifyPassedAgeTable = null;
		this._gameArgs = null;
		this._globalGameArgs = null;
		super._destroy();
	}

	_restartWithSnapshot(snapshot: any): void {
		let data = <StartPointData>snapshot.data;
		this.handlerSet.removeAllEventFilters();
		if (data.seed != null) {
			// 例外ケース: 第0スタートポイントでスナップショットは持っていないので特別対応
			this._reset({ age: snapshot.frame, randSeed: data.seed });
			this._loadAndStart({ args: this._gameArgs, globalArgs: this._globalGameArgs });
		} else {
			this._reset({ age: snapshot.frame, randSeed: 0 }); // TODO: randGenSer を渡せるようにする
			this._loadAndStart({ snapshot: data.gameSnapshot });
		}
	}

	_leaveGame(): void {
		// do nothing.
	}

	_abortGame(): void {
		this.abortTrigger.fire();
	}

	_onRawTargetTimeReached(targetTime: number): void {
		if (this._notifiesTargetTimeReached) {
			this._notifiesTargetTimeReached = false;
			this.targetTimeReachedTrigger.fire(targetTime);
		}
	}

	_onSkippingChanged(skipping: boolean): void {
		if (this._isSkipAware) {
			this.skippingChanged.fire(skipping);
		}
	}
}
