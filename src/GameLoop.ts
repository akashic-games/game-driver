"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import * as pdi from "@akashic/akashic-pdi";
import LoopMode from "./LoopMode";
import LoopRenderMode from "./LoopRenderMode";
import LoopConfiguration from "./LoopConfiguration";
import ExecutionMode from "./ExecutionMode";
import * as EventIndex from "./EventIndex";
import { Game } from "./Game";
import { EventBuffer } from "./EventBuffer";
import { Clock, ClockFrameTriggerParameterObject } from "./Clock";
import { ProfilerClock } from "./ProfilerClock";
import { EventConverter } from "./EventConverter";
import { TickBuffer } from "./TickBuffer";
import { TickController } from "./TickController";
import { Profiler } from "./Profiler";

export interface GameLoopParameterObejct {
	amflow: amf.AMFlow;
	platform: pdi.Platform;
	game: Game;
	eventBuffer: EventBuffer;
	executionMode: ExecutionMode;
	configuration: LoopConfiguration;
	startedAt: number;

	profiler?: Profiler;
	errorHandler?: (err: Error) => void;
	errorHandlerOwner?: any;
}

/**
 * ゲームのメインループ管理クラス。
 * clock frameの度にTickBufferに蓄積されたTickを元にゲームを動かす。
 *
 * start() から stop() までの間、最後に呼び出された _amflow.authenticate() は Permission#readTick を返していなければならない。
 */
export class GameLoop {
	static DEFAULT_DELAY_IGNORE_THRESHOLD: number = 6;     // このフレーム以下の遅延は遅れてないものとみなす(常時コマが飛ぶのを避けるため)
	static DEFAULT_SKIP_TICKS_AT_ONCE: number = 100;       // 100倍早送り
	static DEFAULT_SKIP_THRESHOLD: number = 30000;         // 30FPSの100倍早送りで換算3000FPSで進めて10秒かかる閾値
	static DEFAULT_JUMP_TRY_THRESHOLD: number = 90000;     // 30FPSの100倍早送りで換算3000FPSで進めても30秒かかる閾値
	static DEFAULT_JUMP_IGNORE_THRESHOLD: number = 15000;  // 30FPSの100倍早送りで換算3000FPSで進めて5秒で済む閾値
	static DEFAULT_POLLING_TICK_THRESHOLD: number = 10000; // 最新ティックを取得する間隔
	static DEFAULT_DELAY_IGNORE_THERSHOLD: number = GameLoop.DEFAULT_DELAY_IGNORE_THRESHOLD; // 過去のtypoの後方互換性維持

	errorTrigger: g.Trigger<any>;

	running: boolean;

	/**
	 * プレイ開始からの時刻。
	 * 実時間ではなく、経過フレーム数から計算される仮想的な時間であることに注意。
	 * この時間情報を元にタイムスタンプイベントの消化待ちを行う。
	 */
	_currentTime: number;

	/**
	 * 1フレーム分の時間。FPSの逆数。
	 * _currentTime の計算に用いる。
	 */
	_frameTime: number;

	/**
	 * Replay時の目標時刻関数。
	 *
	 * 存在する場合、この値を毎フレーム呼び出し、その戻り値を目標時刻として扱う。
	 * すなわち、「この関数の戻り値を超えない最大のティック時刻を持つティック」が消化されるよう早送りやスナップショットジャンプを行う。
	 */
	_targetTimeFunc: () => number;

	_startedAt: number;
	_targetTimeOffset: number;
	_originDate: number;
	_realTargetTimeOffset: number;

	_delayIgnoreThreshold: number;
	_skipTicksAtOnce: number;
	_skipThreshold: number;
	_jumpTryThreshold: number;
	_jumpIgnoreThreshold: number;
	_pollingTickThreshold: number;
	_playbackRate: number;
	_loopRenderMode: LoopRenderMode;

	_loopMode: LoopMode;
	_amflow: amf.AMFlow;
	_game: Game;
	_eventBuffer: EventBuffer;
	_executionMode: ExecutionMode;

	_sceneTickMode: g.TickGenerationMode;
	_sceneLocalMode: g.LocalTickMode;

