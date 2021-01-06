import * as pl from "@akashic/playlog";
import { EventIndex, EventPriority, Trigger } from "@akashic/akashic-engine";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import { EventBuffer } from "../../lib/EventBuffer";
import { TickGenerator } from "../../lib/TickGenerator";

describe("TickGenerator", function () {
	it("can be instantiated", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		var errorCollector = {
			errors: <any[]>[],
			collect: (e: any) => { this.errors.push(e); }
		};
		var self = new TickGenerator({
			amflow: amflow,
			eventBuffer: eventBuffer,
			errorHandler: errorCollector.collect,
			errorHandlerOwner: errorCollector
		});

		expect(self.tickTrigger instanceof Trigger).toBe(true);
		expect(self.gotStorageTrigger instanceof Trigger).toBe(true);
		expect(self.errorTrigger instanceof Trigger).toBe(true);
		expect(self.errorTrigger.contains(errorCollector.collect, errorCollector)).toBe(true);
		expect(self._amflow).toBe(amflow);
		expect(self._eventBuffer).toBe(eventBuffer);
		expect(self._nextAge).toBe(0);
		expect(self._generatingTick).toBe(false);
		expect(self._waitingStorage).toBe(false);
	});

	it("can start/stop tick generation", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		var self = new TickGenerator({ amflow: amflow, eventBuffer: eventBuffer });

		var ticks: pl.Tick[] = [];
		self.tickTrigger.add((tick: pl.Tick) => { ticks.push(tick); });

		expect(self._generatingTick).toBe(false);
		expect(self._nextAge).toBe(0);
		self.next();
		expect(self._nextAge).toBe(0);
		expect(ticks.length).toBe(0);

		self.startTick();
		expect(self._generatingTick).toBe(true);
		self.next();

		self.startStopGenerate(true);
		self.next();
		expect(self._nextAge).toBe(2);
		expect(ticks).toEqual([
			[0, null],
			[1, null]
		]);

		self.stopTick();
		expect(self._generatingTick).toBe(false);
		self.next();
		expect(ticks.length).toBe(2);

		self.startTick();
		self.setNextAge(42);
		self.next();
		expect(ticks.length).toBe(3);
		expect(ticks[2][EventIndex.Tick.Age]).toBe(42);
	});

	it("can handle storageForJoin", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		var self = new TickGenerator({ amflow: amflow, eventBuffer: eventBuffer });

		var skey = { region: 0, regionKey: "FooValue" };
		var resolvedStorageDataSet = [{ readKey: skey, values: [{ data: 42 }] }];
		var pjoin: pl.JoinEvent = [pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
		var resolvedJoin: pl.JoinEvent = [pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", resolvedStorageDataSet];
		var msg: pl.MessageEvent = [pl.EventCode.Message, EventPriority.Joined, "dummyPlayerId", "MSG!!"];

		eventBuffer.setMode({ isReceiver: true });
		amflow.storage["FooValue"] = { data: 42 };

		var ticks: pl.Tick[] = [];
		self.tickTrigger.add((tick: pl.Tick) => { ticks.push(tick); });
		self.startTick();

		self.setRequestValuesForJoin([skey]);
		eventBuffer.onEvent(pjoin);
		eventBuffer.processEvents();

		self.next();
		self.next();
		expect(self._nextAge).toBe(2);
		expect(ticks).toEqual([
			[0, null],
			[1, null]
		]);

		// しばらくのちにストレージが解決され、次のtickにjoinが乗る
		amflow.requestsGetStorageData[0]();
		self.next();
		expect(ticks.length).toBe(3);
		expect(ticks[2]).toEqual([2, [resolvedJoin]]);

		// ほかのイベントと同時に解決されるケースではほかのイベントと一緒にtickに乗る
		eventBuffer.onEvent(pjoin);
		eventBuffer.processEvents();
		self.next();
		amflow.requestsGetStorageData[0]();
		eventBuffer.onEvent(msg);
		eventBuffer.processEvents();
		self.next();
		expect(ticks.length).toBe(5);
		expect(ticks[4]).toEqual([4, [msg, resolvedJoin]]);
	});

	it("gets storage", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var error = false;
		var eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		var self = new TickGenerator({ amflow: amflow, eventBuffer: eventBuffer, errorHandler: (e: any) => { error = true; } });

		var skey = { region: 0, regionKey: "FooValue" };
		var resolvedStorageDataSet = [{ readKey: skey, values: [{ data: 42 }] }];

		eventBuffer.setMode({ isReceiver: true });
		amflow.storage["FooValue"] = { data: 42 };

		var ticks: pl.Tick[] = [];
		self.tickTrigger.add((tick: pl.Tick) => { ticks.push(tick); });
		self.startTick();

		self.next();
		expect(self._nextAge).toBe(1);
		expect(ticks).toEqual([ [0, null] ]);

		self.requestStorageTick([skey]);
		self.next();
		self.next();
		expect(self._nextAge).toBe(1);

		expect(error).toBe(false);
		self.requestStorageTick([skey]);
		expect(error).toBe(true);
		error = false;

		amflow.requestsGetStorageData[0]();
		self.next();
		expect(ticks.length).toBe(2);
		expect(ticks[1]).toEqual([1, null, resolvedStorageDataSet]);
	});
});
