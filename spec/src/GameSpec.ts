import * as g from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import * as mockrf from "../helpers/lib/MockResourceFactory";
import { Game } from "../../lib/Game";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";

describe("Game", function() {

	var dummyConfiguration: g.GameConfiguration = {
		width: 320,
		height: 240,
		fps: 30,
		assets: {
			mainScene: {
				path: "/script/mainScene.js",
				virtualPath: "script/mainScene.js",
				type: "script",
				global: true
			}
		}
	};

	it("can be instantiated", function () {
		var rf = new mockrf.ResourceFactory();
		var game = new Game({
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});

		expect(game.player).toEqual({ id: "dummyPlayerId" });
		expect(game.skippingChangedTrigger).not.toBe(undefined);
	});

	it("can be destroyed", function () {
		var rf = new mockrf.ResourceFactory();
		var game = new Game({
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});
		game._destroy();
		expect(game.player).toBe(null);
		expect(game.skippingChangedTrigger).toBe(null);
	});

	it("notifies on _terminateGame()", function () {
		var rf = new mockrf.ResourceFactory();
		var game = new Game({
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});

		var firedCount = 0;
		game.abortTrigger.handle(function () {
			firedCount++;
		});
		expect(firedCount).toBe(0);
		game._terminateGame();
		expect(firedCount).toBe(1);
	});

	it("can fire the trigger on raiseEvent()", function () {
		var rf = new mockrf.ResourceFactory();
		var game = new Game({
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" }
		});

		var raisedEvents: g.Event[] = [];
		game.raiseEventTrigger.handle(function (e: g.Event) {
			raisedEvents.push(e);
		});

		game.raiseEvent(new g.MessageEvent("data", { id: "foo" }, true));
		game.raiseEvent(new g.PointDownEvent(0, null, { x: 0, y: 10 }, { id: "foo" }));

		// raiseEvent は player 情報を強制で上書きする仕様だが、上書きは自身ではなくplaylog.Eventへの変換時に行う。
		expect(raisedEvents).toEqual([
			new g.MessageEvent("data", { id: "foo" }, true),
			new g.PointDownEvent(0, null, { x: 0, y: 10 }, { id: "foo" })
		]);
	});

	it("manages age-passed notification", function (done: any) {
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });

		game.loadAndDo(() => {
			game.requestNotifyAgePassed(1);
			expect(game._notifyPassedAgeTable[1]).toBe(true);
			game.cancelNotifyAgePassed(1);
			expect(game._notifyPassedAgeTable[1]).toBe(undefined);
			game.requestNotifyAgePassed(2);
			expect(game._notifyPassedAgeTable[2]).toBe(true);

			var notifiedAge: number[] = [];
			game.agePassedTrigger.handle((age: number) => { notifiedAge.push(age); });
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

	it("notifies snapshot", function () {
		var rf = new mockrf.ResourceFactory();
		var game = new Game({
			configuration: dummyConfiguration,
			resourceFactory: rf,
			assetBase: ".",
			player: { id: "dummyPlayerId" },
			isSnapshotSaver: true
		});
		game._reset({ age: 0, randGen: new g.XorshiftRandomGenerator(0) });

		var called = 0;
		game.setCurrentTimeFunc(() => {
			++called;
			return 42;
		});

		var fired = 0;
		var startPoint = null;
		game.snapshotTrigger.handle((sp: amf.StartPoint) => {
			++fired;
			startPoint = sp;
		});

		expect(game.shouldSaveSnapshot()).toBe(true);
		expect(called).toBe(0);
		expect(fired).toBe(0);
		expect(startPoint).toBe(null);

		var snapshot = { dummy: "dummy" };
		game.saveSnapshot(snapshot);
		expect(called).toBe(1);
		expect(fired).toBe(1);
		expect(startPoint).toEqual({
			frame: 0,
			timestamp: 42,
			data: {
				randGenSer: game.random[0].serialize(),
				gameSnapshot: snapshot
			}
		});
	});
});