	_targetAge: number;
	_waitingStartPoint: boolean;
	_lastRequestedStartPointAge: number;
	_lastRequestedStartPointTime: number;
	_waitingNextTick: boolean;
	_skipping: boolean;
	_lastPollingTickTime: number;

	_clock: Clock;
	_tickController: TickController;
	_eventConverter: EventConverter;
	_tickBuffer: TickBuffer;

	_onGotStartPoint_bound: (err: Error | null, startPoint?: amf.StartPoint) => void;

	constructor(param: GameLoopParameterObejct) {
		this.errorTrigger = new g.Trigger<any>();
		this.running = false;
		this._currentTime = 0;
		this._frameTime = 1000 / param.game.fps;

		if (param.errorHandler) {
			this.errorTrigger.handle(param.errorHandlerOwner, param.errorHandler);
		}

		const conf = param.configuration;
		this._startedAt = param.startedAt;
		this._targetTimeFunc = conf.targetTimeFunc || null;
		this._targetTimeOffset = conf.targetTimeOffset || null;
		this._originDate = conf.originDate || null;
		this._realTargetTimeOffset = (this._originDate != null) ? this._originDate - this._startedAt : (this._targetTimeOffset || 0);
		this._delayIgnoreThreshold = conf.delayIgnoreThreshold || GameLoop.DEFAULT_DELAY_IGNORE_THRESHOLD;
		this._skipTicksAtOnce = conf.skipTicksAtOnce || GameLoop.DEFAULT_SKIP_TICKS_AT_ONCE;
		this._skipThreshold = conf.skipThreshold || GameLoop.DEFAULT_SKIP_THRESHOLD;
		this._jumpTryThreshold = conf.jumpTryThreshold || GameLoop.DEFAULT_JUMP_TRY_THRESHOLD;
		this._jumpIgnoreThreshold = conf.jumpIgnoreThreshold || GameLoop.DEFAULT_JUMP_IGNORE_THRESHOLD;
		this._pollingTickThreshold = conf._pollingTickThreshold || GameLoop.DEFAULT_POLLING_TICK_THRESHOLD;
		this._playbackRate = conf.playbackRate || 1;
		const loopRenderMode = (conf.loopRenderMode != null) ? conf.loopRenderMode : LoopRenderMode.AfterRawFrame;
		this._loopRenderMode = null;  // 後の_setLoopRenderMode()で初期化

		this._loopMode = conf.loopMode;
		this._amflow = param.amflow;
		this._game = param.game;
		this._eventBuffer = param.eventBuffer;
		this._executionMode = param.executionMode;

		this._sceneTickMode = null;
		this._sceneLocalMode = null;

		this._targetAge = (conf.targetAge != null) ? conf.targetAge : null;
		this._waitingStartPoint = false;
		this._lastRequestedStartPointAge = -1;
		this._lastRequestedStartPointTime = -1;
		this._waitingNextTick = false;
		this._skipping = false;
		this._lastPollingTickTime = 0;

		// todo: 本来は、パフォーマンス測定機構を含まないリリースモードによるビルド方式も提供すべき。
		if (!param.profiler) {
			this._clock = new Clock({
				fps: param.game.fps,
				scaleFactor: this._playbackRate,
				platform: param.platform,
				maxFramePerOnce: 5
			});
		} else {
			this._clock = new ProfilerClock({
				fps: param.game.fps,
				scaleFactor: this._playbackRate,
				platform: param.platform,
				maxFramePerOnce: 5,
				profiler: param.profiler
			});
		}

		this._tickController = new TickController({
			amflow: param.amflow,
			clock: this._clock,
			game: param.game,
			eventBuffer: param.eventBuffer,
			executionMode: param.executionMode,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});
		this._eventConverter = new EventConverter({ game: param.game });
		this._tickBuffer = this._tickController.getBuffer();

		this._onGotStartPoint_bound = this._onGotStartPoint.bind(this);

		this._setLoopRenderMode(loopRenderMode);
		this._game.setStorageFunc(this._tickController.storageFunc());
		this._game.raiseEventTrigger.handle(this, this._onGameRaiseEvent);
		this._game.raiseTickTrigger.handle(this, this._onGameRaiseTick);
		this._game._started.handle(this, this._onGameStarted);
		this._game._operationPluginOperated.handle(this, this._onGameOperationPluginOperated);
		this._tickBuffer.gotNextTickTrigger.handle(this, this._onGotNextFrameTick);
		this._tickBuffer.start();
		this._updateGamePlaybackRate();

		this._handleSceneChange();
	}

