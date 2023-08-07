import * as g from "@akashic/akashic-engine";
import type { StartPoint } from "@akashic/amflow";
import type * as pl from "@akashic/playlog";
import { Game } from "../Game";
import { GameHandlerSet } from "../GameHandlerSet";
import * as mockrf from "./helpers/MockResourceFactory";
import { prepareGame, FixtureGame } from "./helpers/prepareGame";

describe("Game", function() {

	const dummyConfiguration: g.GameConfiguration = {
		width: 320,
		height: 240,
		fps: 30,
		main: "./script/main.js",
		assets: {
			main: {
				path: "/script/main.js",
				virtualPath: "script/main.js",
				type: "script",
				global: true
			}
		}
	};

	it("can be instantiated", () => {
		const rf = new mockrf.ResourceFactory();
		const handlerSet = new GameHandlerSet({ isSnapshotSaver: false });
		const game = new Game({
			engineModule: g,
			handlerSet,
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});

		expect(game.player).toEqual({ id: "dummyPlayerId" });
		expect(game.skippingChangedTrigger).not.toBe(undefined);
	});

	it("can be destroyed", () => {
		const rf = new mockrf.ResourceFactory();
		const handlerSet = new GameHandlerSet({ isSnapshotSaver: false });
		const game = new Game({
			engineModule: g,
			handlerSet,
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});
		game._destroy();
		expect(game.player).toBe(null);
		expect(game.skippingChangedTrigger).toBe(null);
	});

	it("can be destroyed - after load", function (done: any) {
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId", gameArgs: { foo: 1 } });
		game.loadAndDo(() => {
			game._destroy();
			done();
		}, {
			frame: 0,
			data: { seed: 0 }
		});
	});

	it("notifies on _abortGame()", () => {
		const rf = new mockrf.ResourceFactory();
		const handlerSet = new GameHandlerSet({ isSnapshotSaver: false });
		const game = new Game({
			engineModule: g,
			handlerSet,
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});

		let firedCount = 0;
		game.abortTrigger.add(() => {
			firedCount++;
		});
		expect(firedCount).toBe(0);
		game._abortGame();
		expect(firedCount).toBe(1);
	});

	it("can fire the trigger on raiseEvent()", () => {
		const rf = new mockrf.ResourceFactory();
		const handlerSet = new GameHandlerSet({ isSnapshotSaver: false });
		const game = new Game({
			engineModule: g,
			handlerSet,
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" },
			selfId: "dummyPlayerId"
		});

		const raisedEvents: pl.Event[] = [];
		handlerSet.raiseEventTrigger.add(e => {
			raisedEvents.push(e);
		});

		game.raiseEvent(new g.MessageEvent("data", { id: "foo" }, true));
		game.raiseEvent(new g.PointDownEvent(0, undefined, { x: 0, y: 10 }, { id: "foo" }));

		// playlog.Eventへの変換時に player 情報が強制で上書きされる。
		expect(raisedEvents).toEqual([
			[32, undefined, "dummyPlayerId", "data", true],
			[33, undefined, "dummyPlayerId", 0, 0, 10, null, 0, false]
		]);
	});

	it("manages age-passed notification", function (done: any) {
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });

		game.loadAndDo(() => {
			game.requestNotifyAgePassed(1);
			expect(game._notifyPassedAgeTable[1]).toBe(true);
			game.cancelNotifyAgePassed(1);
			expect(game._notifyPassedAgeTable[1]).toBe(undefined);
			game.requestNotifyAgePassed(2);
			expect(game._notifyPassedAgeTable[2]).toBe(true);

			const notifiedAge: number[] = [];
			game.agePassedTrigger.add((age: number) => {
				notifiedAge.push(age);
			});
			game.tick(true);
			game.fireAgePassedIfNeeded();
			game.tick(true);
			game.fireAgePassedIfNeeded();
			expect(notifiedAge).toEqual([]);
			game.tick(true);
			game.fireAgePassedIfNeeded();
			expect(notifiedAge).toEqual([2]);
			done();
		});
	});

	it("notifies snapshot", () => {
		const rf = new mockrf.ResourceFactory();
		const handlerSet = new GameHandlerSet({ isSnapshotSaver: true });
		const game = new Game({
			engineModule: g,
			handlerSet,
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});
		game._reset({ age: 0, randSeed: 0 });

		let called = 0;
		handlerSet.setCurrentTimeFunc(() => {
			++called;
			return 42;
		});

		let fired = 0;
		let startPoint: StartPoint | null = null;
		handlerSet.snapshotTrigger.add(sp => {
			++fired;
			startPoint = sp;
		});

		expect(game.shouldSaveSnapshot()).toBe(true);
		expect(called).toBe(0);
		expect(fired).toBe(0);
		expect(startPoint).toBe(null);

		const snapshot = { dummy: "dummy" };
		game.saveSnapshot(snapshot);
		expect(called).toBe(1);
		expect(fired).toBe(1);
		expect(startPoint).toEqual({
			frame: 0,
			timestamp: 42,
			data: {
				nextEntityId: 0,
				randGenSer: game.random.serialize(),
				gameSnapshot: snapshot
			}
		});
	});

	it("passes gameArgs - without snapshot", function (done: any) {
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId", gameArgs: { foo: 1 } });
		game.loadAndDo(() => {
			expect(game.vars.args.foo).toBe(1);
			done();
		}, {
			frame: 0,
			data: { seed: 0 }
		});
	});

	it("passes gameArgs - with snapshot", function (done: any) {
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId", gameArgs: { foo: 2 } });
		const randGenSer = (new g.XorshiftRandomGenerator(0)).serialize();
		game.loadAndDo(() => {
			expect(game.vars.args.foo).toBe(2);
			done();
		}, {
			frame: 10,
			data: { nextEntityId: 3, randGenSer, gameSnapshot: { bar: 1 } }
		});
	});
});
