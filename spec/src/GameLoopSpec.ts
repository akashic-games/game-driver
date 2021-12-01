"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import * as mockpf from "../helpers/lib/MockPlatform";
import * as constants from "../../lib/constants";
import LoopMode from "../../lib/LoopMode";
import LoopRenderMode from "../../lib/LoopRenderMode";
import ExecutionMode from "../../lib/ExecutionMode";
import { EventBuffer } from "../../lib/EventBuffer";
import { TickBuffer } from "../../lib/TickBuffer";
import { GameLoop } from "../../lib/GameLoop";
import { MemoryAmflowClient } from "@akashic/amflow-util/lib/MemoryAmflowClient";

describe("GameLoop", function () {
	function makeTimestampEvent(timestamp: number): pl.TimestampEvent {
		return [
			pl.EventCode.Timestamp,  // Code
			g.EventPriority.System,  // Priority
			"dummyPlayerId",         // PlayerId
			timestamp                // Timestamp
		];
	}

	it("can be instantiated", function () {
		var amflow = new MockAmflow();
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var errorHandlerObject = {
			errors: [] as any[],
			onError: function (e: any) {
				this.errors.push(e);
			}
		};
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Active,
			configuration: {
				loopMode: LoopMode.Realtime
			},
			startedAt: 140,
			errorHandler: errorHandlerObject.onError,
			errorHandlerOwner: errorHandlerObject
		});

		expect(self.errorTrigger.contains(errorHandlerObject.onError, errorHandlerObject)).toBe(true);
		expect(self.running).toBe(false);
		expect(self._currentTime).toBe(140);
		expect(self._frameTime).toBe(1000 / game.fps);
		expect(self._targetTimeFunc).toBe(null);
		expect(self._startedAt).toBe(140);
		expect(self._targetTimeOffset).toBe(null);
		expect(self._originDate).toBe(null);
		expect(self._delayIgnoreThreshold).toBe(constants.DEFAULT_DELAY_IGNORE_THRESHOLD);
		expect(self._skipTicksAtOnce).toBe(constants.DEFAULT_SKIP_TICKS_AT_ONCE);
		expect(self._skipThreshold).toBe(constants.DEFAULT_SKIP_THRESHOLD);
		expect(self._jumpTryThreshold).toBe(constants.DEFAULT_JUMP_TRY_THRESHOLD);
		expect(self._jumpIgnoreThreshold).toBe(constants.DEFAULT_JUMP_IGNORE_THRESHOLD);
		expect(self._pollingTickThreshold).toBe(constants.DEFAULT_POLLING_TICK_THRESHOLD);
		expect(self._playbackRate).toBe(1);
		expect(self._loopRenderMode).toBe(LoopRenderMode.AfterRawFrame);

		expect(self._loopMode).toBe(LoopMode.Realtime);
		expect(self._amflow).toBe(amflow);
		expect(self._game).toBe(game);
		expect(self._eventBuffer).toBe(eventBuffer);
		expect(self._executionMode).toBe(ExecutionMode.Active);

		expect(self._targetAge).toBe(null);
		expect(self._waitingStartPoint).toBe(false);
		expect(self._lastRequestedStartPointAge).toBe(-1);
		expect(self._waitingNextTick).toBe(false);
		expect(self._skipping).toBe(false);
		expect(self._lastPollingTickTime).toBe(0);
	});

	it("provides the accessors for its properties", function () {
		var amflow = new MockAmflow();
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Active,
			configuration: {
				loopMode: LoopMode.Realtime
			},
			startedAt: 140
		});

		expect(self.getExecutionMode()).toBe(ExecutionMode.Active);
		self.setExecutionMode(ExecutionMode.Passive);
		expect(self.getExecutionMode()).toBe(ExecutionMode.Passive);

		expect(self._tickController._generator._nextAge).toBe(0);
		self.setNextAge(100);
		expect(self._tickController._generator._nextAge).toBe(100);

		expect(self.getLoopConfiguration()).toEqual({
			loopMode: LoopMode.Realtime,
			delayIgnoreThreshold: constants.DEFAULT_DELAY_IGNORE_THRESHOLD,
			skipTicksAtOnce: constants.DEFAULT_SKIP_TICKS_AT_ONCE,
			skipThreshold: constants.DEFAULT_SKIP_THRESHOLD,
			skipAwareGame: true,
			jumpTryThreshold: constants.DEFAULT_JUMP_TRY_THRESHOLD,
			jumpIgnoreThreshold: constants.DEFAULT_JUMP_IGNORE_THRESHOLD,
			playbackRate: 1,
			loopRenderMode: LoopRenderMode.AfterRawFrame,
			targetTimeFunc: undefined,
			targetTimeOffset: undefined,
			originDate: undefined,
			omitInterpolatedTickOnReplay: true,
			targetAge: undefined
		});
		var loopConf = {
			loopMode: LoopMode.Replay,
			delayIgnoreThreshold: 1,
			skipTicksAtOnce: 20,
			skipThreshold: 300,
			skipAwareGame: false,
			jumpTryThreshold: 4000,
			jumpIgnoreThreshold: 50000,
			playbackRate: 2,
			loopRenderMode: LoopRenderMode.None,
			targetTimeFunc: () => 0,
			omitInterpolatedTickOnReplay: true,
			targetTimeOffset: 20
		};
		self.setLoopConfiguration(loopConf);
		var obtainedConf = self.getLoopConfiguration();
		expect(obtainedConf.loopMode).toBe(loopConf.loopMode);
		expect(obtainedConf.delayIgnoreThreshold).toBe(loopConf.delayIgnoreThreshold);
		expect(obtainedConf.skipTicksAtOnce).toBe(loopConf.skipTicksAtOnce);
		expect(obtainedConf.skipThreshold).toBe(loopConf.skipThreshold);
		expect(obtainedConf.skipAwareGame).toBe(loopConf.skipAwareGame);
		expect(obtainedConf.jumpTryThreshold).toBe(loopConf.jumpTryThreshold);
		expect(obtainedConf.jumpIgnoreThreshold).toBe(loopConf.jumpIgnoreThreshold);
		expect(obtainedConf.playbackRate).toBe(loopConf.playbackRate);
		expect(obtainedConf.loopRenderMode).toBe(loopConf.loopRenderMode);
		expect(obtainedConf.targetTimeFunc).toBe(loopConf.targetTimeFunc);
		expect(obtainedConf.targetTimeOffset).toBe(loopConf.targetTimeOffset);
		expect(obtainedConf.originDate).toBeUndefined();
		expect(obtainedConf.omitInterpolatedTickOnReplay).toBe(loopConf.omitInterpolatedTickOnReplay);
		expect(obtainedConf.targetAge).toBeUndefined();

		self.setLoopConfiguration({
			loopMode: undefined,
			targetAge: 42,
			loopRenderMode: LoopRenderMode.None
		});
		obtainedConf = self.getLoopConfiguration();
		expect(obtainedConf.loopMode).toBe(loopConf.loopMode);
		expect(obtainedConf.delayIgnoreThreshold).toBe(loopConf.delayIgnoreThreshold);
		expect(obtainedConf.skipTicksAtOnce).toBe(loopConf.skipTicksAtOnce);
		expect(obtainedConf.skipThreshold).toBe(loopConf.skipThreshold);
		expect(obtainedConf.jumpTryThreshold).toBe(loopConf.jumpTryThreshold);
		expect(obtainedConf.jumpIgnoreThreshold).toBe(loopConf.jumpIgnoreThreshold);
		expect(obtainedConf.playbackRate).toBe(loopConf.playbackRate);
		expect(obtainedConf.loopRenderMode).toBe(loopConf.loopRenderMode);
		expect(obtainedConf.targetTimeFunc).toBe(loopConf.targetTimeFunc);
		expect(obtainedConf.targetTimeOffset).toBe(loopConf.targetTimeOffset);
		expect(obtainedConf.originDate).toBeUndefined();
		expect(obtainedConf.omitInterpolatedTickOnReplay).toBe(loopConf.omitInterpolatedTickOnReplay);
		expect(obtainedConf.targetAge).toBe(42);
	});

	it("can notifies the content of skip", function (done: any) {
		var amflow = new MockAmflow();
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Active,
			configuration: {
				loopMode: LoopMode.Realtime
			},
			startedAt: 140
		});

		expect(self.running).toBe(false);
		self.start();
		expect(self.running).toBe(true);
		expect(self._clock.running).toBe(true);

		var contentSkippingTestState = 0;
		var skippingTestState = 0;
		game.skippingChangedTrigger.add((skipping) => {
			switch (skippingTestState) {
			case 0:
				expect(skipping).toBe(true);
				expect(game.age).toBe(0);  // age 0 で必ずskipに入る
				expect(contentSkippingTestState).toBe(1);  // 実装上の理由でコンテンツへの通知が先行する
				break;
			case 1:
				expect(skipping).toBe(false);
				expect(game.age).toBe(1);  // Activeなので第0tickを消化した時点で追いついた
				expect(contentSkippingTestState).toBe(2);
				break;
			default:
				done.fail();
			}
			++skippingTestState;
		});

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 0) {
				clearInterval(timer);
				self.stop();
				expect(self.running).toBe(false);
				expect(self._clock.running).toBe(false);
				expect(skippingTestState).toBe(2);
				done();
				return;
			}

			looper.fun(self._frameTime);
		}, 1);

		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 0 });
		game._loadAndStart({ args: undefined });

		// コンテンツ向けの `skippingChanged` (`skippingChangedTrigger` でない) は `_reset()` で初期化された後に設定する必要がある
		game.skippingChanged.add((skipping) => {
			switch (contentSkippingTestState) {
			case 0:
				expect(skipping).toBe(true);
				break;
			case 1:
				expect(skipping).toBe(false);
				break;
			default:
				done.fail();
			}
			++contentSkippingTestState;
		});
	});

	it("can detect skip based on deltaTime of the looper arguments", async () => {
		const amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [0, 10, []],
			startPoints: [{
				frame: 0,
				timestamp: 0,
				data: {
					seed: 42,
					startedAt: 10000
				}
			}]
		});
		const platform = new mockpf.Platform({});
		const game = prepareGame({ title: FixtureGame.LocalTickGame, playerId: "dummyPlayerId" });
		const eventBuffer = new EventBuffer({ amflow, game });
		const self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				jumpTryThreshold: 2,
				loopMode: LoopMode.Realtime
			},
			startedAt: 140
		});
		self.start();

		const looper = self._clock._looper as mockpf.Looper;
		game._reset({ age: 0, randSeed: 0 });
		game._loadAndStart({ args: undefined });

		// 最新の状態まで追いつく
		await new Promise<void>((resolve, reject) => {
			const timer = setInterval(() => {
				if (game.age > 10) {
					clearInterval(timer);
					resolve();
					return;
				}
				looper.fun(self._frameTime);
			}, 1);
		});

		amflow.sendTick([11]); // 新しいtickを送信

		// 最新の状態まで追いつく
		await new Promise<void>((resolve, reject) => {
			let skipCalled = false;
			game.skippingChangedTrigger.add(() => {
				skipCalled = true;
			});
			const timer = setInterval(() => {
				if (game.age > 11) {
					expect(skipCalled).toBe(true); // skippingChangedTrigger が呼ばれていることを確認
					clearInterval(timer);
					resolve();
					return;
				}
				looper.fun(self._skipThresholdTime + 1);
			}, 1);
		});

		amflow.sendTick([12]); // 新しいtickを送信

		// 最新の状態まで追いつく
		await new Promise<void>((resolve, reject) => {
			let skipCalled = false;
			game.skippingChangedTrigger.add(() => {
				skipCalled = true;
			});
			const timer = setInterval(() => {
				if (game.age > 12) {
					expect(skipCalled).toBe(false); // skippingChangedTrigger が呼ばれていないことを確認
					clearInterval(timer);
					resolve();
					return;
				}
				looper.fun(self._skipThresholdTime - 1);
			}, 1);
		});
	});

	it("can start/stop", function (done: any) {
		var amflow = new MockAmflow();
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Active,
			configuration: {
				loopMode: LoopMode.Realtime,
				skipAwareGame: false,
				omitInterpolatedTickOnReplay: false
			},
			startedAt: 140
		});

		expect(self.running).toBe(false);
		self.start();
		expect(self.running).toBe(true);
		expect(self._clock.running).toBe(true);

		var skippingTestState = 0;
		game.skippingChangedTrigger.add((skipping) => {
			switch (skippingTestState) {
			case 0:
				expect(skipping).toBe(true);
				expect(game.age).toBe(0);  // age 0 で必ずskipに入る
				break;
			case 1:
				expect(skipping).toBe(false);
				expect(game.age).toBe(1);  // Activeなので第0tickを消化した時点で追いついた
				break;
			default:
				done.fail();
			}
			++skippingTestState;
		});

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 0) {
				clearInterval(timer);
				self.stop();
				expect(self.running).toBe(false);
				expect(self._clock.running).toBe(false);
				expect(skippingTestState).toBe(2);
				done();
				return;
			}

			looper.fun(self._frameTime);
		}, 1);

		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 0 });
		game._loadAndStart({ args: undefined });

		// コンテンツ向けの `skippingChanged` (`skippingChangedTrigger` でない) は `_reset()` で初期化された後に設定する必要がある
		game.skippingChanged.add(() => {
			// skipAwareGame が偽なのできてはいけない
			done.fail();
		});
	});

	it("replays game in syncrhonization with the target time function", function (done: any) {
		var timeFuncCount = 0;
		var timeTable = [1000, 1001, 1030, 3070]; // 最後の3070は、age 5(3000ms)の通過タイミング次第でage 6消化が3066.66ms(の直前)になるため。
		var timeFunc = () => {
			return (timeFuncCount in timeTable) ? timeTable[timeFuncCount] : timeTable[timeTable.length - 1];
		};
		var startedAt = 140;
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [
				0,
				9,
				[
					[3, [makeTimestampEvent(1010 + startedAt)]],
					[5, [makeTimestampEvent(3000 + startedAt)]]
				]
			],
			startPoints: [
				{
					frame: 0,
					timestamp: 0,
					data: {
						seed: 42,
						startedAt
					}
				}
			]
		});
		var spyOnGetTickList = jest.spyOn(amflow, "getTickList");

		var platform = new mockpf.Platform({ amflow });
		var game = prepareGame({ title: FixtureGame.LocalTickGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				loopMode: LoopMode.Replay,
				targetTimeFunc: timeFunc,
				omitInterpolatedTickOnReplay: false
			},
			startedAt
		});

		var timeReachedCount = 0;
		game.requestNotifyTargetTimeReached();
		game.targetTimeReachedTrigger.add((t) => {
			expect(t).toBe(timeTable[timeReachedCount]);
			++timeReachedCount;
			++timeFuncCount;
			game.requestNotifyTargetTimeReached();
		});

		expect(game._notifiesTargetTimeReached).toBe(true);
		game.cancelNofityTargetTimeReached();
		expect(game._notifiesTargetTimeReached).toBe(false);
		game.requestNotifyTargetTimeReached();
		expect(game._notifiesTargetTimeReached).toBe(true);

		var skippingTestState = 0;
		game.skippingChangedTrigger.add((skipping) => {
			switch (skippingTestState) {
			case 0:
				expect(skipping).toBe(true);
				expect(game.age).toBe(0);  // age 0 で必ずskipに入る
				break;
			case 1:
				expect(skipping).toBe(false);
				expect(game.age).toBe(3);  // 最初の目標時刻1000に到達できる＝skipから戻れるのはage 3を消化したあと
				break;
			default:
				done.fail();
			}
			++skippingTestState;
		});

		var tickCount = 0;
		var origTick = game.tick;
		game.tick = function (advanceAge?: boolean) {
			tickCount++;
			return origTick.call(this, advanceAge);
		};

		var timer: any = null;
		var passedTestAges: number[] = [];
		game.onResetTrigger.add(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				switch (game.age) {
					case 4:
						passedTestAges.push(game.age);

						// tick 3 のtimestamp分補間ティック(1010(ms), 30(fps)分)相当よりはupdateがきているはず
						expect(tickCount >= Math.floor(1010 * (game.fps / 1000))).toBe(true);

						// age 4 → ((tick 3のtimestamp) + startedAt + 1tick時間)はすぎているはず。 + 2tick時間はすぎていないはず
						expect(self.getCurrentTime() > 1010 + startedAt + self._frameTime).toBe(true);
						expect(self.getCurrentTime() < 1010 + startedAt + self._frameTime * 2).toBe(true);
						break;
					case 6:
						passedTestAges.push(game.age);

						// tick 5 のtimestamp分補間ティック(3000(ms), 30(fps)分)相当よりはupdateがきているはず
						expect(tickCount >= Math.floor(3000 * (game.fps / 1000))).toBe(true);

						// age 6 → ((tick 5のtimestamp) + startedAt + 1tick時間)はすぎているはず。 + 2tick時間はすぎていないはず
						expect(self.getCurrentTime() > 3000 + startedAt + self._frameTime).toBe(true);
						expect(self.getCurrentTime() < 3000 + startedAt + self._frameTime * 2).toBe(true);

						clearInterval(timer);
						expect(spyOnGetTickList.mock.calls.length).toBe(2); // 初回の読み込み + 等倍に戻ったタイミングでのティック再取得
						expect(spyOnGetTickList.mock.calls[0][0]).toEqual({
							begin: 0,
							end: TickBuffer.DEFAULT_SIZE_REQUEST_ONCE,
							excludeEventFlags: {
								ignorable: true
							}
						});
						// tick 3 に到達した時点で後続ティックを取得し直しているはず
						expect(spyOnGetTickList.mock.calls[1][0]).toEqual({
							begin: 3,
							end: TickBuffer.DEFAULT_SIZE_REQUEST_ONCE + 3
						});
						expect(passedTestAges).toEqual([4, 6]);
						expect(timeReachedCount).toBe(3);
						expect(skippingTestState).toBe(2);
						done();
						break;
					default:
						// do nothing
						break;
				}
			};
		});

		self.start();
		var looper = self._clock._looper as mockpf.Looper;
		timer = setInterval(() => {
			looper.fun(self._frameTime);
		}, 1);

		expect(self._frameTime).toBe(1000 / 30);   // 30 は fps. LocalTickGame の game.json 参照。
		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 0 });
		game.handlerSet.setEventFilterFuncs({
			addFilter: eventBuffer.addFilter.bind(eventBuffer),
			removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
		});
		game._loadAndStart({ args: undefined });
	});

	it("replays game in syncrhonization with the target time function - omit interpolated ticks", function (done: any) {
		var timeFuncCount = 0;
		var timeTable = [1000, 1001, 1030, 3500]; // 最後の3500は、age 5(3000ms)の通過タイミング次第でage 6消化が3066.66ms(の直前)になるため、それより大きい値。
		var timeFunc = () => {
			return (timeFuncCount in timeTable) ? timeTable[timeFuncCount] : timeTable[timeTable.length - 1];
		};
		var startedAt = 140;
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [
				0,
				9,
				[
					[3, [makeTimestampEvent(1010 + startedAt)]],
					[5, [makeTimestampEvent(3000 + startedAt)]]
				]
			],
			startPoints: [
				{
					frame: 0,
					timestamp: 0,
					data: {
						seed: 42,
						startedAt
					}
				}
			]
		});

		var platform = new mockpf.Platform({ amflow });
		var game = prepareGame({ title: FixtureGame.LocalTickGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				loopMode: LoopMode.Replay,
				targetTimeFunc: timeFunc,
				omitInterpolatedTickOnReplay: true
			},
			startedAt
		});

		game.requestNotifyTargetTimeReached();
		game.targetTimeReachedTrigger.add((t) => {
			++timeFuncCount;
			game.requestNotifyTargetTimeReached();
		});

		var timer: any = null;
		var passedTestAges: number[] = [];
		var origTick = game.tick;
		game.tick = function (advanceAge?: boolean, omittedTickCount?: number) {
			if (!game.scene().local) {
				// omitInterpolatedTickOnReplayなのでskip中は非ローカルティックはこない
				expect(!!advanceAge).not.toBe(self._skipping);
			}
			var ret = origTick.call(this, advanceAge, omittedTickCount);

			if (game.age === 4 && !this.isLastTickLocal) {
				// tick 3 を消化した時点: 最初の目標時刻1000msが必ずskipを起こさせているので、ここでomitされるティックが出る。
				// 具体的にいくつomitされるかはロード時間依存なので 0 より大きいとしか言えない。
				// (厳密に言えばアセットロードが長い(1000ms以上かかる)と「0より大きい」さえ成り立たないが、それを考慮しだすとタイムスタンプはテストしようがないので妥協)
				expect(this.lastOmittedLocalTickCount).toBeGreaterThan(0);
			}

			// omitInterpolatedTickOnReplay をつけているので、最終ティック(age 5の3000+140msから求まるage 9の3133.33+140ms)以後も、最後の目標時刻(3500ms)まで動く
			if ((3500 + 140 - 33.4) < self.getCurrentTime() && self.getCurrentTime() <= 3500 + 140) {
				clearInterval(timer);
				expect(passedTestAges).toEqual([4, 6]);
				done();
			}
			return ret;
		};

		game.onResetTrigger.add(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				switch (game.age) {
					case 4:
						passedTestAges.push(game.age);

						// age 4 → ((tick 3のtimestamp) + startedAt + 1tick時間)はすぎているはず。 + 2tick時間はすぎていないはず
						expect(self.getCurrentTime() >= 1010 + startedAt + self._frameTime).toBe(true);
						expect(self.getCurrentTime() < 1010 + startedAt + self._frameTime * 2).toBe(true);
						break;
					case 6:
						passedTestAges.push(game.age);

						// age 6 → ((tick 5のtimestamp) + startedAt + 1tick時間)はすぎているはず。 + 2tick時間はすぎていないはず
						expect(self.getCurrentTime() >= 3000 + startedAt + self._frameTime).toBe(true);
						expect(self.getCurrentTime() < 3000 + startedAt + self._frameTime * 2).toBe(true);
						break;
					default:
						// do nothing
						break;
				}
			};
		});

		self.start();
		var looper = self._clock._looper as mockpf.Looper;
		timer = setInterval(() => {
			looper.fun(self._frameTime);
		}, 1);

		expect(self._frameTime).toBe(1000 / 30);   // 30 は fps. LocalTickGame の game.json 参照。
		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 0 });
		game.handlerSet.setEventFilterFuncs({
			addFilter: eventBuffer.addFilter.bind(eventBuffer),
			removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
		});
		game._loadAndStart({ args: undefined });
	});

	it("replays game with snapshot, in syncrhonization with the target time function", function (done: Function) {
		var startedAt = 10000;
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [
				0,
				9,
				[
					[3, [makeTimestampEvent(1010 + startedAt)]],
					[5, [makeTimestampEvent(3000 + startedAt)]]
				]
			],
			startPoints: [
				{
					frame: 0,
					timestamp: 0,
					data: {
						seed: 42,
						startedAt
					}
				},
				{
					frame: 4,
					timestamp: 2000 + startedAt,
					data: { snapshot: {} }
				}
			]
		});
		var spyOnGetStartPoint = jest.spyOn(amflow, "getStartPoint");

		var platform = new mockpf.Platform({ amflow });
		var game = prepareGame({ title: FixtureGame.LocalTickGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				loopMode: LoopMode.Replay,
				targetTimeFunc: (() => 3250),
				originDate: 9800,  // startedAt が 10000 なので差 -200 が加算されて targetTime は 3050 として扱われるのが期待動作
				jumpTryThreshold: 1,    // とにかくスナップショットを探す
				jumpIgnoreThreshold: 1,  // 飛べるスナップショットがあったら飛ぶ
				omitInterpolatedTickOnReplay: false
			},
			startedAt
		});

		var timer: any = null;
		var passedTestAges: number[] = [];
		game.onResetTrigger.add(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				passedTestAges.push(game.age);
				if (game.age === 6) {
					expect(spyOnGetStartPoint.mock.calls.length).toBe(2);

					// age 0での一度目の要求がきているはず
					expect(spyOnGetStartPoint.mock.calls[0][0]).toEqual({ timestamp: 3050 + startedAt });
					// ↑でage 4(2000ms + startedAt)に飛び、まだgapが1050あるのでもう一度要求
					expect(spyOnGetStartPoint.mock.calls[1][0]).toEqual({ timestamp: 3050 + startedAt });
					// age 6 → ((tick 5のtimestamp) + startedAt + 1tick時間)はすぎているはず。 + 2tick時間はすぎていないはず
					expect(self.getCurrentTime() > 3000 + startedAt + self._frameTime).toBe(true);
					expect(self.getCurrentTime() < 3000 + startedAt + self._frameTime * 2).toBe(true);

					clearInterval(timer);
					expect(passedTestAges.length).toBe(31);
					expect(passedTestAges[0]).toBe(4);
					expect(passedTestAges[30]).toBe(6);
					expect(passedTestAges.filter(age => (age === 5)).length).toBe(29); // 2000msでage 4消化後、age5が3000msなので(FPS-1)回かかる
					done();
					return;
				}
			};
		});

		self.start();
		var looper = self._clock._looper as mockpf.Looper;
		timer = setInterval(() => {
			looper.fun(self._frameTime);
		}, 1);

		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 42 });
		game.handlerSet.setEventFilterFuncs({
			addFilter: eventBuffer.addFilter.bind(eventBuffer),
			removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
		});
		game._loadAndStart({ args: undefined });
	});

	it("ignores an unnecessary startpoint in Realtime", function (done: Function) {
		var zerothSp = {
			frame: 0,
			timestamp: 0,
			data: {
				seed: 42,
				startedAt: 10000
			}
		};
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [0, 10, []],
			startPoints: [zerothSp]
		});
		var spyOnGetStartPoint = jest.spyOn(amflow, "getStartPoint");
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				jumpTryThreshold: 2,
				loopMode: LoopMode.Realtime
			},
			startedAt: 140
		});

		self.start();

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 10) {
				clearInterval(timer);
				expect(spyOnGetStartPoint.mock.calls.length).toBe(1);
				expect(spyOnGetStartPoint.mock.calls[0][0]).toEqual({ frame: 11 });

				// Passive+Realtimeで、最新フレームにいる時、StartPoint受信時に誤って過去に飛ぶ問題の修正確認
				expect(self._tickBuffer.knownLatestAge).toBe(10);
				expect(self._tickBuffer.currentAge).toBe(11);
				self._onGotStartPoint(null, zerothSp);
				expect(self._tickBuffer.currentAge).toBe(11);  // 誤って第0ageに飛んでいないことを確認
				self.stop();

				done();
				return;
			}

			looper.fun(self._frameTime);
		}, 1);

		game.handlerSet.setEventFilterFuncs({ addFilter: (filter: g.EventFilter) => null, removeFilter: (filter?: g.EventFilter) => null });
		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game._reset({ age: 0, randSeed: 0 });
		game._loadAndStart({ args: undefined });
	});

	it("can be started with StartPoint", function (done: Function) {
		var zerothSp = {
			frame: 0,
			timestamp: 0,
			data: {
				seed: 42,
				startedAt: 10000
			}
		};
		var sp5: amf.StartPoint = {
			frame: 5,
			timestamp: 20000,
			data: {
				snapshotValue: 42
			}
		};
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [0, 10, []],
			startPoints: [zerothSp, sp5]
		});
		var spyOnGetTickList = jest.spyOn(amflow, "getTickList");
		var platform = new mockpf.Platform({});
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				loopMode: LoopMode.Realtime
			},
			startedAt: 140
		});

		self.start();

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 10) { // tick がすべて消化されることを確認
				clearInterval(timer);

				// reset したところからのみ tick 取得されることを確認
				expect(spyOnGetTickList.mock.calls.length).toBe(1);
				expect(spyOnGetTickList.mock.calls[0][0]).toEqual({
					begin: 5,
					end: 5 + TickBuffer.DEFAULT_SIZE_REQUEST_ONCE,
					excludeEventFlags: {
						ignorable: true
					}
				});

				self.stop();
				done();
				return;
			}

			looper.fun(self._frameTime);
		}, 1);

		game.handlerSet.setEventFilterFuncs({ addFilter: (filter: g.EventFilter) => null, removeFilter: (filter?: g.EventFilter) => null });
		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		self.reset(sp5);
	});

	it("does not request further ticks after it reaches the latest", function (done: Function) {
		var targetTimeValue = 200000; // tick 消化で絶対に到達しない時点
		var timeFunc = () => targetTimeValue;
		var zerothSp: amf.StartPoint = {
			frame: 0,
			timestamp: 0,
			data: {
				seed: 42,
				startedAt
			}
		};
		var startedAt = 140;
		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [0, 10, []],
			startPoints: [zerothSp]
		});
		var spyOnGetTickList = jest.spyOn(amflow, "getTickList");
		var platform = new mockpf.Platform({ amflow });
		var game = prepareGame({ title: FixtureGame.LocalTickGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow, game });
		var self = new GameLoop({
			amflow,
			platform,
			game,
			eventBuffer,
			executionMode: ExecutionMode.Passive,
			configuration: {
				loopMode: LoopMode.Replay,
				targetTimeFunc: timeFunc,
				omitInterpolatedTickOnReplay: true
			},
			startedAt
		});

		var gotNoTickCount = 0;
		self._tickBuffer.gotNoTickTrigger.add(() => { ++gotNoTickCount; });

		var timer: any = null;
		var sentAdditionalTick = false;
		game.onResetTrigger.add(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				switch (game.age) {
					case 1:
						// age 1 が消化できた時点で最初に設定した 10 までの tick が取得されていることを確認。
						expect(self._foundLatestTick).toBe(false);
						expect(spyOnGetTickList.mock.calls.length).toBe(1);
						expect(spyOnGetTickList.mock.calls[0][0]).toEqual({
							begin: 0,
							end: 0 + TickBuffer.DEFAULT_SIZE_REQUEST_ONCE,
							excludeEventFlags: {
								ignorable: true
							}
						});
						expect(gotNoTickCount).toBe(0);
						break;

					case 11:
						if (game.isLastTickLocal) {
							// 最初に流し込んだ [0, 10] の tick が終わって local tick の 11 が呼ばれ続ける状況で到達する箇所。
							// 後続 tick の取得を試みて空が返ってきた後の状況 (gotNoTickCount === 1) を待つ。
							if (gotNoTickCount === 0) return;

							if (!sentAdditionalTick) {
								sentAdditionalTick = true;

								// この時点で、後続 tick の取得を試みていて、さらに空が返ったので _foundLatestTick が立っている
								expect(self._foundLatestTick).toBe(true);
								expect(spyOnGetTickList.mock.calls.length).toBe(2);
								expect(spyOnGetTickList.mock.calls[1][0]).toEqual({
									begin: 11,
									end: 11 + TickBuffer.DEFAULT_SIZE_REQUEST_ONCE,
									excludeEventFlags: {
										ignorable: true
									}
								});

								// _foundLatestTick に到達した後に新規 tick を受信する状況をシミュレート
								setTimeout(() => amflow.sendTick([11]), 1);

								// 暫定: targetTimeFunc 付き Replay は、targetTime に到達してしまうと tick を受信しようが動かない。
								// 1 フレーム進めることで sendTick した 11 を消化させる。
								targetTimeValue += Math.ceil(self._frameTime);
							}
						} else {
							// 本題1: 一度立った _foundLatestTick が落ちていないことを確認
							expect(self._foundLatestTick).toBe(true);

							// skip 終了時の tick 取得が起きて +1 回増える
							expect(spyOnGetTickList.mock.calls.length).toBe(3);
							expect(spyOnGetTickList.mock.calls[2][0]).toEqual({
								begin: 11,
								end: 11 + TickBuffer.DEFAULT_SIZE_REQUEST_ONCE
							});

							// 時間だけ進めて local tick の 12 を消化させる
							targetTimeValue += Math.ceil(self._frameTime);
						}
						break;

					case 12:
						// 前提: この箇所は local でしか来ない (誰も age 12 の tick は作らない)
						expect(game.isLastTickLocal).toBe(true);

						// _foundLatestTick は立ったままである
						expect(self._foundLatestTick).toBe(true);
						// 本題2: next tick がない状態で local tick を消化しているが、 
						// 最新 tick は見つけた後 (_foundLatestTick) なので、さらに先を探す getTickList() の呼び出しは起きない。
						expect(spyOnGetTickList.mock.calls.length).toBe(3);

						clearInterval(timer);
						self.stop();
						done();
						break;

					default:
						// do nothing
						break;
				}
			};
		});

		self.start();
		var looper = self._clock._looper as mockpf.Looper;
		timer = setInterval(() => {
			looper.fun(self._frameTime);
		}, 1);

		self.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
		game.handlerSet.setEventFilterFuncs({
			addFilter: eventBuffer.addFilter.bind(eventBuffer),
			removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
		});
		self.reset(zerothSp);
	});
});