	start(): void {
		this.running = true;
		this._clock.start();
	}

	stop(): void {
		this._clock.stop();
		this.running = false;
	}

	setNextAge(age: number): void {
		this._tickController.setNextAge(age);
	}

	getExecutionMode(): ExecutionMode {
		return this._executionMode;
	}

	setExecutionMode(execMode: ExecutionMode): void {
		this._executionMode = execMode;
		this._tickController.setExecutionMode(execMode);
	}

	getLoopConfiguration(): LoopConfiguration {
		return {
			loopMode: this._loopMode,
			delayIgnoreThreshold: this._delayIgnoreThreshold,
			skipTicksAtOnce: this._skipTicksAtOnce,
			skipThreshold: this._skipThreshold,
			jumpTryThreshold: this._jumpTryThreshold,
			jumpIgnoreThreshold: this._jumpIgnoreThreshold,
			playbackRate: this._playbackRate,
			loopRenderMode: this._loopRenderMode,
			targetTimeFunc: this._targetTimeFunc,
			targetTimeOffset: this._targetTimeOffset,
			originDate: this._originDate,
			targetAge: this._targetAge
		};
	}

	setLoopConfiguration(conf: LoopConfiguration): void {
		if (conf.loopMode != null)
			this._loopMode = conf.loopMode;
		if (conf.delayIgnoreThreshold != null)
			this._delayIgnoreThreshold = conf.delayIgnoreThreshold;
		if (conf.skipTicksAtOnce != null)
			this._skipTicksAtOnce = conf.skipTicksAtOnce;
		if (conf.skipThreshold != null)
			this._skipThreshold = conf.skipThreshold;
		if (conf.jumpTryThreshold != null)
			this._jumpTryThreshold = conf.jumpTryThreshold;
		if (conf.jumpIgnoreThreshold != null)
			this._jumpIgnoreThreshold = conf.jumpIgnoreThreshold;
		if (conf.playbackRate != null) {
			this._playbackRate = conf.playbackRate;
			this._clock.changeScaleFactor(this._playbackRate);
			this._updateGamePlaybackRate();
		}
		if (conf.loopRenderMode != null)
			this._setLoopRenderMode(conf.loopRenderMode);
		if (conf.targetTimeFunc != null) {
			// TODO consider _waitingNextTick
			this._targetTimeFunc = conf.targetTimeFunc;
		}
		if (conf.targetTimeOffset != null)
			this._targetTimeOffset = conf.targetTimeOffset;
		if (conf.originDate != null)
			this._originDate = conf.originDate;
		this._realTargetTimeOffset = (this._originDate != null) ? this._originDate - this._startedAt : (this._targetTimeOffset || 0);
		if (conf.targetAge != null) {
			if (this._targetAge !== conf.targetAge) {
				// targetAgeの変化によって必要なティックが変化した可能性がある。
				// 一度リセットして _onFrame() で改めて _waitingNextTick を求め直す。
				this._waitingNextTick = false;
			}
			this._targetAge = conf.targetAge;
		}
	}

	addTickList(tickList: pl.TickList): void {
		this._tickBuffer.addTickList(tickList);
	}

	getCurrentTime(): number {
		return this._currentTime;
	}

	/**
	 * 早送り状態に入る。
	 *
	 * すべての早回し(1フレームでの複数ティック消費)で早送り状態に入るわけではないことに注意。
	 * 少々の遅れはこのクラスが暗黙に早回しして吸収する。
	 * 早送り状態は、暗黙の早回しでは吸収しきれない規模の早回しの開始時に通知される。
	 * 具体的な値との関連は `skipThreshold` など `LoopConfiguration` のメンバを参照のこと。
	 */
	_startSkipping(): void {
		this._skipping = true;
		this._updateGamePlaybackRate();
		this._game.skippingChangedTrigger.fire(true);
	}

