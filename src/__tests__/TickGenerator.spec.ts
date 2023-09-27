import { EventIndex, EventPriority, Trigger } from "@akashic/akashic-engine";
import * as pl from "@akashic/playlog";
import { EventBuffer } from "../EventBuffer";
import { TickGenerator } from "../TickGenerator";
import { MockAmflow } from "./helpers/MockAmflow";
import { prepareGame, FixtureGame } from "./helpers/prepareGame";

describe("TickGenerator", function () {
	it("can be instantiated", function () {
		const amflow = new MockAmflow();
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		const eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		const errorCollector = {
			errors: <any[]>[],
			collect: function (this: any, e: any) {
				this.errors.push(e);
			}
		};
		const self = new TickGenerator({
			amflow: amflow,
			eventBuffer: eventBuffer,
			errorHandler: errorCollector.collect,
			errorHandlerOwner: errorCollector
		});

		expect(self.tickTrigger instanceof Trigger).toBe(true);
		expect(self.errorTrigger instanceof Trigger).toBe(true);
		expect(self.errorTrigger.contains(errorCollector.collect, errorCollector)).toBe(true);
		expect(self._amflow).toBe(amflow);
		expect(self._eventBuffer).toBe(eventBuffer);
		expect(self._nextAge).toBe(0);
		expect(self._generatingTick).toBe(false);
	});

	it("can start/stop tick generation", function () {
		const amflow = new MockAmflow();
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		const eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		const self = new TickGenerator({ amflow: amflow, eventBuffer: eventBuffer });

		const ticks: pl.Tick[] = [];
		self.tickTrigger.add((tick: pl.Tick) => {
			ticks.push(tick);
		});

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

	it("generates tick with given events", function () {
		const amflow = new MockAmflow();
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		const eventBuffer = new EventBuffer({ amflow: amflow, game: game });
		const self = new TickGenerator({ amflow: amflow, eventBuffer: eventBuffer });

		eventBuffer.setMode({ isLocalReceiver: true, isReceiver: true });
		self.startStopGenerate(true);

		const ticks: pl.Tick[] = [];
		self.tickTrigger.add((tick: pl.Tick) => {
			ticks.push(tick);
		});

		const je: pl.JoinEvent = [pl.EventCode.Join, 0, "player-id", "player-name"];
		const msge: pl.MessageEvent = [pl.EventCode.Message, 0, "player-id-2", "Message"];

		eventBuffer.onEvent(je);
		eventBuffer.onEvent(msge);
		eventBuffer.processEvents();
		self.next();
		expect(ticks.length).toBe(1);
		expect(ticks[0]).toEqual([0, [msge, je]]);

		eventBuffer.onEvent(msge);
		eventBuffer.processEvents();
		self.next();
		expect(ticks.length).toBe(2);
		expect(ticks[1]).toEqual([1, [msge]]);

		eventBuffer.onEvent(je);
		eventBuffer.processEvents();
		self.next();
		expect(ticks.length).toBe(3);
		expect(ticks[2]).toEqual([2, [je]]);

		eventBuffer.processEvents();
		self.next();
		expect(ticks.length).toBe(4);
		expect(ticks[3]).toEqual([3, null]);
	});
});
