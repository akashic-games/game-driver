"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import * as pdi from "@akashic/pdi-types";
import * as constants from "./constants";
import LoopMode from "./LoopMode";
import LoopRenderMode from "./LoopRenderMode";
import LoopConfiguration from "./LoopConfiguration";
import ExecutionMode from "./ExecutionMode";
import { Game } from "./Game";
import { EventBuffer } from "./EventBuffer";
import { Clock, ClockFrameTriggerParameterObject } from "./Clock";
import { ProfilerClock } from "./ProfilerClock";
import { TickBuffer } from "./TickBuffer";
import { TickController } from "./TickController";
import { Profiler } from "./Profiler";

const EventIndex = g.EventIndex;

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
	errorTrigger: g.Trigger<any> = new g.Trigger();
	rawTargetTimeReachedTrigger: g.Trigger<number> = new g.Trigger();

	running: boolean = false;

	/**
	 * 時刻。
	 * 実時間ではなく、プレイ開始日時と経過フレーム数から計算される仮想的な時間であることに注意。
	 * この時間情報を元にタイムスタンプイベントの消化待ちを行う。
	 */
	_currentTime: number;

	/**
	 * 1フレーム分の時間。FPSの逆数。
	 * _currentTime の計算に用いる。
	 */
	_frameTime: number;

	/**
	 * 最後のティック通知以後に、ローカルティック補間なしでスキップされた時間。
	 *
	 * ローカルティックの数は不定であるため、本来「省略された」数を数えることはできない。
	 * ただし Realtime 時や omitInterpolatedTickOnReplay フラグが真の場合には「タイムスタンプ待ちをせずに即座に時間を進める」場合がある。
	 * このような時に「タイムスタンプ待ちを行なっていたらいくつのローカルティックがある時間だったか」は求まる。この時間を累積する変数。
	 */
	_omittedTickDuration: number = 0;

	/**
	 * Replay時の目標時刻関数。
	 *
	 * 存在する場合、この値を毎フレーム呼び出し、その戻り値を目標時刻として扱う。
	 * すなわち、「この関数の戻り値を超えない最大のティック時刻を持つティック」が消化されるよう早送りやスナップショットジャンプを行う。
	 */
	_targetTimeFunc: (() => number) | null;

	_startedAt: number;
	_targetTimeOffset: number | null;
	_originDate: number | null;
	_realTargetTimeOffset: number;

	_delayIgnoreThreshold: number;
	_skipTicksAtOnce: number;
	_skipThreshold: number;
	_skipThresholdTime: number; // スキップ閾値の時間のキャッシュ
	_jumpTryThreshold: number;
	_jumpIgnoreThreshold: number;
	_pollingTickThreshold: number;
	_playbackRate: number;
	_loopRenderMode: LoopRenderMode | null;
	_omitInterpolatedTickOnReplay: boolean;

	_loopMode: LoopMode;
	_amflow: amf.AMFlow;
	_game: Game;
	_eventBuffer: EventBuffer;
	_executionMode: ExecutionMode;

	_sceneTickMode: g.TickGenerationModeString | null = null;
	_sceneLocalMode: g.LocalTickModeString | null = null;

	_targetAge: number | null;
	_waitingStartPoint: boolean = false;
	_lastRequestedStartPointAge: number = -1;
	_lastRequestedStartPointTime: number = -1;
	_waitingNextTick: boolean = false;
	_consumedLatestTick: boolean = false;
	_skipping: boolean = false;
	_lastPollingTickTime: number = 0;

	_clock: Clock;
	_tickController: TickController;
	_tickBuffer: TickBuffer;
	_events: pl.Event[] = [];

	_onGotStartPoint_bound: (err: Error | null, startPoint?: amf.StartPoint) => void;

	constructor(param: GameLoopParameterObejct) {
		this._currentTime = param.startedAt;
		this._frameTime = 1000 / param.game.fps;

		if (param.errorHandler) {
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);
		}

		const conf = param.configuration;
		this._startedAt = param.startedAt;
		this._targetTimeFunc = conf.targetTimeFunc || null;
		this._targetTimeOffset = conf.targetTimeOffset || null;
		this._originDate = conf.originDate || null;
		this._realTargetTimeOffset = (this._originDate != null) ? this._originDate : (this._targetTimeOffset || 0) + this._startedAt;
		this._delayIgnoreThreshold = conf.delayIgnoreThreshold || constants.DEFAULT_DELAY_IGNORE_THRESHOLD;
		this._skipTicksAtOnce = conf.skipTicksAtOnce || constants.DEFAULT_SKIP_TICKS_AT_ONCE;
		this._skipThreshold = conf.skipThreshold || constants.DEFAULT_SKIP_THRESHOLD;
		this._skipThresholdTime = this._skipThreshold * this._frameTime;
		// this._skipAwareGame はないことに注意 (Game#getIsSkipAware()) を使う
		this._jumpTryThreshold = conf.jumpTryThreshold || constants.DEFAULT_JUMP_TRY_THRESHOLD;
		this._jumpIgnoreThreshold = conf.jumpIgnoreThreshold || constants.DEFAULT_JUMP_IGNORE_THRESHOLD;
		this._pollingTickThreshold = conf._pollingTickThreshold || constants.DEFAULT_POLLING_TICK_THRESHOLD;
		this._playbackRate = conf.playbackRate || 1;
		const loopRenderMode = (conf.loopRenderMode != null) ? conf.loopRenderMode : LoopRenderMode.AfterRawFrame;
		this._loopRenderMode = null; // 後の_setLoopRenderMode()で初期化
		this._omitInterpolatedTickOnReplay = (conf.omitInterpolatedTickOnReplay != null) ? conf.omitInterpolatedTickOnReplay : true;

		this._loopMode = conf.loopMode;
		this._amflow = param.amflow;
		this._game = param.game;
		this._eventBuffer = param.eventBuffer;
		this._executionMode = param.executionMode;

		this._targetAge = (conf.targetAge != null) ? conf.targetAge : null;

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
			startedAt: param.startedAt,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});
		this._tickBuffer = this._tickController.getBuffer();

		this._onGotStartPoint_bound = this._onGotStartPoint.bind(this);

		this._setLoopRenderMode(loopRenderMode);
		this._game.setIsSkipAware(conf.skipAwareGame != null ? conf.skipAwareGame : true);
		this._game.setStorageFunc(this._tickController.storageFunc());
		this._game.handlerSet.raiseEventTrigger.add(this._onGameRaiseEvent, this);
		this._game.handlerSet.raiseTickTrigger.add(this._onGameRaiseTick, this);
		this._game.handlerSet.changeSceneModeTrigger.add(this._handleSceneChange, this);
		this._game._onStart.add(this._onGameStarted, this);
		this._tickBuffer.gotNextTickTrigger.add(this._onGotNextFrameTick, this);
		this._tickBuffer.gotNoTickTrigger.add(this._onGotNoTick, this);
		this._tickBuffer.start();
		this._updateGamePlaybackRate();
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
			skipAwareGame: this._game.getIsSkipAware(),
			jumpTryThreshold: this._jumpTryThreshold,
			jumpIgnoreThreshold: this._jumpIgnoreThreshold,
			playbackRate: this._playbackRate,
			loopRenderMode: this._loopRenderMode ?? undefined,
			targetTimeFunc: this._targetTimeFunc ?? undefined,
			targetTimeOffset: this._targetTimeOffset ?? undefined,
			originDate: this._originDate ?? undefined,
			omitInterpolatedTickOnReplay: this._omitInterpolatedTickOnReplay,
			targetAge: this._targetAge ?? undefined
		};
	}

	setLoopConfiguration(conf: LoopConfiguration): void {
		if (conf.loopMode != null)
			this._loopMode = conf.loopMode;
		if (conf.delayIgnoreThreshold != null)
			this._delayIgnoreThreshold = conf.delayIgnoreThreshold;
		if (conf.skipTicksAtOnce != null)
			this._skipTicksAtOnce = conf.skipTicksAtOnce;
		if (conf.skipThreshold != null) {
			this._skipThreshold = conf.skipThreshold;
			this._skipThresholdTime = this._skipThreshold * this._frameTime;
		}
		if (conf.skipAwareGame != null)
			this._game.setIsSkipAware(conf.skipAwareGame);
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
			this._targetTimeFunc = conf.targetTimeFunc;
		}
		if (conf.targetTimeOffset != null)
			this._targetTimeOffset = conf.targetTimeOffset;
		if (conf.originDate != null)
			this._originDate = conf.originDate;
		this._realTargetTimeOffset = (this._originDate != null) ? this._originDate : (this._targetTimeOffset || 0) + this._startedAt;
		if (conf.omitInterpolatedTickOnReplay != null)
			this._omitInterpolatedTickOnReplay = conf.omitInterpolatedTickOnReplay;
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

	_handleSceneChange(mode: g.SceneMode): void {
		const localMode = mode.local;
		const tickMode = mode.tickGenerationMode;
		if (this._sceneLocalMode !== localMode || this._sceneTickMode !== tickMode) {
			this._sceneLocalMode = localMode;
			this._sceneTickMode = tickMode;
			this._clock.frameTrigger.remove(this._onFrame, this);
			this._clock.frameTrigger.remove(this._onLocalFrame, this);
			switch (localMode) {
			case "full-local":
				// ローカルシーン: TickGenerationMode に関係なくローカルティックのみ
				this._tickController.stopTick();
				this._clock.frameTrigger.add(this._onLocalFrame, this);
				break;
			case "non-local":
			case "interpolate-local":
				if (tickMode === "by-clock") {
					this._tickController.startTick();
				} else {
					// Manual の場合: storageDataが乗る可能性がある最初のTickだけ生成させ、あとは生成を止める。(Manualの仕様どおりの挙動)
					// storageDataがある場合は送らないとPassiveのインスタンスがローディングシーンを終えられない。
					this._tickController.startTickOnce();
				}
				this._clock.frameTrigger.add(this._onFrame, this);
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
			game.tick(false, Math.floor(this._omittedTickDuration / this._frameTime), pevs);
		} else {
			game.tick(false, Math.floor(this._omittedTickDuration / this._frameTime));
		}
		this._omittedTickDuration = 0;
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
			const givenTargetTime = this._targetTimeFunc();
			const targetTime = givenTargetTime + this._realTargetTimeOffset;
			const prevTime = this._currentTime;
			this._onFrameForTimedReplay(targetTime, frameArg);
			// 目標時刻到達判定: 進めなくなり、あと1フレームで目標時刻を過ぎるタイミングを到達として通知する。
			// 時間進行を進めていっても目標時刻 "以上" に進むことはないので「過ぎた」タイミングは使えない点に注意。
			// (また、それでもなお (prevTime <= targetTime) の条件はなくせない点にも注意。巻き戻す時は (prevTime > targetTime) になる)
			if ((prevTime === this._currentTime) && (prevTime <= targetTime) && (targetTime <= prevTime + this._frameTime))
				this.rawTargetTimeReachedTrigger.fire(givenTargetTime);
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
	_onFrameForTimedReplay(targetTime: number, frameArg: ClockFrameTriggerParameterObject): void {
		let sceneChanged = false;
		const game = this._game;
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

		if (frameGap <= 0) {
			if (this._skipping)
				this._stopSkipping();
			return;
		}

		if (!this._skipping) {
			if ((frameGap > this._skipThreshold || this._tickBuffer.currentAge === 0) &&
			    (this._tickBuffer.hasNextTick() || (this._omitInterpolatedTickOnReplay && this._consumedLatestTick))) {
				// ここでは常に `frameGap > 0` であることに注意。0の時にskipに入ってもすぐ戻ってしまう
				this._startSkipping();
			}
		}

		let consumedFrame = 0;
		for (; consumedFrame < this._skipTicksAtOnce; ++consumedFrame) {
			let nextFrameTime = this._currentTime + this._frameTime;
			if (!this._tickBuffer.hasNextTick()) {
				if (!this._waitingNextTick) {
					this._startWaitingNextTick();
					if (!this._consumedLatestTick)
						this._tickBuffer.requestTicks();
				}
				if (this._omitInterpolatedTickOnReplay && this._sceneLocalMode === "interpolate-local") {
					if (this._consumedLatestTick) {
						// 最新のティックが存在しない場合は現在時刻を目標時刻に合わせる。
						// (_doLocalTick() により現在時刻が this._frameTime 進むのでその直前まで進める)
						this._currentTime = targetTime - this._frameTime;
					}
					// ティックがなく、目標時刻に到達していない場合、補間ティックを挿入する。
					// (経緯上ここだけフラグ名と逆っぽい挙動になってしまっている点に注意。TODO フラグを改名する)
					if (targetTime > nextFrameTime)
						this._doLocalTick();
				}
				break;
			}

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
					if (this._omitInterpolatedTickOnReplay && this._skipping) {
						// スキップ中、ティック補間不要なら即座に次ティック時刻(かその手前の目標時刻)まで進める。
						// (_onFrameNormal()の対応箇所と異なり、ここでは「次ティック時刻の "次フレーム時刻"」に切り上げないことに注意。
						//  時間ベースリプレイでは目標時刻 "以後" には進めないという制約がある。これを単純な実装で守るべく切り上げを断念している)
						if (targetTime <= nextTickTime) {
							// 次ティック時刻まで進めると目標時刻を超えてしまう: 目標時刻直前まで動いて抜ける(目標時刻直前までは来ないと目標時刻到達通知が永久にできない)
							this._omittedTickDuration += targetTime - this._currentTime;
							this._currentTime = Math.floor(targetTime / this._frameTime) * this._frameTime;
							break;
						}
						nextFrameTime = nextTickTime;
						this._omittedTickDuration += nextTickTime - this._currentTime;
					} else {
						if (this._sceneLocalMode === "interpolate-local") {
							this._doLocalTick();
						}
						continue;
					}
				}
			}

			this._currentTime = nextFrameTime;
			const tick = this._tickBuffer.consume();
			let consumedAge = -1;
			this._events.length = 0;

			if (tick != null) {
				const plEvents = this._eventBuffer.readLocalEvents();
				if (plEvents) {
					this._events.push(...plEvents);
				}
				if (typeof tick === "number") {
					consumedAge = tick;
					sceneChanged = game.tick(true, Math.floor(this._omittedTickDuration / this._frameTime), this._events);
				} else {
					consumedAge = tick[EventIndex.Tick.Age];
					const pevs = tick[EventIndex.Tick.Events];
					if (pevs) {
						this._events.push(...pevs);
					}
					sceneChanged = game.tick(true, Math.floor(this._omittedTickDuration / this._frameTime), this._events);
				}
			}
			this._omittedTickDuration = 0;

			if (game._notifyPassedAgeTable[consumedAge]) {
				// ↑ 無駄な関数コールを避けるため汚いが外部から事前チェック
				if (game.fireAgePassedIfNeeded()) {
					// age到達通知したらドライバユーザが何かしている可能性があるので抜ける
					frameArg.interrupt = true;
					break;
				}
			}

			if (sceneChanged) {
				break;  // シーンが変わったらローカルシーンに入っているかもしれないので一度抜ける
			}
		}

		if (this._skipping && (targetTime - this._currentTime < this._frameTime))
			this._stopSkipping();
	}

	/**
	 * 非ローカルシーンの通常ケースのフレーム処理。
	 * 時刻関数が与えられていない、またはリプレイでない場合に用いられる。
	 */
	_onFrameNormal(frameArg: ClockFrameTriggerParameterObject): void {
		let sceneChanged = false;
		const game = this._game;

		// NOTE: ブラウザが長時間非アクティブ状態 (裏タブに遷移していたなど) であったとき、長時間ゲームループが呼ばれないケースがある。
		// もしその期間がスキップの閾値を超えていたら、即座にスキップに入る。
		if (!this._skipping && frameArg.deltaTime > this._skipThresholdTime) {
			this._startSkipping();
			// ただしティック待ちが無ければすぐにスキップを抜ける。
			if (this._waitingNextTick)
				this._stopSkipping();
		}

		if (this._waitingNextTick) {
			if (this._sceneLocalMode === "interpolate-local")
				this._doLocalTick();
			return;
		}

		let targetAge: number | null;
		let ageGap: number;
		const currentAge = this._tickBuffer.currentAge;
		if (this._loopMode === LoopMode.Realtime) {
			targetAge = this._tickBuffer.knownLatestAge + 1;
			ageGap = targetAge - currentAge;
		} else {
			if (this._targetAge === null) {
				// targetAgeがない: ただリプレイして見ているだけの状態。1フレーム時間経過 == 1age消化。
				targetAge = null;
				ageGap = 1;
			} else if (this._targetAge === currentAge) {
				// targetAgeに到達した: targetAgeなし状態になる。
				targetAge = this._targetAge = null;
				ageGap = 1;
			} else {
				// targetAgeがあり、まだ到達していない。
				targetAge = this._targetAge;
				ageGap = targetAge - currentAge;
			}
		}

		if (
			(ageGap > this._jumpTryThreshold || ageGap < 0) &&
			(!this._waitingStartPoint) &&
			(this._lastRequestedStartPointAge < currentAge)
		) {
			// スナップショットを要求だけして続行する(スナップショットが来るまで進める限りは進む)。
			//
			// 上の条件が _lastRequestedStartPointAge を参照しているのは、スナップショットで飛んだ後もなお
			// `ageGap` が大きい場合に、延々スナップショットをリクエストし続けるのを避けるためである。
			// 実際にはageが進めば新たなスナップショットが保存されている可能性もあるので、
			// `targetAge` が変わればリクエストし続けるのが全くの無駄というわけではない。
			// が、`Realtime` で実行している場合 `targetAge` は毎フレーム変化してしまうし、
			// スナップショットがそれほど頻繁に保存されるとは思えない(すべきでもない)。ここでは割り切って抑制しておく。
			this._waitingStartPoint = true;
			// @ts-ignore TODO: targetAge が null の場合の振る舞い
			this._lastRequestedStartPointAge = targetAge;
			// @ts-ignore TODO: targetAge が null の場合の振る舞い
			this._amflow.getStartPoint({ frame: targetAge }, this._onGotStartPoint_bound);
		}

		if (ageGap <= 0) {
			if (ageGap === 0) {
				if (currentAge === 0) {
					// NOTE: Manualのシーンでは age=1 のティックが長時間受信できない場合がある。(TickBuffer#addTick()が呼ばれない)
					// そのケースでは最初のティックの受信にポーリング時間(初期値: 10秒)かかってしまうため、ここで最新ティックを要求する。
					// (初期シーンがNonLocalであってもティックの進行によりManualのシーンに移行してしまう可能性があるため、常に最新のティックを要求している。)
					this._tickBuffer.requestTicks(undefined, undefined, { ignorable: true });
				}
				// 既知最新ティックに追いついたので、ポーリング処理により後続ティックを要求する。
				// NOTE: Manualのシーンでは最新ティックの生成そのものが長時間起きない可能性がある。
				// (Manualでなくても、最新ティックの受信が長時間起きないことはありうる(長いローディングシーンなど))
				this._startWaitingNextTick();
			}

			if (this._sceneLocalMode === "interpolate-local") {
				// ティック待ちの間、ローカルティックを(補間して)消費: 上の暫定対処のrequestTicks()より後に行うべきである点に注意。
				// ローカルティックを消費すると、ゲームスクリプトがraiseTick()する(_waitingNextTickが立つのはおかしい)可能性がある。
				this._doLocalTick();
			}

			if (this._skipping)
				this._stopSkipping();
			return;
		}

		if (!this._skipping && (ageGap > this._skipThreshold || currentAge === 0) && this._tickBuffer.hasNextTick()) {
			// ここでは常に (ageGap > 0) であることに注意。(0の時にskipに入ってもすぐ戻ってしまう)
			this._startSkipping();
		}

		const loopCount = (!this._skipping && ageGap <= this._delayIgnoreThreshold) ? 1 : Math.min(ageGap, this._skipTicksAtOnce);

		let consumedFrame = 0;
		for (; consumedFrame < loopCount; ++consumedFrame) {
			// ティック時刻確認
			let nextFrameTime = this._currentTime + this._frameTime;
			const nextTickTime = this._tickBuffer.readNextTickTime();
			if (nextTickTime != null && nextFrameTime < nextTickTime) {
				if (this._loopMode === LoopMode.Realtime || (this._omitInterpolatedTickOnReplay && this._skipping)) {
					// リアルタイムモード(と早送り中のリプレイでティック補間しない場合)ではティック時刻を気にせず続行するが、
					// リプレイモードに切り替えた時に矛盾しないよう時刻を補正する(当該ティック時刻まで待った扱いにする)。
					nextFrameTime = Math.ceil(nextTickTime / this._frameTime) * this._frameTime;
					this._omittedTickDuration += nextFrameTime - this._currentTime;
				} else {
					if (this._sceneLocalMode === "interpolate-local") {
						this._doLocalTick();
						continue;
					}
					break;
				}
			}

			this._currentTime = nextFrameTime;
			const tick = this._tickBuffer.consume();
			let consumedAge = -1;
			this._events.length = 0;

			if (tick != null) {
				const plEvents = this._eventBuffer.readLocalEvents();
				if (plEvents) {
					this._events.push(...plEvents);
				}
				if (typeof tick === "number") {
					consumedAge = tick;
					sceneChanged = game.tick(true, Math.floor(this._omittedTickDuration / this._frameTime), this._events);
				} else {
					consumedAge = tick[EventIndex.Tick.Age];
					const pevs = tick[EventIndex.Tick.Events];
					if (pevs) {
						this._events.push(...pevs);
					}
					sceneChanged = game.tick(true, Math.floor(this._omittedTickDuration / this._frameTime), this._events);
				}
				this._omittedTickDuration = 0;
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
				break;  // シーンが変わったらローカルシーンに入っているかもしれないので一度抜ける
			}
		}

		// @ts-ignore TODO: targetAge が null の場合の振る舞い
		if (this._skipping && (targetAge - this._tickBuffer.currentAge < 1))
			this._stopSkipping();
	}

	_onGotNextFrameTick(): void {
		this._consumedLatestTick = false;
		if (!this._waitingNextTick)
			return;
		if (this._loopMode === LoopMode.FrameByFrame) {
			// コマ送り実行時、Tickの受信は実行に影響しない。
			return;
		}
		this._stopWaitingNextTick();
	}

	_onGotNoTick(): void {
		if (this._waitingNextTick)
			this._consumedLatestTick = true;
	}

	_onGotStartPoint(err: Error | null, startPoint?: amf.StartPoint): void {
		this._waitingStartPoint = false;
		if (err) {
			this.errorTrigger.fire(err);
			return;
		}
		if (!startPoint) {
			// NOTE: err が無ければ startPoint は必ず存在するはずだが、念の為にバリデートする。
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
		this._clock.frameTrigger.remove(this._onEventsProcessed, this);

		if (this._skipping)
			this._stopSkipping();
		this._tickBuffer.setCurrentAge(startPoint.frame);
		this._currentTime = startPoint.timestamp || startPoint.data.timestamp || 0;  // data.timestamp は後方互換性のために存在。現在は使っていない。
		this._waitingNextTick = false; // 現在ageを変えた後、さらに後続のTickが足りないかどうかは_onFrameで判断する。
		this._consumedLatestTick = false; // 同上。
		this._lastRequestedStartPointAge = -1;  // 現在ageを変えた時はリセットしておく(場合によっては不要だが、安全のため)。
		this._lastRequestedStartPointTime = -1;  // 同上。
		this._omittedTickDuration = 0;
		this._game._restartWithSnapshot(startPoint);
	}

	_onGameStarted(): void {
		// 必ず先頭に挿入することで、同じClockを参照する `TickGenerator` のティック生成などに毎フレーム先行してイベントフィルタを適用する。
		// 全体的に `this._clock` のhandle順は動作順に直結するので注意が必要。
		this._clock.frameTrigger.add({ index: 0, owner: this, func: this._onEventsProcessed });
	}

	_onEventsProcessed(): void {
		this._eventBuffer.processEvents(this._sceneLocalMode === "full-local");
	}

	_setLoopRenderMode(mode: LoopRenderMode): void {
		if (mode === this._loopRenderMode)
			return;
		this._loopRenderMode = mode;
		switch (mode) {
		case LoopRenderMode.AfterRawFrame:
			this._clock.rawFrameTrigger.add(this._renderOnRawFrame, this);
			break;
		case LoopRenderMode.None:
			this._clock.rawFrameTrigger.remove(this._renderOnRawFrame, this);
			break;
		default:
			this.errorTrigger.fire(new Error("GameLoop#_setLoopRenderMode: unknown mode: " + mode));
			break;
		}
	}

	_renderOnRawFrame(): void {
		this._game.render();
	}

	_onGameRaiseEvent(event: pl.Event): void {
		this._eventBuffer.onEvent(event);
	}

	_onGameRaiseTick(es?: pl.Event[]): void {
		if (this._executionMode !== ExecutionMode.Active)
			return;
		// TODO: イベントフィルタの中で呼ばれるとおかしくなる(フィルタ中のイベントがtickに乗らない)。
		if (es) {
			for (let i = 0; i < es.length; ++i)
				this._eventBuffer.addEventDirect(es[i]);
		}
		this._tickController.forceGenerateTick();
	}

	_onPollingTick(): void {
		// この関数が呼ばれる時、 `this._waitingNextTick` は必ず真である。
		// TODO: rawFrameTriggerのfire時に前回呼び出し時からの経過時間を渡せばnew Dateする必要はなくなる。
		const time = Date.now();
		if (time - this._lastPollingTickTime > this._pollingTickThreshold) {
			this._lastPollingTickTime = time;
			this._tickBuffer.requestTicks();
		}
	}

	_startWaitingNextTick(): void {
		this._waitingNextTick = true;
		// TODO: Active時はポーリングしない (要 Active/Passive 切り替えの対応)
		this._clock.rawFrameTrigger.add(this._onPollingTick, this);
		this._lastPollingTickTime = Date.now();
		if (this._skipping)
			this._stopSkipping();
	}

	_stopWaitingNextTick(): void {
		this._waitingNextTick = false;
		this._clock.rawFrameTrigger.remove(this._onPollingTick, this);
	}
}