	/**
	 * 早送り状態を終える。
	 */
	_stopSkipping(): void {
		this._skipping = false;
		this._updateGamePlaybackRate();
		this._game.skippingChangedTrigger.fire(false);
	}

	/**
	 * Gameの再生速度設定を変える。
	 * 実際に再生速度(ティックの消費速度)を決めているのはこのクラスである点に注意。
	 */
	_updateGamePlaybackRate(): void {
		const realPlaybackRate = this._skipping ? (this._playbackRate * this._skipTicksAtOnce) : this._playbackRate;
		this._game._setAudioPlaybackRate(realPlaybackRate);
	}

	_handleSceneChange(): void {
		const scene = this._game.scene();
		const localMode = scene ? scene.local : g.LocalTickMode.FullLocal;  // シーンがない場合はローカルシーン同様に振る舞う(ティックは消化しない)
		const tickMode = scene ? scene.tickGenerationMode : g.TickGenerationMode.ByClock;
		if (this._sceneLocalMode !== localMode || this._sceneTickMode !== tickMode) {
			this._sceneLocalMode = localMode;
			this._sceneTickMode = tickMode;
			this._clock.frameTrigger.remove(this, this._onFrame);
			this._clock.frameTrigger.remove(this, this._onLocalFrame);
			switch (localMode) {
			case g.LocalTickMode.FullLocal:
				// ローカルシーン: TickGenerationMode に関係なくローカルティックのみ
				this._tickController.stopTick();
				this._clock.frameTrigger.handle(this, this._onLocalFrame);
				break;
			case g.LocalTickMode.NonLocal:
			case g.LocalTickMode.InterpolateLocal:
				if (tickMode === g.TickGenerationMode.ByClock) {
					this._tickController.startTick();
				} else {
					// Manual の場合: storageDataが乗る可能性がある最初のTickだけ生成させ、あとは生成を止める。(Manualの仕様どおりの挙動)
					// storageDataがある場合は送らないとPassiveのインスタンスがローディングシーンを終えられない。
					this._tickController.startTickOnce();
				}
				this._clock.frameTrigger.handle(this, this._onFrame);
				break;
			default:
				this.errorTrigger.fire(new Error("Unknown LocalTickMode: " + localMode));
				return;
			}
		}
	}

	/**
	 * ローカルシーンのフレーム処理。
	 *
	 * `this._clock` の管理する時間経過に従い、ローカルシーンにおいて1フレーム時間につき1回呼び出される。
	 */
	_onLocalFrame(): void {
		this._doLocalTick();
	}

	_doLocalTick(): void {
		const game = this._game;
		const pevs = this._eventBuffer.readLocalEvents();
		this._currentTime += this._frameTime;
		if (pevs) {
			for (let i = 0, len = pevs.length; i < len; ++i)
				game.events.push(this._eventConverter.toGameEvent(pevs[i]));
		}
		const sceneChanged = game.tick(false);
		if (sceneChanged)
			this._handleSceneChange();
	}

	/**
	 * 非ローカルシーンのフレーム処理。
	 *
	 * `this._clock` の管理する時間経過に従い、非ローカルシーンにおいて1フレーム時間につき1回呼び出される。
	 */
	_onFrame(frameArg: ClockFrameTriggerParameterObject): void {
		if (this._loopMode !== LoopMode.Replay || !this._targetTimeFunc) {
			this._onFrameNormal(frameArg);
		} else {
			this._onFrameForTimedReplay(frameArg);
		}
	}

