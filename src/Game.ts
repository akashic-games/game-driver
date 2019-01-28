"use strict";
import * as g from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import StartPointData from "./StartPointData";
import { StorageFunc } from "./StorageFunc";

export interface GameParameterObject {
	configuration: g.GameConfiguration;
	resourceFactory: g.ResourceFactory;
	assetBase: string;
	player: g.Player;
	isSnapshotSaver?: boolean;
	operationPluginViewInfo?: g.OperationPluginViewInfo;
	gameArgs?: any;
	globalGameArgs?: any;
}

export interface GameEventFilterFuncs {
	addFilter: (filter: g.EventFilter, handleEmpty?: boolean) => void;
	removeFilter: (filter?: g.EventFilter) => void;
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
	 * GameLoopのスキップ状態の変化を通知するTrigger。
	 * 通常状態からスキップ状態に遷移する際にtrue、スキップ状態から通常状態に戻る時にfalseが渡される。
	 */
	skippingChangedTrigger: g.Trigger<boolean>;

	/**
	 * Gameの続行が断念されたことを通知するTrigger。
	 *
	 * 現在のバージョンでは、これをfireする方法は `Game#terminateGame()` の呼び出し、または
	 * それを引き起こすリトライ不能のアセットエラーだけである。
	 * ただしこの `terminateGame()` の仕様は今後変動しうる。
	 */
	abortTrigger: g.Trigger<void>;

	player: g.Player;
	raiseEventTrigger: g.Trigger<g.Event>;
	raiseTickTrigger: g.Trigger<g.Event[]>;
	snapshotTrigger: g.Trigger<amf.StartPoint>;
	isSnapshotSaver: boolean;
	_getCurrentTimeFunc: () => number;
	_eventFilterFuncs: GameEventFilterFuncs;
	_notifyPassedAgeTable: { [age: number]: boolean };
	_gameArgs: any;
	_globalGameArgs: any;

	constructor(param: GameParameterObject) {
		super(param.configuration, param.resourceFactory, param.assetBase, param.player.id, param.operationPluginViewInfo);
		this.agePassedTrigger = new g.Trigger<number>();
		this.skippingChangedTrigger = new g.Trigger<boolean>();
		this.abortTrigger = new g.Trigger<void>();
		this.player = param.player;
		this.raiseEventTrigger = new g.Trigger<g.Event>();
		this.raiseTickTrigger = new g.Trigger<g.Event[]>();
		this.snapshotTrigger = new g.Trigger<amf.StartPoint>();
		this.isSnapshotSaver = !!param.isSnapshotSaver;
		this._getCurrentTimeFunc = null;
		this._eventFilterFuncs = null;
		this._notifyPassedAgeTable = {};
		this._gameArgs = param.gameArgs;
		this._globalGameArgs = param.globalGameArgs;
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

	fireAgePassedIfNeeded(): boolean {
		let age = this.age - 1;  // 通過済みのageを確認するため -1 する。
		if (this._notifyPassedAgeTable[age]) {
			delete this._notifyPassedAgeTable[age];
			this.agePassedTrigger.fire(age);
			return true;
		}
		return false;
	}

	/**
	 * `Game` が内部的に利用する時刻取得関数をセットする。
	 * このメソッドは `Game#_load()` 呼び出しに先行して呼び出されていなければならない。
	 */
	setCurrentTimeFunc(fun: () => number): void {
		this._getCurrentTimeFunc = fun;
	}

	/**
	 * `Game` のイベントフィルタ関連実装をセットする。
	 * このメソッドは `Game#_load()` 呼び出しに先行して呼び出されていなければならない。
	 */
	setEventFilterFuncs(funcs: GameEventFilterFuncs): void {
		this._eventFilterFuncs = funcs;
	}

	setStorageFunc(funcs: StorageFunc): void {
		this.storage._registerLoad(funcs.storageGetFunc);
		this.storage._registerWrite(funcs.storagePutFunc);
		// TODO: akashic-engine 側で書き換えられるようにする
		this.storage.requestValuesForJoinPlayer = funcs.requestValuesForJoinFunc;
	}

	raiseEvent(event: g.Event): void {
		this.raiseEventTrigger.fire(event);
	}

	// TODO: (WIP) playlog.Event[] をとるべきか検討し対応する。
	raiseTick(events?: g.Event[]): void {
		if (!this.scene() || this.scene().tickGenerationMode !== g.TickGenerationMode.Manual)
			throw g.ExceptionFactory.createAssertionError("Game#raiseTick(): tickGenerationMode for the current scene is not Manual.");
		this.raiseTickTrigger.fire(events);
	}

	addEventFilter(filter: g.EventFilter, handleEmpty?: boolean): void {
		this._eventFilterFuncs.addFilter(filter, handleEmpty);
	}

	removeEventFilter(filter: g.EventFilter): void {
		this._eventFilterFuncs.removeFilter(filter);
	}

	shouldSaveSnapshot(): boolean {
		return this.isSnapshotSaver;
	}

	saveSnapshot(gameSnapshot: any, timestamp: number = this._getCurrentTimeFunc()): void {
		if (!this.shouldSaveSnapshot())
			return;
		this.snapshotTrigger.fire({
			frame: this.age,
			timestamp,
			data: {
				randGenSer: this.random[0].serialize(),
				gameSnapshot: gameSnapshot
			}
		});
	}

	_destroy(): void {
		this.agePassedTrigger.destroy();
		this.agePassedTrigger = null;
		this.skippingChangedTrigger.destroy();
		this.skippingChangedTrigger = null;
		this.abortTrigger.destroy();
		this.abortTrigger = null;
		this.player = null;
		this.raiseEventTrigger.destroy();
		this.raiseEventTrigger = null;
		this.raiseTickTrigger.destroy();
		this.raiseTickTrigger = null;
		this.snapshotTrigger.destroy();
		this.snapshotTrigger = null;
		this.isSnapshotSaver = false;
		this._getCurrentTimeFunc = null;
		this._eventFilterFuncs = null;
		this._notifyPassedAgeTable = null;
		this._gameArgs = null;
		this._globalGameArgs = null;
		super._destroy();
	}

	_restartWithSnapshot(snapshot: any): void {
		let data = <StartPointData>snapshot.data;
		this._eventFilterFuncs.removeFilter();
		if (data.seed != null) {
			// 例外ケース: 第0スタートポイントでスナップショットは持っていないので特別対応
			let randGen = new g.XorshiftRandomGenerator(data.seed);
			this._reset({ age: snapshot.frame, randGen: randGen });
			this._loadAndStart({ args: this._gameArgs, globalArgs: this._globalGameArgs });
		} else {
			let randGen = new g.XorshiftRandomGenerator(0, data.randGenSer);
			this._reset({ age: snapshot.frame, randGen: randGen });
			this._loadAndStart({ snapshot: data.gameSnapshot });
		}
	}

	_leaveGame(): void {
		// do nothing.
	}

	_terminateGame(): void {
		this.abortTrigger.fire();
	}
}
