"use strict";
import * as pl from "@akashic/playlog";
import * as g from "@akashic/akashic-engine";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import * as mockpf from "../helpers/lib/MockPlatform";
import LoopMode from "../../lib/LoopMode";
import LoopRenderMode from "../../lib/LoopRenderMode";
import ExecutionMode from "../../lib/ExecutionMode";
import EventPriority from "../../lib/EventPriority";
import { EventBuffer } from "../../lib/EventBuffer";
import { TickBuffer } from "../../lib/TickBuffer";
import { GameLoop } from "../../lib/GameLoop";
import { MemoryAmflowClient } from "../../lib/auxiliary/MemoryAmflowClient";

describe("GameLoop", function () {
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

		expect(self.errorTrigger.isHandled(errorHandlerObject, errorHandlerObject.onError)).toBe(true);
		expect(self.running).toBe(false);
		expect(self._currentTime).toBe(0);
		expect(self._frameTime).toBe(1000 / game.fps);
		expect(self._targetTimeFunc).toBe(null);
		expect(self._startedAt).toBe(140);
		expect(self._targetTimeOffset).toBe(null);
		expect(self._originDate).toBe(null);
		expect(self._delayIgnoreThreshold).toBe(GameLoop.DEFAULT_DELAY_IGNORE_THRESHOLD);
		expect(self._skipTicksAtOnce).toBe(GameLoop.DEFAULT_SKIP_TICKS_AT_ONCE);
		expect(self._skipThreshold).toBe(GameLoop.DEFAULT_SKIP_THRESHOLD);
		expect(self._jumpTryThreshold).toBe(GameLoop.DEFAULT_JUMP_TRY_THRESHOLD);
		expect(self._jumpIgnoreThreshold).toBe(GameLoop.DEFAULT_JUMP_IGNORE_THRESHOLD);
		expect(self._pollingTickThreshold).toBe(GameLoop.DEFAULT_POLLING_TICK_THRESHOLD);
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
			delayIgnoreThreshold: GameLoop.DEFAULT_DELAY_IGNORE_THRESHOLD,
			skipTicksAtOnce: GameLoop.DEFAULT_SKIP_TICKS_AT_ONCE,
			skipThreshold: GameLoop.DEFAULT_SKIP_THRESHOLD,
			jumpTryThreshold: GameLoop.DEFAULT_JUMP_TRY_THRESHOLD,
			jumpIgnoreThreshold: GameLoop.DEFAULT_JUMP_IGNORE_THRESHOLD,
			playbackRate: 1,
			loopRenderMode: LoopRenderMode.AfterRawFrame,
			targetTimeFunc: null,
			targetTimeOffset: null,
			originDate: null,
			targetAge: null
		});
		var loopConf = {
			loopMode: LoopMode.Replay,
			delayIgnoreThreshold: 1,
			skipTicksAtOnce: 20,
			skipThreshold: 300,
			jumpTryThreshold: 4000,
			jumpIgnoreThreshold: 50000,
			playbackRate: 2,
			loopRenderMode: LoopRenderMode.None,
			targetTimeFunc: () => 0,
			targetTimeOffset: 20
		};
		self.setLoopConfiguration(loopConf);
		var obtainedConf = self.getLoopConfiguration();
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
		expect(obtainedConf.originDate).toBe(null);
		expect(obtainedConf.targetAge).toBe(null);

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
		expect(obtainedConf.originDate).toBe(null);
		expect(obtainedConf.targetAge).toBe(42);
	});

	it("can start/stop", function (done: Function) {
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
		expect(self._clock.frameTrigger.isHandled(self, self._onLocalFrame)).toBe(true);
		self.start();
		expect(self.running).toBe(true);
		expect(self._clock.running).toBe(true);

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 0) {
				clearInterval(timer);
				self.stop();
				expect(self.running).toBe(false);
				expect(self._clock.running).toBe(false);
				done();
				return;
			}

			looper.fun(self._frameTime);
		}, 1);

		game._reset({ age: 0, randGen: new g.XorshiftRandomGenerator(0) });
		game._loadAndStart({ args: undefined });
	});

	it("replays game in syncrhonization with the target time function", function (done: Function) {
		function makeTimestampEvent(timestamp: number): pl.TimestampEvent {
			return [
				pl.EventCode.Timestamp,  // Code
				EventPriority.System,    // Priority
				"dummyPlayerId",         // PlayerId
				timestamp                // Timestamp
			];
		}

		var timeFuncCount = 0;
		var timeFunc = () => {
			// 先頭の0は、ロードやシーン遷移で_onFrame()を抜けてしまう冒頭数フレーム用……
			// 最後が3070なのは、age 5の3000msを通過するタイミングによっては、age 6の消化は最悪3066.66ms(の直前)になる可能性があるので。
			var table = [0, 0, 0, 1000, 1001, 1030, 3070];
			return (timeFuncCount in table) ? table[timeFuncCount++] : table[table.length - 1];
		};

		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [
				0,
				9,
				[
					[3, [makeTimestampEvent(1010)]],
					[5, [makeTimestampEvent(3000)]]
				]
			],
			startPoints: [
				{
					frame: 0,
					timestamp: 0,
					data: {
						seed: 42,
						startedAt: 10000
					}
				}
			]
		});
		var spyOnGetTickList = spyOn(amflow, "getTickList").and.callThrough();

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
				targetTimeFunc: timeFunc
			},
			startedAt: 140
		});

		var timer: any = null;
		var passedTestAges: number[] = [];
		game.onResetTrigger.handle(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				switch (game.age) {
					case 4:
						passedTestAges.push(game.age);
						expect(self.getCurrentTime() > 1010).toBe(true);
						expect(self.getCurrentTime() < 1010 + self.getCurrentTime()).toBe(true);
						break;
					case 6:
						passedTestAges.push(game.age);
						expect(self.getCurrentTime() > 3000).toBe(true);
						expect(self.getCurrentTime() < 3000 + self.getCurrentTime()).toBe(true);

						clearInterval(timer);
						expect(spyOnGetTickList.calls.count()).toBe(1);
						expect(spyOnGetTickList.calls.argsFor(0)[0]).toBe(0);
						expect(spyOnGetTickList.calls.argsFor(0)[1]).toBe(TickBuffer.DEFAULT_SIZE_REQUEST_ONCE);
						expect(passedTestAges).toEqual([4, 6]);
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
		game._reset({ age: 0, randGen: new g.XorshiftRandomGenerator(0) });
		game.setEventFilterFuncs({
			addFilter: eventBuffer.addFilter.bind(eventBuffer),
			removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
		});
		game._loadAndStart({ args: undefined });
	});

	it("replays game with snapshot, in syncrhonization with the target time function", function (done: Function) {
		function makeTimestampEvent(timestamp: number): pl.TimestampEvent {
			return [
				pl.EventCode.Timestamp,  // Code
				EventPriority.System,    // Priority
				"dummyPlayerId",         // PlayerId
				timestamp                // Timestamp
			];
		}

		var amflow = new MemoryAmflowClient({
			playId: "dummyPlayId",
			tickList: [
				0,
				9,
				[
					[3, [makeTimestampEvent(1010)]],
					[5, [makeTimestampEvent(3000)]]
				]
			],
			startPoints: [
				{
					frame: 0,
					timestamp: 0,
					data: {
						seed: 42,
						startedAt: 10000
					}
				},
				{
					frame: 4,
					timestamp: 2000,
					data: { snapshot: {} }
				}
			]
		});
		var spyOnGetStartPoint = spyOn(amflow, "getStartPoint").and.callThrough();

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
				jumpIgnoreThreshold: 1  // 飛べるスナップショットがあったら飛ぶ
			},
			startedAt: 10000
		});

		var timer: any = null;
		var passedTestAges: number[] = [];
		game.onResetTrigger.handle(() => {
			game.vars.onUpdate = () => {  // LocalTickGame が毎 update コールしてくる関数
				passedTestAges.push(game.age);
				if (game.age === 6) {
					expect(spyOnGetStartPoint.calls.count()).toBe(2);
					expect(spyOnGetStartPoint.calls.argsFor(0)[0]).toEqual({ timestamp: 3050 }); // age 0での一度目の要求
					expect(spyOnGetStartPoint.calls.argsFor(1)[0]).toEqual({ timestamp: 3050 }); // ↑でage 4(2000ms)に飛び、まだgapが1050あるのでもう一度要求
					expect(self.getCurrentTime() > 3000).toBe(true);
					expect(self.getCurrentTime() < 3000 + self.getCurrentTime()).toBe(true);
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

		game._reset({ age: 0, randGen: new g.XorshiftRandomGenerator(42) });
		game.setEventFilterFuncs({
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
			tickList: [0, 9, []],
			startPoints: [zerothSp]
		});
		var spyOnGetStartPoint = spyOn(amflow, "getStartPoint").and.callThrough();
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
		amflow.sendTick([10]);  // Realtimeで非Manualなのでtickをpushされないと何も動かない

		var looper = self._clock._looper as mockpf.Looper;
		var timer = setInterval(() => {
			if (game.age > 10) {
				clearInterval(timer);
				expect(spyOnGetStartPoint.calls.count()).toBe(1);
				expect(spyOnGetStartPoint.calls.argsFor(0)[0]).toEqual({ frame: 11 });

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

		game.setEventFilterFuncs({ addFilter: (filter: g.EventFilter) => null, removeFilter: (filter?: g.EventFilter) => null });
		game._reset({ age: 0, randGen: new g.XorshiftRandomGenerator(0) });
		game._loadAndStart({ args: undefined });
	});

});