	/**
	 * 時刻関数が与えられている場合のフレーム処理。
	 *
	 * 通常ケース (`_onFrameNormal()`) とは主に次の点で異なる:
	 *  1. `Replay` 時の実装しか持たない (`Realtime` は時刻関数を使わずとにかく最新ティックを目指すので不要)
	 *  2. ローカルティック補間をタイムスタンプに従ってしか行わない
	 * 後者は、ティック受信待ちなどの状況で起きるローカルティック補間がなくなることを意味する。
	 */
	_onFrameForTimedReplay(frameArg: ClockFrameTriggerParameterObject): void {
		let sceneChanged = false;
		const game = this._game;
		const targetTime = this._targetTimeFunc() + this._realTargetTimeOffset;
		const timeGap = targetTime - this._currentTime;
		const frameGap = (timeGap / this._frameTime);

		if ((frameGap > this._jumpTryThreshold || frameGap < 0) &&
		    (!this._waitingStartPoint) &&
		    (this._lastRequestedStartPointTime < this._currentTime)) {
			// スナップショットを要求だけして続行する(スナップショットが来るまで進める限りは進む)。
			this._waitingStartPoint = true;
			this._lastRequestedStartPointTime = targetTime;
			this._amflow.getStartPoint({ timestamp: targetTime }, this._onGotStartPoint_bound);
		}

		if (this._skipping) {
			if (frameGap <= 1)
				this._stopSkipping();
		} else {
			if (frameGap > this._skipThreshold)
				this._startSkipping();
		}

		if (frameGap <= 0) {
			return;
		}

		for (let i = 0; i < this._skipTicksAtOnce; ++i) {
			if (!this._tickBuffer.hasNextTick()) {
				if (!this._waitingNextTick) {
					this._tickBuffer.requestTicks();
					this._startWaitingNextTick();
				}
				break;
			}
			let nextFrameTime = this._currentTime + this._frameTime;
			let nextTickTime = this._tickBuffer.readNextTickTime();
			if (nextTickTime == null)
				nextTickTime = nextFrameTime;
			if (targetTime < nextFrameTime) {
				// 次フレームに進むと目標時刻を超過する＝次フレーム時刻までは進めない＝補間ティックは必要ない。
				if (nextTickTime <= targetTime) {
					// 特殊ケース: 目標時刻より手前に次ティックがあるので、目標時刻までは進んで次ティックは消化してしまう。
					// (この処理がないと、特にリプレイで「最後のティックの0.1フレーム時間前」などに来たときに進めなくなってしまう。)
					nextFrameTime = targetTime;
				} else {
					break;
				}
			} else {
				if (nextFrameTime < nextTickTime) {
					if (this._sceneLocalMode === g.LocalTickMode.InterpolateLocal) {
						this._doLocalTick();
					}
					continue;
				}
			}

			this._currentTime = nextFrameTime;
			const tick = this._tickBuffer.consume();
			let consumedAge = -1;

			let plEvents = this._eventBuffer.readLocalEvents();
			if (plEvents) {
				for (let j = 0, len = plEvents.length; j < len; ++j) {
					game.events.push(this._eventConverter.toGameEvent(plEvents[j]));
				}
			}
			if (typeof tick === "number") {
				consumedAge = tick;
				sceneChanged = game.tick(true);
			} else {
				consumedAge = tick[EventIndex.Tick.Age];
				let pevs: pl.Event[] = tick[EventIndex.Tick.Events];
				if (pevs) {
					for (let j = 0, len = pevs.length; j < len; ++j) {
						game.events.push(this._eventConverter.toGameEvent(pevs[j]));
					}
				}
				sceneChanged = game.tick(true);
			}

			if (game._notifyPassedAgeTable[consumedAge]) {
				// ↑ 無駄な関数コールを避けるため汚いが外部から事前チェック
				if (game.fireAgePassedIfNeeded()) {
					// age到達通知したらドライバユーザが何かしている可能性があるので抜ける
					frameArg.interrupt = true;
					break;
				}
			}

			if (sceneChanged) {
				this._handleSceneChange();
				break;  // シーンが変わったらローカルシーンに入っているかもしれないので一度抜ける
			}
		}
	}

