"use strict";
import * as g from "@akashic/akashic-engine";
import type * as amf from "@akashic/amflow";
import type * as pdi from "@akashic/pdi-types";
import type * as pl from "@akashic/playlog";
import type { ClockFrameTriggerParameterObject } from "./Clock";
import { Clock } from "./Clock";
import * as constants from "./constants";
import type { EventBuffer } from "./EventBuffer";
import ExecutionMode from "./ExecutionMode";
import type { Game } from "./Game";
import type LoopConfiguration from "./LoopConfiguration";
import LoopMode from "./LoopMode";
import LoopRenderMode from "./LoopRenderMode";
import type { Profiler } from "./Profiler";
import { ProfilerClock } from "./ProfilerClock";
import type { TickBuffer } from "./TickBuffer";
import { TickController } from "./TickController";

const EventIndex = g.EventIndex; // eslint-disable-line @typescript-eslint/naming-convention

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
	/**
	 * 目標時刻関数を与えたリプレイにおいて次フレームとしてみなす閾値の猶予の比率。
	 *
	 * onFrame() の呼び出し間隔と目標時刻の差分とで誤差が生じる場合（典型的には目標時刻が整数値で丸め込まれるようなケース）において、
	 * その誤差が蓄積されると _localAdvanceTime の値が実際の経過時刻と乖離してしまうことがある。
	 * それを防ぐため、1フレームの経過時間が経っていなくても、この割合の時間が経過していれば1フレーム分の補間ティックを挿入する。
	 * その代わりに次フレームにおける猶予時間を長くする。
	 */
	static REPLAY_TARGET_TIME_ANTICIPATE_RATE: number = 0.95;

	errorTrigger: g.Trigger<any> = new g.Trigger();
	rawTargetTimeReachedTrigger: g.Trigger<number> = new g.Trigger();

	running: boolean = false;

	/**
	 * 時刻。
	 * 実時間ではなく、プレイ開始日時と経過フレーム数から計算される仮想的な時間である。
	 * この時間情報を元にタイムスタンプイベントの消化待ちを行う。
	 *
	 * _currentTickTime と異なり、ローカルティックを消化している間も進行する。
	 */
	_currentTime: number;

	/**
	 * ゲーム内時刻。
	 * 実時間ではなく、プレイ開始日時と非ローカルティックの消化状況から計算される仮想的な時間である。
	 * この時間情報を元に目標時刻への到達判定を行う。
	 *
	 * _currentTime と異なり、ローカルティックを消化している間は進行しない。
	 */
	_currentTickTime: number;

	/**
	 * 1フレーム分の時間。FPSの逆数。
	 * _currentTime, _currentTickTime の計算に用いる。
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
	_frameTimeTolerance: number; // _frameTime * REPLAY_TARGET_TIME_ANTICIPATE_RATE

	/**
	 * reset() 後、一度でも最新 (既知最新でなく実際の最新と思われる) tick を見つけたか。
	 *
	 * この値が偽である場合、受信できていない後続 tick が存在する可能性がある。
	 * 真ならば、以降の tick はすべて AMFlow#onTick() で受け取るはずなので、後続を探すための tick リクエストが不要になる。
	 * (なお一部の異常系ではこの値が真でも後続 tick を見落としている可能性があるが、その場合はポーリング処理で救うことにする)
	 */
	_foundLatestTick: boolean = false;

	/**
	 * _currentTickTime からローカルティック補間または目標時刻により進められた累積の経過時間。
	 *
	 * 通常、_doLocalTick() の呼び出しごとに _frameTime 分だけ加算される。
	 * tick の消化により _currentTickTime が更新されるタイミングで本変数はリセットされる。
	 * したがって、 _currentTickTime + localAdvanceTime が、実質的な「現在時刻」となる。
	 */
	_localAdvanceTime: number = 0;

	_skipping: boolean = false;
	_lastPollingTickTime: number = 0;
	_lastTargetTime: number = 0;
	_totalTargetTimeDelta: number = 0;

	_clock: Clock;
	_tickController: TickController;
	_tickBuffer: TickBuffer;
	_events: pl.Event[] = [];

	_onGotStartPoint_bound: (err: Error | null, startPoint?: amf.StartPoint) => void;

	constructor(param: GameLoopParameterObejct) {
		this._currentTime = param.startedAt;
		this._currentTickTime = this._currentTime;
		this._frameTime = 1000 / param.game.fps;
		this._frameTimeTolerance = this._frameTime * GameLoop.REPLAY_TARGET_TIME_ANTICIPATE_RATE;

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
				maxFramePerOnce: 5,
				deltaTimeBrokenThreshold: conf.deltaTimeBrokenThreshold
			});
		} else {
			this._clock = new ProfilerClock({
				fps: param.game.fps,
				scaleFactor: this._playbackRate,
				platform: param.platform,
				maxFramePerOnce: 5,
				profiler: param.profiler,
				deltaTimeBrokenThreshold: conf.deltaTimeBrokenThreshold
			});
		}

		this._tickController = new TickController({
			amflow: param.amflow,
			clock: this._clock,
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
		this._game.rawHandlerSet.raiseEventTrigger.add(this._onGameRaiseEvent, this);
		this._game.rawHandlerSet.raiseTickTrigger.add(this._onGameRaiseTick, this);
		this._game.rawHandlerSet.changeSceneModeTrigger.add(this._handleSceneChange, this);
		this._game.rawHandlerSet.changeLocalTickSuspendedTrigger.add(this._handleLocalTickSuspended, this);
		this._game._onStart.add(this._onGameStarted, this);
		this._tickBuffer.gotNextTickTrigger.add(this._onGotNextFrameTick, this);
		this._tickBuffer.gotNoTickTrigger.add(this._onGotNoTick, this);
		this._tickBuffer.start();
		this._eventBuffer.onLocalEventReceive.add(this._onReceiveLocalEvent, this);
		this._updateGameAudioSuppression();
	}

	reset(startPoint: amf.StartPoint): void {
		// リセットから `g.Game#_start()` まで(エントリポイント実行まで)の間、processEvents() は起こらないようにする。
		// すなわちこれ以降 `_onGameStarted()` までの間 EventBuffer からイベントは取得できない。しかしそもそもこの状態では
		// イベントを処理するシーンがいない = 非ローカルティックは生成されない = 非ローカルティック生成時にのみ行われるイベントの取得もない。
		this._clock.frameTrigger.remove(this._onEventsProcessed, this);

		if (this._skipping)
			this._stopSkipping();
		this._tickBuffer.setCurrentAge(startPoint.frame);
		this._currentTime = startPoint.timestamp || startPoint.data.timestamp || 0;  // data.timestamp は後方互換性のために存在。現在は使っていない。
		this._currentTickTime = this._currentTime;
		this._waitingNextTick = false; // 現在ageを変えた後、さらに後続のTickが足りないかどうかは_onFrameで判断する。
		this._foundLatestTick = false; // 同上。
		this._lastRequestedStartPointAge = -1;  // 現在ageを変えた時はリセットしておく(場合によっては不要だが、安全のため)。
		this._lastRequestedStartPointTime = -1;  // 同上。
		this._omittedTickDuration = 0;
		this._localAdvanceTime = 0;
		this._lastTargetTime = 0;
		this._totalTargetTimeDelta = 0;
		this._game._restartWithSnapshot(startPoint);
	}

	start(): void {
		this.running = true;
		this._clock.start();
	}

	stop(): void {
		this._clock.stop();
		this.running = false;
	}

	suspend(): void {
		this._clock.suspend();
	}

	resume(): void {
		this._clock.resume();
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
		// resume() が必要でないケースもありうるが、条件が煩雑で影響も軽微なので無条件で suspend を解除する
		this.resume();
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
			targetAge: this._targetAge ?? undefined,
			deltaTimeBrokenThreshold: this._clock.deltaTimeBrokenThreshold
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
			this._updateGameAudioSuppression();
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
		if (conf.deltaTimeBrokenThreshold != null) {
			this._clock.setDeltaTimeBrokenThreshold(conf.deltaTimeBrokenThreshold);
		}

		// resume() が必要でないケースもありうるが、条件が煩雑で影響も軽微なので無条件で suspend を解除する
		this.resume();

		// 以下は本来はプロパティごとに条件付き（e.g. deltaTimeBrokenThreshold のみが変更された場合など）でリセットすべきであるが、対象が多く条件分岐が煩雑になるため無条件にリセットしている。
		// 本メソッドは滅多に呼ばれず、次の 1 フレームの補間ティックが少なくなる程度のため影響も軽微である。
		this._totalTargetTimeDelta = 0;
		this._lastTargetTime = 0;
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
	 *
	 * @param isNear 真の場合、ゲームの再生速度設定を変えない (実質 "効果音をミュートしない")。ゲームへのスキッピング通知は行うことに注意。
	 */
	_startSkipping(isNear: boolean): void {
		this._skipping = true;
		if (!isNear)
			this._updateGameAudioSuppression();
		this._tickBuffer.startSkipping();
		this._eventBuffer.startSkipping();
		this._game.skippingChangedTrigger.fire(true);
	}

	/**
	 * 早送り状態を終える。
	 */
	_stopSkipping(): void {
		this._skipping = false;
		this._updateGameAudioSuppression();
		this._tickBuffer.endSkipping();
		this._eventBuffer.endSkipping();
		this._game.skippingChangedTrigger.fire(false);
	}

	/**
	 * Gameの音量抑制設定を更新する。
	 */
	_updateGameAudioSuppression(): void {
		const realPlaybackRate = this._skipping ? (this._playbackRate * this._skipTicksAtOnce) : this._playbackRate;
		if (realPlaybackRate !== 1.0) {
			this._game._startSuppressAudio();
		} else {
			this._game._endSuppressAudio();
		}
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

	_handleLocalTickSuspended(suspended: boolean): void {
		// 以下に該当する場合は clock を suspend しない。
		//  - Active: tick が生成できなくなるため
		//  - Replay: targetTimeFunc() の呼び出しをポーリングできなくなるため
		if (this._executionMode === ExecutionMode.Active || this._loopMode !== LoopMode.Realtime)
			return;

		if (suspended) {
			if (!this._tickBuffer.hasNextTick())
				this.suspend();
		} else {
			this.resume();
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
		this._currentTime += this._frameTime; // ここでは _currentTickTime は進まないことに注意 (ローカルティック消化では進まない)
		this._localAdvanceTime += this._frameTime;
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
			const prevTickTime = this._currentTickTime;
			this._onFrameForTimedReplay(targetTime, frameArg);
			this._lastTargetTime = targetTime;
			// 目標時刻到達判定: 進めなくなり、あと1フレームで目標時刻を過ぎるタイミングを到達として通知する。
			// 時間進行を進めていっても目標時刻 "以上" に進むことはないので「過ぎた」タイミングは使えない点に注意。
			// (また、それでもなお (prevTime <= targetTime) の条件はなくせない点にも注意。巻き戻す時は (prevTime > targetTime) になる)
			if ((prevTickTime === this._currentTickTime) && (prevTickTime <= targetTime) && this._isImmediateBeforeOf(targetTime))
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
		const timeGap = targetTime - this._currentTickTime;
		const frameGap = (timeGap / this._frameTime);
		const localFrameGap = (targetTime - (this._currentTickTime + this._localAdvanceTime)) / this._frameTime;

		// ここでの下限は frameGap を基準とする点に注意。
		// (localAdvanceTime の進行分は "巻き戻し" したところで消化する非ローカルティックがないため)
		if ((localFrameGap > this._jumpTryThreshold || frameGap < 0) &&
		    (!this._waitingStartPoint) &&
		    (this._lastRequestedStartPointTime < this._currentTickTime)) {
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
			if ((localFrameGap > this._skipThreshold || this._tickBuffer.currentAge === 0) &&
			    (this._tickBuffer.hasNextTick() || (this._omitInterpolatedTickOnReplay && this._foundLatestTick))) {
				// ここでは常に `frameGap > 0` であることに注意。0の時にskipに入ってもすぐ戻ってしまう
				const isTargetNear = localFrameGap <= this._skipThreshold; // (currentAge === 0) の時のみ真になりうることに注意
				this._startSkipping(isTargetNear);
			}
		}

		let consumedFrame = 0;
		for (; consumedFrame < this._skipTicksAtOnce; ++consumedFrame) {
			let nextFrameTime = this._currentTime + this._frameTime;
			if (!this._tickBuffer.hasNextTick()) {
				if (!this._waitingNextTick) {
					this._startWaitingNextTick();
					if (!this._foundLatestTick)
						this._tickBuffer.requestNonIgnorableTicks();
				}
				if (this._omitInterpolatedTickOnReplay && this._sceneLocalMode === "interpolate-local") {
					if (this._foundLatestTick) {
						// これ以上新しいティックが存在しない場合は現在時刻を目標時刻に合わせる。
						// (_doLocalTick() により現在時刻が this._frameTime 進むのでその直前まで進める)
						this._currentTime = targetTime - this._frameTime;
						this._localAdvanceTime = targetTime - this._currentTickTime;
					}
					// ティックがなく、目標時刻に到達していない場合、補間ティックを挿入する。
					let targetTimeDelta = 0;
					if (this._skipping || targetTime - this._lastTargetTime < 0 || this._lastTargetTime === 0) {
						// スキップ中または "実ティックを超えない範囲" での過去シーク (frameGap > 0 && targetTimeDelta < 0) では常に補間ティックを一つだけ挿入する。
						// (e.g. currentTickTime = 100 において targetTime が 200 から 150 に変更されるようなケース)
						// また、初回呼び出し時 (_lastTargetTime === 0) は差分が過大になるため、同様に 1 フレーム分の補間ティックを挿入する。
						targetTimeDelta = this._frameTime;
					} else {
						// 目標時刻関数は絶対時刻となり得るので初回呼び出し時 (_lastTargetTime === 0) は差分が過大になる。したがって targetTimeDelta を算出しない。
						targetTimeDelta = ((targetTime - this._lastTargetTime) + this._totalTargetTimeDelta);
					}
					for (let i = consumedFrame; i < this._skipTicksAtOnce; ++i) {
						if (targetTimeDelta <= this._frameTimeTolerance) {
							// 猶予をもたせてもなお次フレームの時間に満たない場合は補間ティックの挿入を次フレームまで見送る
							break;
						}
						targetTimeDelta -= this._frameTime;
						this._doLocalTick();
					}
					this._totalTargetTimeDelta = targetTimeDelta;
				}
				break;
			}

			const nextTickTime = this._tickBuffer.readNextTickTime() ?? (this._currentTickTime + this._frameTime);

			if (targetTime <= nextTickTime && targetTime <= nextFrameTime) {
				// 次ティックを消化すると目標時刻に到達・超過する: 次ティックは消化できない
				// 次フレーム時刻も目標時刻に到達・超過する: ローカルティック補完も要らない
				break;

			} else if (nextFrameTime < nextTickTime) {
				// 次フレーム時刻ではまだ次ティックを消化できない: ローカルティック補完するか、次ティック時刻まで一気に進む
				if (this._omitInterpolatedTickOnReplay && this._skipping) {
					// スキップ中、ティック補間不要なら即座に次ティック時刻(かその手前の目標時刻)まで進める。
					// (_onFrameNormal()の対応箇所と異なり、ここでは「次ティック時刻の "次フレーム時刻"」に切り上げないことに注意。
					//  時間ベースリプレイでは目標時刻 "以後" には進めないという制約がある。これを単純な実装で守るべく切り上げを断念している)
					if (targetTime <= nextTickTime) {
						// 次ティック時刻まで進めると目標時刻を超えてしまう: 目標時刻直前まで動いて抜ける(目標時刻直前までは来ないと目標時刻到達通知が永久にできない)
						this._omittedTickDuration += targetTime - this._currentTickTime;
						this._localAdvanceTime += targetTime - this._currentTickTime;
						this._currentTime = Math.floor(targetTime / this._frameTime) * this._frameTime;
						break;
					}
					nextFrameTime = nextTickTime;
					this._omittedTickDuration += nextTickTime - this._currentTickTime;
					this._localAdvanceTime += nextTickTime - this._currentTickTime;
				} else {
					if (this._sceneLocalMode === "interpolate-local") {
						this._doLocalTick();
					}
					continue;
				}
			}

			this._currentTime = nextFrameTime;
			this._currentTickTime = nextTickTime;
			this._localAdvanceTime = 0;
			this._totalTargetTimeDelta = 0;
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

		if (this._skipping && (targetTime - this._currentTime < this._frameTime) && this._isImmediateBeforeOf(targetTime)) {
			this._stopSkipping();
			// スキップ状態が解除された (≒等倍に戻った) タイミングで改めてすべてのティックを取得し直す
			this._tickBuffer.dropAll();
			this._tickBuffer.requestTicks();
		}
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
			this._startSkipping(false);
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
				if (!this._foundLatestTick) {
					// NOTE: Manualのシーンやアクティブインスタンスがポーズしている状況では、後続のティックが長時間受信できない場合がある。(TickBuffer#addTick()が呼ばれない)
					// そのケースでは後続ティックの受信にポーリングの単位時間(初期値: 10秒)かかってしまうため、ここで最新ティックを要求する。
					this._tickBuffer.requestNonIgnorableTicks();
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
			const isTargetNear =
				(currentAge === 0) && // 余計な関数呼び出しを避けるためにチェック
				this._tickBuffer.isKnownLatestTickTimeNear(this._skipThresholdTime, this._currentTickTime, this._frameTime);
			this._startSkipping(isTargetNear);
		}

		const loopCount = (!this._skipping && ageGap <= this._delayIgnoreThreshold) ? 1 : Math.min(ageGap, this._skipTicksAtOnce);

		let consumedFrame = 0;
		for (; consumedFrame < loopCount; ++consumedFrame) {
			// ティック時刻確認
			let nextFrameTime = this._currentTime + this._frameTime;
			const explicitNextTickTime = this._tickBuffer.readNextTickTime();
			if (explicitNextTickTime != null && nextFrameTime < explicitNextTickTime) {
				if (this._loopMode === LoopMode.Realtime || (this._omitInterpolatedTickOnReplay && this._skipping)) {
					// リアルタイムモード(と早送り中のリプレイでティック補間しない場合)ではティック時刻を気にせず続行するが、
					// リプレイモードに切り替えた時に矛盾しないよう時刻を補正する(当該ティック時刻まで待った扱いにする)。
					nextFrameTime = Math.ceil(explicitNextTickTime / this._frameTime) * this._frameTime;
					this._omittedTickDuration += nextFrameTime - this._currentTickTime;
					this._localAdvanceTime += nextFrameTime - this._currentTickTime;
				} else {
					if (this._sceneLocalMode === "interpolate-local") {
						this._doLocalTick();
						continue;
					}
					break;
				}
			}

			this._currentTime = nextFrameTime;
			this._currentTickTime = explicitNextTickTime ?? (this._currentTickTime + this._frameTime);
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
				this._localAdvanceTime = 0;
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
		// Tickを受信したら問答無用でクロックを開始する。
		this.resume();

		if (!this._waitingNextTick)
			return;
		if (this._loopMode === LoopMode.FrameByFrame) {
			// コマ送り実行時、Tickの受信は実行に影響しない。
			return;
		}
		this._totalTargetTimeDelta = 0;
		this._stopWaitingNextTick();
	}

	_onGotNoTick(): void {
		if (this._waitingNextTick)
			this._foundLatestTick = true;
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
			const currentTickTime = this._currentTickTime;
			if (currentTickTime <= targetTime && startPoint.timestamp < currentTickTime + (this._jumpIgnoreThreshold * this._frameTime)) {
				// 今の目標時刻(targetTime)は過去でない一方、得られたStartPointは至近未来または過去のもの → 飛ぶ価値なし。
				return;
			}
		}

		this.reset(startPoint);
	}

	_onGameStarted(): void {
		// 必ず先頭に挿入することで、同じClockを参照する `TickGenerator` のティック生成などに毎フレーム先行してイベントフィルタを適用する。
		// 全体的に `this._clock` のhandle順は動作順に直結するので注意が必要。
		this._clock.frameTrigger.add({ index: 0, owner: this, func: this._onEventsProcessed });
	}

	_onEventsProcessed(): void {
		this._eventBuffer.processEvents(this._sceneLocalMode === "full-local");
	}

	_onReceiveLocalEvent(_pev: pl.Event): void {
		this.resume();
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

	_isImmediateBeforeOf(targetTime: number): boolean {
		// 目標時刻への到達判定。次ティックがない場合は _foundLatestTick に委ねる、
		// すなわち既存全ティックを消化した時は到達とみなす点に注意。あまり直観的でないが、こうでないと永久に
		// rawTargetTimeReachedTrigger を fire できない可能性があり、後方互換性に影響がありうる。
		return this._tickBuffer.hasNextTick() ?
			(targetTime < (this._tickBuffer.readNextTickTime() ?? (this._currentTickTime + this._frameTime))) :
			this._foundLatestTick;
	}
}

