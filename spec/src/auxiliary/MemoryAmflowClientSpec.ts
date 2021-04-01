import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import { EventPriority } from "@akashic/akashic-engine";
import { MemoryAmflowClient, _cloneDeep } from "../../../lib/auxiliary/MemoryAmflowClient";

describe("MemoryAmflowClient", function () {

	it("can be instantiated", function () {
		var startPoints: amf.StartPoint[] = [];
		var self = new MemoryAmflowClient({
			playId: "testuser",
		});
		expect(self._playId).toBe("testuser");
		expect(self._tickList).toEqual(null);
		expect(self._startPoints).toEqual([]);
	});

	it("can be instantiated with tickList and startPoints", function () {
		var startPoints: amf.StartPoint[] = [];
		var self = new MemoryAmflowClient({
			playId: "testuser",
			tickList: [0, 10, []],
			startPoints: [{ frame: 5, timestamp: 100, data: { seed: 14 } }]
		});
		expect(self._tickList).toEqual([0, 10, []]);
		expect(self._startPoints).toEqual([{ frame: 5, timestamp: 100, data: { seed: 14 } }]);
	});

	describe("#authenticate()", function () {
		var self = new MemoryAmflowClient({
			playId: "testuser",
			tickList: [0, 10, []],
			startPoints: [{ frame: 5, timestamp: 100, data: { seed: 14 } }]
		});

		it("grants a permission to writeTick for TOKEN_ACTIVE", function (done: Function) {
			self.authenticate(MemoryAmflowClient.TOKEN_ACTIVE, function (err, perm) {
				expect(err).toBe(null);
				expect(perm.writeTick).toBe(true);
				expect(perm.subscribeTick).toBe(false);
				done();
			});
		});

		it("grants a permission to subscribeTick for TOKEN_PASSIVE", function (done: Function) {
			self.authenticate(MemoryAmflowClient.TOKEN_PASSIVE, function (err, perm) {
				expect(err).toBe(null);
				expect(perm.writeTick).toBe(false);
				expect(perm.subscribeTick).toBe(true);
				done();
			});
		});
	});

	describe("#sendTick", function () {
		var joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
		it("push new tick to tickList", function (done: any) {
			var self = new MemoryAmflowClient({
				playId: "testuser"
			});

			self.sendTick([5, [joinEvent]]);
			expect(self._tickList).toEqual([5, 5, [[5, [joinEvent]]]]);
			self.getTickList({ begin: 0, end: 10 }, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([5, 5, [[5, [joinEvent]]]]);
				self.sendTick([8, [joinEvent]]);
				self.getTickList({ begin: 0, end: 10 }, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([5, 8, [[5, [joinEvent]], [8, [joinEvent]]]]);
					done();
				});
			});
		});

		it("push same tick to tickList", function (done: any) {
			var self = new MemoryAmflowClient({
				playId: "testuser",
			});
			self.getTickList({ begin: 0, end: 10 }, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toBeUndefined();
				self.sendTick([5, [joinEvent]]);
				try {
					self.sendTick([5, [joinEvent]]);
				} catch (err) {
					expect(err).not.toBeNull();
					done();
					return;
				}
				done.fail();
			});
		});

		it("clones given ticks", function () {
			const self = new MemoryAmflowClient({
				playId: "testuser"
			});
			const age = 5;
			const targetTick: pl.Tick = [age, [joinEvent]];
			self.sendTick(targetTick);
			expect(self._tickList).toEqual([age, age, [[age, [joinEvent]]]]);

			// sendしたtickの値を変更しても_tickListの中身が変わらないことを確認
			targetTick[0] = 3;
			expect(self._tickList).toEqual([age, age, [[age, [joinEvent]]]]);
		});

		it("drops transient events from tickList", function (done: any) {
			var self = new MemoryAmflowClient({
				playId: "testuser"
			});
			self.sendTick([
				1,
				[
					[0, 0b1000, "dummy-1-1"], // transient event
					[1, 0b0010, "dummy-1-2"],
					[2, 0b1111, "dummy-1-3"] // transient event
				]
			]);
			self.sendTick([2]);
			self.sendTick([
				3,
				[
					[0, 0b1000, "dummy-2-1"], // transient event
					[1, 0b1010, "dummy-2-2"], // transient event
					[2, 0b1111, "dummy-2-3"] // transient event
				]
			]);
			expect(self._tickList).toEqual([
				1,
				3,
				[
					[1, [[1, 0b0010, "dummy-1-2"]]],
					[3, []]
				]
			]);
			self.getTickList({ begin: 0, end: 10 }, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([
					1,
					3,
					[
						[1, [[1, 0b0010, "dummy-1-2"]]],
						[3, []]
					]
				]);
				self.sendTick([8, [joinEvent]]);
				self.getTickList({ begin: 0, end: 10 }, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([
						1,
						8,
						[
							[1, [[1, 0b0010, "dummy-1-2"]]],
							[3, []],
							[8, [joinEvent]]
						]
					]);
					done();
				});
			});
		});
	});

	describe("#dropAfter", function () {
		it("does nothing when dropping after the given tikcs", function () {
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [0, 10, []],
				startPoints: [{ frame: 5, timestamp: 100, data: { seed: 14 } }]
			});

			self.dropAfter(11);
			expect(self._tickList).toEqual([0, 10, []]);
			expect(self._startPoints).toEqual([{ frame: 5, timestamp: 100, data: { seed: 14 } }]);
		});

		it("drop anything when dropping before the given tikcs", function () {
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [0, 10, []],
				startPoints: [{ frame: 4, timestamp: 100, data: { bkup: "dummy" } }]
			});

			expect(self._tickList).toEqual([0, 10, []]);
			expect(self._startPoints).toEqual([{ frame: 4, timestamp: 100, data: { bkup: "dummy" } }]);

			self.dropAfter(6);
			expect(self._tickList).toEqual([0, 5, []]);
			expect(self._startPoints).toEqual([ { frame: 4, timestamp: 100, data: { bkup: "dummy" } }]);

			self.dropAfter(0);
			expect(self._tickList).toEqual(null);
			expect(self._startPoints).toEqual([]);
		});

		it("slices the given tikcs", function () {
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [0, 10, []],
				startPoints: [
					{ frame: 4, timestamp: 100, data: { seed: 14 } },
					{ frame: 8, timestamp: 200, data: { snapshot: { hoge: 0 } } },
				]
			});

			self.dropAfter(8);
			expect(self._tickList).toEqual([0, 7, []]);
			expect(self._startPoints).toEqual([{ frame: 4, timestamp: 100, data: { seed: 14 } }]);
		});

		it("slices ticks in the middle", function () {
			var joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			var joinEvent2: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId2", "dummy-name2", null];
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [
					0,
					20,
					[[5, [joinEvent]], [10, [joinEvent2]]]
				],
				startPoints: [{ frame: 4, timestamp: 100, data: { bkup: "dummy" } }]
			});

			self.dropAfter(8);
			expect(self._tickList).toEqual([0, 7, [
				[5, [joinEvent]]
			]]);
		});

	});

	describe("#getTickList (deprecated)", function () {
		it("starts from 0", function (done: any) {
			var joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			var joinEvent2: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId2", "dummy-name2", null];
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [
					0,
					20,
					[[7, [joinEvent]], [9, [joinEvent2]]]
				],
				startPoints: [
					{ frame: 6, timestamp: 150, data: { content: "dataFor6" } },
					{ frame: 18, timestamp: 450, data: { content: "dataFor18" } },
				]
			});
			self.getTickList(0, 5, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([0, 5, []]);

				self.getTickList(5, 10, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([5, 10,
						[[7, [joinEvent]], [9, [joinEvent2]]]
					]);
					self.getTickList(10, 12, (err, tickList) => {
						expect(err).toBeNull();
						expect(tickList).toEqual([10, 12, []]);
						done();
					});
				});
			});
		});

		it("starts from no 0", function (done: any) {
			var joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			var joinEvent2: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId2", "dummy-name2", null];

			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [
					5,
					20,
					[[7, [joinEvent]], [9, [joinEvent2]]]
				],
				startPoints: [
					{ frame: 6, timestamp: 600, data: { content: "dataFor6" } },
					{ frame: 18, timestamp: 1800, data: { content: "dataFor18" } },
				]
			});
			self.getTickList(0, 5, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([5, 5, []]);

				self.getTickList(5, 10, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([5, 10,
						[[7, [joinEvent]], [9, [joinEvent2]]]
					]);
					self.getTickList(10, 12, (err, tickList) => {
						expect(err).toBeNull();
						expect(tickList).toEqual([10, 12, []]);
						done();
					});
				});
			});
		});
	});

	describe("#getTickList", () => {
		it("starts from 0", done => {
			const joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			const joinEvent2: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId2", "dummy-name2", null];
			const self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [
					0,
					20,
					[[7, [joinEvent]], [9, [joinEvent2]]]
				],
				startPoints: [
					{ frame: 6, timestamp: 150, data: { content: "dataFor6" } },
					{ frame: 18, timestamp: 450, data: { content: "dataFor18" } },
				]
			});
			self.getTickList({ begin: 0, end: 5 }, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([0, 5, []]);

				self.getTickList({ begin: 5, end: 10 }, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([5, 10,
						[[7, [joinEvent]], [9, [joinEvent2]]]
					]);

					self.getTickList({ begin: 10, end: 12 }, (err, tickList) => {
						expect(err).toBeNull();
						expect(tickList).toEqual([10, 12, []]);
						done();
					});
				});
			});
		});

		it("starts from no 0", done => {
			const joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			const joinEvent2: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId2", "dummy-name2", null];

			const self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [
					5,
					20,
					[[7, [joinEvent]], [9, [joinEvent2]]]
				],
				startPoints: [
					{ frame: 6, timestamp: 600, data: { content: "dataFor6" } },
					{ frame: 18, timestamp: 1800, data: { content: "dataFor18" } },
				]
			});
			self.getTickList({ begin: 0, end: 5 }, (err, tickList) => {
				expect(err).toBeNull();
				expect(tickList).toEqual([5, 5, []]);

				self.getTickList({ begin: 5, end: 10 }, (err, tickList) => {
					expect(err).toBeNull();
					expect(tickList).toEqual([5, 10,
						[[7, [joinEvent]], [9, [joinEvent2]]]
					]);
					self.getTickList({ begin: 10, end: 12 }, (err, tickList) => {
						expect(err).toBeNull();
						expect(tickList).toEqual([10, 12, []]);
						done();
					});
				});
			});
		});
	});

	describe("#getStartPoint", function () {
		it("when empty startPoints", function (done: any) {
			var sp6 = { frame: 6, timestamp: 600, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 1800, data: { content: "dataFor18" } };
			var self = new MemoryAmflowClient({
				playId: "testuser"
			});
			self.getStartPoint({}, (err: Error, startPoint: amf.StartPoint) => {
				expect(err).not.toBe(null);
				expect(err.message).toBe("no startpoint");
				done();
			});
		});
		it("return putted startPoints", function (done: any) {
			var sp6 = { frame: 6, timestamp: 600, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 1800, data: { content: "dataFor18" } };
			var self = new MemoryAmflowClient({
				playId: "testuser"
			});

			self.putStartPoint(sp6, (err) => {
				expect(err).toBeNull();
				expect(self._startPoints).toEqual([sp6]);
				self.getStartPoint({ frame: 10 }, (err: Error, startPoint: amf.StartPoint) => {
					expect(err).toBe(null);
					expect(startPoint).toEqual(sp6);
					self.getStartPoint({}, (err: Error, startPoint: amf.StartPoint) => {
						expect(err).toBe(null);
						expect(startPoint).toEqual(sp6);
						self.putStartPoint(sp18, (err) => {
							expect(err).toBeNull();
							self.getStartPoint({ frame: 20 }, (err: Error, startPoint: amf.StartPoint) => {
								expect(err).toBe(null);
								expect(startPoint).toEqual(sp18);
								done();
							})
						});
					});
				});
			});
		});

		it("bypasses the original", function (done: any) {
			var sp6 = { frame: 6, timestamp: 300, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 900, data: { content: "dataFor18" } };
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [5, 20],
				startPoints: [sp6, sp18]
			});

			expect(self._startPoints).toEqual([sp6, sp18]);
			self.getStartPoint({ frame: 10 }, (err: Error, startPoint: amf.StartPoint) => {
				expect(err).toBe(null);
				expect(startPoint).toEqual(sp6);
				done();
			});
		});

		it("compares the result with the original", function (done: any) {
			var sp6 = { frame: 6, timestamp: 300, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 900, data: { content: "dataFor18" } };
			var self = new MemoryAmflowClient({
				playId: "testuser",
				tickList: [5, 20],
				startPoints: [sp6, sp18]
			});

			self.getStartPoint({ frame: 30 }, (err: Error, startPoint: amf.StartPoint) => {
				expect(err).toBe(null);
				expect(startPoint).toEqual(sp18);
				done();
			});
		});
	});

	describe("#sendEvent", function() {
		it("clones given events", function () {
			const self = new MemoryAmflowClient({
				playId: "testuser"
			});
			const joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			self.sendEvent(joinEvent);
			expect(self._events).toEqual([[ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null]]);

			// sendしたeventの値を変更しても_eventsの中身が変わらないことを確認
			joinEvent[3] = "0000";
			expect(self._events).toEqual([[ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null]]);
		});
	});

	describe("#_cloneDeep", function() {
		it("can copy primitive-value", function () {
			expect(_cloneDeep(1)).toBe(1);
			expect(_cloneDeep("hoge")).toBe("hoge");
			expect(_cloneDeep(true)).toBe(true);
			expect(_cloneDeep(null)).toBe(null);
			expect(_cloneDeep(undefined)).toBe(undefined);
		});
		it("can copy json-data", function () {
			const array = [1 , "hoge", true, null, undefined, [2, "fuga", false, null, undefined]];
			const arrayClone = _cloneDeep(array);
			expect(arrayClone).toEqual(array);
			expect(arrayClone).not.toBe(array);

			const json = {
				"key1": "value",
				2 : 2,
				"key3": true,
				"key4": [2, "fuga", false, null, {"sub1": "aa", "sub2": true}],
				"key5": {
					"key5-1": "value",
					"key5-2": {
						1: "fugafuga",
						"key5-2-2": [2, "value5-2", undefined]
					}
				}
			};
			const jsonClone = _cloneDeep(json);
			expect(jsonClone).toEqual(json);
			expect(jsonClone).not.toBe(json);
		});
		it("can copy event and tick", function () {
			const joinEvent: pl.JoinEvent = [pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
			const joinEventClone = _cloneDeep(joinEvent);
			expect(joinEventClone).toEqual(joinEvent);
			expect(joinEventClone).not.toBe(joinEvent);

			const joinEventTick: pl.Tick = [0, [joinEvent]];
			const joinEventTickClone = _cloneDeep(joinEventTick);
			expect(joinEventTickClone).toEqual(joinEventTick);
			expect(joinEventTickClone).not.toBe(joinEventTick);
		});
	});
});