	/**
	 * 非ローカルシーンの通常ケースのフレーム処理。
	 * 時刻関数が与えられていない、またはリプレイでない場合に用いられる。
	 */
	_onFrameNormal(frameArg: ClockFrameTriggerParameterObject): void {
		let sceneChanged = false;
		const game = this._game;

		if (this._waitingNextTick) {
			if (this._sceneLocalMode === g.LocalTickMode.InterpolateLocal)
				this._doLocalTick();
			return;
		}

		let targetAge: number;
		let ageGap: number;
		if (this._loopMode === LoopMode.Realtime) {
			targetAge = this._tickBuffer.knownLatestAge + 1;
			ageGap = targetAge - this._tickBuffer.currentAge;
		} else {
			if (this._targetAge === null) {
				// targetAgeがない: ただリプレイして見ているだけの状態。1フレーム時間経過 == 1age消化。
				targetAge = null;
				ageGap = 1;
			} else if (this._targetAge === this._tickBuffer.currentAge) {
				// targetAgeに到達した: targetAgeなし状態になる。
				targetAge = this._targetAge = null;
				ageGap = 1;
			} else {
				// targetAgeがあり、まだ到達していない。
				targetAge = this._targetAge;
				ageGap = targetAge - this._tickBuffer.currentAge;
			}
		}

		if ((ageGap > this._jumpTryThreshold || ageGap < 0) &&
		    (!this._waitingStartPoint) &&
		    (this._lastRequestedStartPointAge < this._tickBuffer.currentAge)) {
			// スナップショットを要求だけして続行する(スナップショットが来るまで進める限りは進む)。
			//
			// 上の条件が _lastRequestedStartPointAge を参照しているのは、スナップショットで飛んだ後もなお
			// `ageGap` が大きい場合に、延々スナップショットをリクエストし続けるのを避けるためである。
			// 実際にはageが進めば新たなスナップショットが保存されている可能性もあるので、
			// `targetAge` が変わればリクエストし続けるのが全くの無駄というわけではない。
			// が、`Realtime` で実行している場合 `targetAge` は毎フレーム変化してしまうし、
			// スナップショットがそれほど頻繁に保存されるとは思えない(すべきでもない)。ここでは割り切って抑制しておく。
			this._waitingStartPoint = true;
			this._lastRequestedStartPointAge = targetAge;
			this._amflow.getStartPoint({ frame: targetAge }, this._onGotStartPoint_bound);
		}

		if (this._skipping) {
			// リアルタイムモードの場合、早送り停止通知するのは既知最新ageまで消費しきった時にする。
			// リプレイモードでは、平常運行(1フレームずつ進む)に戻す時に早送り停止通知を出す。
			const skipStopGap = (this._loopMode === LoopMode.Realtime) ? 0 : 1;
			if (ageGap <= skipStopGap)
				this._stopSkipping();
		} else {
			if (ageGap > this._skipThreshold)
				this._startSkipping();
		}
		if (ageGap <= 0) {
			if (ageGap === 0) {
				if (this._tickBuffer.currentAge === 0) {
					// NOTE: Manualのシーンでは age=1 のティックが長時間受信できない場合がある。(TickBuffer#addTick()が呼ばれない)
					// そのケースでは最初のティックの受信にポーリング時間(初期値: 10秒)かかってしまうため、ここで最新ティックを要求する。
					this._tickBuffer.requestTicks();
				}
				// 既知最新ティックに追いついたので、ポーリング処理により後続ティックを要求する。
				// NOTE: Manualのシーンでは最新ティックの生成そのものが長時間起きない可能性がある。
				// (Manualでなくても、最新ティックの受信が長時間起きないことはありうる(長いローディングシーンなど))
				// (初期シーンがNonLocalであってもティックの進行によりManualのシーンに移行してしまう可能性があるため、常に最新のティックを要求している。)
				this._startWaitingNextTick();
			}

			if (this._sceneLocalMode === g.LocalTickMode.InterpolateLocal) {
				// ティック待ちの間、ローカルティックを(補間して)消費: 上の暫定対処のrequestTicks()より後に行うべきである点に注意。
				// ローカルティックを消費すると、ゲームスクリプトがraiseTick()する(_waitingNextTickが立つのはおかしい)可能性がある。
				this._doLocalTick();
			}
			return;
		}

		const loopCount = (!this._skipping && ageGap <= this._delayIgnoreThreshold) ? 1 : Math.min(ageGap, this._skipTicksAtOnce);

		for (let i = 0; i < loopCount; ++i) {
			// ティック時刻確認
			let nextFrameTime = this._currentTime + this._frameTime;
			const nextTickTime = this._tickBuffer.readNextTickTime();
			if (nextTickTime != null && nextFrameTime < nextTickTime) {
				if (this._loopMode === LoopMode.Realtime) {
					// リアルタイムモードではティック時刻を気にせず続行する(とにかく最新ageを目指すので)が、
					// リプレイモードに切り替えた時に矛盾しないよう時刻を補正する(当該ティック時刻まで待った扱いにする)。
					nextFrameTime = Math.ceil(nextTickTime / this._frameTime) * this._frameTime;
				} else {
					if (this._sceneLocalMode === g.LocalTickMode.InterpolateLocal) {
						this._doLocalTick();
						continue;
					}
					break;
				}
			}

			this._currentTime = nextFrameTime;
			const tick = this._tickBuffer.consume();
			let consumedAge = -1;

			if (tick != null) {
				let plEvents = this._eventBuffer.readLocalEvents();
				if (plEvents) {
					for (let k = 0, len = plEvents.length; k < len; ++k) {
						game.events.push(this._eventConverter.toGameEvent(plEvents[k]));
					}
				}
				if (typeof tick === "number") {
					consumedAge = tick;
					sceneChanged = game.tick(true);
				} else {
					consumedAge = tick[EventIndex.Tick.Age];
					let pevs: pl.Event[] = tick[EventIndex.Tick.Events];
					if (pevs) {
						for (let j = 0, len = pevs.length; j < len; ++j) {
							game.events.push(this._eventConverter.toGameEvent(pevs[j]));
						}
					}
					sceneChanged = game.tick(true);
				}
			} else {
				// 時間は経過しているが消費すべきティックが届いていない
				this._tickBuffer.requestTicks();
				this._startWaitingNextTick();
				break;
			}

			if (game._notifyPassedAgeTable[consumedAge]) {
				// ↑ 無駄な関数コールを避けるため汚いが外部から事前チェック
				if (game.fireAgePassedIfNeeded()) {
					// age到達通知したらドライバユーザが何かしている可能性があるので抜ける
					frameArg.interrupt = true;
					break;
				}
			}

			if (sceneChanged) {
				this._handleSceneChange();
				break;  // シーンが変わったらローカルシーンに入っているかもしれないので一度抜ける
			}
		}
	}

