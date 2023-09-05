"use strict";
import * as g from "@akashic/akashic-engine";
import type { GameHandlerSet } from "./GameHandlerSet";
import type StartPointData from "./StartPointData";

export interface GameParameterObject extends g.GameParameterObject {
	player: g.Player;
	handlerSet: GameHandlerSet;
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
	agePassedTrigger: g.Trigger<number> = new g.Trigger();

	/**
	 * 要求を受けた後の目標時刻到達を通知するTrigger。
	 * 目標時刻関数を用いたリプレイ中でなければfireされない。
	 * fire時には到達した目標時刻が渡される。
	 */
	targetTimeReachedTrigger: g.Trigger<number> = new g.Trigger();

	/**
	 * GameLoopのスキップ状態の変化を通知するTrigger。
	 * 通常状態からスキップ状態に遷移する際にtrue、スキップ状態から通常状態に戻る時にfalseが渡される。
	 *
	 * ゲーム開発者に公開される g.Game#skippingChanged との違いに注意。
	 * 組み込み側に公開されるこちらが常にfireされる一方、`skippingChanged` は `isSkipAware` が真の時のみfireされる。
	 */
	skippingChangedTrigger: g.Trigger<boolean> = new g.Trigger();

	/**
	 * Gameの続行が断念されたことを通知するTrigger。
	 *
	 * 現在のバージョンでは、これをfireする方法は `Game#_abortGame()` の呼び出し、または
	 * それを引き起こすリトライ不能のアセットエラーだけである。
	 * ただしこの `Game#_abortGame()` の仕様は今後変動しうる。
	 */
	abortTrigger: g.Trigger<void> = new g.Trigger();

	player: g.Player;

	/**
	 * ハンドラセット。
	 *
	 * 祖先クラスの `g.Game#handlerSet: g.GameHandlerSet` と同じ値を保持する。
	 * 利用箇所で逐一ダウンキャストが必要になるのを避けるため、
	 * (g なしの) `GameHandlerSet` である (そのことに意味がある) 点に注意。
	 */
	rawHandlerSet: GameHandlerSet;

	_notifyPassedAgeTable: { [age: number]: boolean } = Object.create(null);
	_notifiesTargetTimeReached: boolean = false;
	_isSkipAware: boolean = false;
	_gameArgs: any;
	_globalGameArgs: any;

	constructor(param: GameParameterObject) {
		super(param);
		this.player = param.player;
		this.rawHandlerSet = param.handlerSet;
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
		const age = this.age - 1;  // 通過済みのageを確認するため -1 する。
		if (this._notifyPassedAgeTable[age]) {
			delete this._notifyPassedAgeTable[age];
			this.agePassedTrigger.fire(age);
			return true;
		}
		return false;
	}

	getIsSkipAware(): boolean {
		return this._isSkipAware;
	}

	setIsSkipAware(aware: boolean): void {
		this._isSkipAware = aware;
	}

	override _destroy(): void {
		this.agePassedTrigger.destroy();
		this.agePassedTrigger = null!;
		this.targetTimeReachedTrigger.destroy();
		this.targetTimeReachedTrigger = null!;
		this.skippingChangedTrigger.destroy();
		this.skippingChangedTrigger = null!;
		this.abortTrigger.destroy();
		this.abortTrigger = null!;
		this.player = null!;
		this.rawHandlerSet = null!;
		this._notifyPassedAgeTable = null!;
		this._gameArgs = null;
		this._globalGameArgs = null;
		super._destroy();
	}

	_restartWithSnapshot(snapshot: any): void {
		const data: StartPointData = snapshot.data;
		if (data.seed != null) {
			// 例外ケース: 第0スタートポイントでスナップショットは持っていないので特別対応
			this._reset({ age: snapshot.frame, randSeed: data.seed });
			this._loadAndStart({ args: this._gameArgs, globalArgs: this._globalGameArgs });
		} else {
			this._reset({ age: snapshot.frame, nextEntityId: data.nextEntityId, randGenSer: data.randGenSer });
			this._loadAndStart({ args: this._gameArgs, snapshot: data.gameSnapshot });
		}
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
			this.onSkipChange.fire(skipping);
		}
	}
}