	_onGotNextFrameTick(): void {
		if (!this._waitingNextTick)
			return;
		if (this._loopMode === LoopMode.FrameByFrame) {
			// コマ送り実行時、Tickの受信は実行に影響しない。
			return;
		}
		this._stopWaitingNextTick();
	}

	_onGotStartPoint(err: Error | null, startPoint?: amf.StartPoint): void {
		this._waitingStartPoint = false;
		if (err) {
			this.errorTrigger.fire(err);
			return;
		}

		if (!this._targetTimeFunc || this._loopMode === LoopMode.Realtime) {
			const targetAge = (this._loopMode === LoopMode.Realtime) ? this._tickBuffer.knownLatestAge + 1 : this._targetAge;
			if (targetAge === null || targetAge < startPoint.frame) {
				// 要求した時点と今で目標age(targetAge)が変わっている。
				// 現在の状況では飛ぶ必要がないか、得られたStartPointでは目標ageより未来に飛んでしまう。
				return;
			}
			const currentAge = this._tickBuffer.currentAge;
			if (currentAge <= targetAge && startPoint.frame < currentAge + this._jumpIgnoreThreshold) {
				// 今の目標age(targetAge)は過去でない一方、得られたStartPointは至近未来または過去のもの → 飛ぶ価値なし。
				return;
			}
		} else {
			const targetTime = this._targetTimeFunc() + this._realTargetTimeOffset;
			if (targetTime < startPoint.timestamp) {
				// 要求した時点と今で目標時刻(targetTime)が変わっている。得られたStartPointでは目標時刻より未来に飛んでしまう。
				return;
			}
			const currentTime = this._currentTime;
			if (currentTime <= targetTime && startPoint.timestamp < currentTime + (this._jumpIgnoreThreshold * this._frameTime)) {
				// 今の目標時刻(targetTime)は過去でない一方、得られたStartPointは至近未来または過去のもの → 飛ぶ価値なし。
				return;
			}
		}

		// リセットから `g.Game#_start()` まで(エントリポイント実行まで)の間、processEvents() は起こらないようにする。
		// すなわちこれ以降 `_onGameStarted()` までの間 EventBuffer からイベントは取得できない。しかしそもそもこの状態では
		// イベントを処理するシーンがいない = 非ローカルティックは生成されない = 非ローカルティック生成時にのみ行われるイベントの取得もない。
		this._clock.frameTrigger.remove(this._eventBuffer, this._eventBuffer.processEvents);

		this._tickBuffer.setCurrentAge(startPoint.frame);
		this._currentTime = startPoint.timestamp || startPoint.data.timestamp || 0;  // data.timestamp は後方互換性のために存在。現在は使っていない。
		this._waitingNextTick = false;  // 現在ageを変えた後、さらに後続のTickが足りないかどうかは_onFrameで判断する。
		this._lastRequestedStartPointAge = -1;  // 現在ageを変えた時はリセットしておく(場合によっては不要だが、安全のため)。
		this._lastRequestedStartPointTime = -1;  // 同上。
		this._game._restartWithSnapshot(startPoint);
		this._handleSceneChange();
	}

	_onGameStarted(): void {
		// 必ず先頭に挿入することで、同じClockを参照する `TickGenerator` のティック生成などに毎フレーム先行してイベントフィルタを適用する。
		// 全体的に `this._clock` のhandle順は動作順に直結するので注意が必要。
		this._clock.frameTrigger.handleInsert(0, this._eventBuffer, this._eventBuffer.processEvents);
	}

	_setLoopRenderMode(mode: LoopRenderMode): void {
		if (mode === this._loopRenderMode)
			return;
		this._loopRenderMode = mode;
		switch (mode) {
		case LoopRenderMode.AfterRawFrame:
			this._clock.rawFrameTrigger.handle(this, this._renderOnRawFrame);
			break;
		case LoopRenderMode.None:
			this._clock.rawFrameTrigger.remove(this, this._renderOnRawFrame);
			break;
		default:
			this.errorTrigger.fire(new Error("GameLoop#_setLoopRenderMode: unknown mode: " + mode));
			break;
		}
	}

	_renderOnRawFrame(): void {
		const game = this._game;
		if (game.modified && game.scenes.length > 0) {
			game.render();
		}
	}

	_onGameRaiseEvent(e: g.Event): void {
		const pev = this._eventConverter.toPlaylogEvent(e);
		this._eventBuffer.onEvent(pev);
	}

	_onGameRaiseTick(es?: g.Event[]): void {
		if (this._executionMode !== ExecutionMode.Active)
			return;
		// TODO: イベントフィルタの中で呼ばれるとおかしくなる(フィルタ中のイベントがtickに乗らない)。
		if (es) {
			for (let i = 0; i < es.length; ++i)
				this._eventBuffer.addEventDirect(this._eventConverter.toPlaylogEvent(es[i]));
		}
		this._tickController.forceGenerateTick();
	}

	_onGameOperationPluginOperated(op: g.InternalOperationPluginOperation): void {
		const pev = this._eventConverter.makePlaylogOperationEvent(op);
		this._eventBuffer.onEvent(pev);
	}

	_onPollingTick(): void {
		// この関数が呼ばれる時、 `this._waitingNextTick` は必ず真である。
		// TODO: rawFrameTriggerのfire時に前回呼び出し時からの経過時間を渡せばnew Dateする必要はなくなる。
		const time = +new Date();
		if (time - this._lastPollingTickTime > this._pollingTickThreshold) {
			this._lastPollingTickTime = time;
			this._tickBuffer.requestTicks();
		}
	}

	_startWaitingNextTick(): void {
		this._waitingNextTick = true;
		// TODO: Active時はポーリングしない (要 Active/Passive 切り替えの対応)
		this._clock.rawFrameTrigger.handle(this, this._onPollingTick);
		this._lastPollingTickTime = +new Date();
	}

	_stopWaitingNextTick(): void {
		this._waitingNextTick = false;
		this._clock.rawFrameTrigger.remove(this, this._onPollingTick);
	}
}

