import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import { EventPriority } from "@akashic/akashic-engine";
import { MockAmflow } from "../../helpers/lib/MockAmflow";
import { ReplayAmflowProxy } from "../../../lib/auxiliary/ReplayAmflowProxy";

describe("ReplayAmflowProxy", function () {
	it("can be instantiated", function () {
		var amflow = new MockAmflow();
		var self = new ReplayAmflowProxy({
			amflow: amflow,
			tickList: [0, 10, []],
			startPoints: [{ frame: 0, timestamp: 0, data: { seed: 14 } }]
		});

		expect(self._amflow).toBe(amflow);
		expect(self._tickList).toEqual([0, 10, []]);
		expect(self._startPoints).toEqual([{ frame: 0, timestamp: 0, data: { seed: 14 } }]);
	});

	describe("#dropAfter", function () {
		it("does nothing when dropping after the given tikcs", function () {
			var amflow = new MockAmflow();
			var self = new ReplayAmflowProxy({
				amflow: amflow,
				tickList: [0, 10, []],
				startPoints: [{ frame: 0, timestamp: 0, data: { seed: 14 } }]
			});

			self.dropAfter(11);
			expect(self._tickList).toEqual([0, 10, []]);
			expect(self._startPoints).toEqual([{ frame: 0, timestamp: 0, data: { seed: 14 } }]);
		});

		it("drop anything when dropping before the given tikcs", function () {
			var amflow = new MockAmflow();
			var self = new ReplayAmflowProxy({
				amflow: amflow,
				tickList: [0, 10, []],
				startPoints: [{ frame: 0, timestamp: 0, data: { seed: 14 } }]
			});

			self.dropAfter(0);
			expect(self._tickList).toBe(null);
			expect(self._startPoints).toEqual([]);

			self.dropAfter(10);
			expect(self._tickList).toBe(null);
			expect(self._startPoints).toEqual([]);
		});

		it("slices the given tikcs", function () {
			var amflow = new MockAmflow();
			var self = new ReplayAmflowProxy({
				amflow: amflow,
				tickList: [0, 10, []],
				startPoints: [
					{ frame: 0, timestamp: 0, data: { seed: 14 } },
					{ frame: 8, timestamp: 100, data: { snapshot: { hoge: 0 } } },
				]
			});

			self.dropAfter(8);

			expect(self._tickList).toEqual([0, 7, []]);
			expect(self._startPoints).toEqual([{ frame: 0, timestamp: 0, data: { seed: 14 } }]);
		});
	});

	describe("#getTickList", function () {
		var joinEvent: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", null];
		var pdownEvent: pl.PointDownEvent = [
			pl.EventCode.PointDown, // 0: イベントコード
			EventPriority.Joined,   // 1: 優先度
			"dummyPlayerId",        // 2: プレイヤーID
			0,                      // 3: ポインターID
			10,                     // 4: X座標
			10                      // 5: Y座標
		];

		var amflow = new MockAmflow();
		var self = new ReplayAmflowProxy({
			amflow: amflow,
			tickList: [
				5,
				20,
				[[7, [joinEvent]], [9, [pdownEvent]]]
			],
			startPoints: [
				{ frame: 6, timestamp: 500, data: { content: "dataFor6" } },
				{ frame: 18, timestamp: 2000, data: { content: "dataFor18" } },
			]
		});

		it("merges the original and given tick #1", (done: any) => {
			self.getTickList(7, 22, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					7,
					22,
					[
						[7, [joinEvent]],
						[9, [pdownEvent]],
					]
				]);
				done();
			});

			amflow.requestsGetTicks[0].respond(null, [
				[21, null],
				[22, null]
			]);
		});

		it("merges the original and given tick #1-2", (done: any) => {
			self.getTickList(7, 22, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					7,
					20,
					[
						[7, [joinEvent]],
						[9, [pdownEvent]],
					]
				]);
				done();
			});
			amflow.requestsGetTicks[0].respond(null, null);
		});

		it("merges the original and given tick #2", (done: any) => {
			self.getTickList(3, 7, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					3,
					7,
					[[3, [pdownEvent]], [7, [joinEvent]]]
				]);
				done();
			});

			amflow.requestsGetTicks[0].respond(null, [
				[3, [pdownEvent]],
				[4, null]
			]);
		});

		it("merges the original and given tick #2-2", (done: any) => {
			self.getTickList(3, 7, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					5,
					7,
					[[7, [joinEvent]]]
				]);
				done();
			});
			amflow.requestsGetTicks[0].respond(null, null);
		});


		it("merges the original and given tick #3", (done: any) => {
			self.getTickList(3, 22, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					3,
					22,
					[
						[3, [pdownEvent]],
						[7, [joinEvent]],
						[9, [pdownEvent]],
						[22, [pdownEvent]]
					]
				]);
				done();
			});

			amflow.requestsGetTicks[0].respond(null, [
				[3, [pdownEvent]], [4, null], [5, [joinEvent]], [6, [pdownEvent]],
				[7, null], [8, null], [9, null], [10, null],
				[11, null], [12, null], [13, null], [14, null],
				[15, null], [16, null], [17, null], [18, null],
				[19, null], [20, [pdownEvent]], [21, null], [22, [pdownEvent]],
			]);
		});

		it("merges the original and given tick #3-2", (done: any) => {
			self.getTickList(3, 22, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					5,
					20,
					[
						[7, [joinEvent]],
						[9, [pdownEvent]]
					]
				]);
				done();
			});
			amflow.requestsGetTicks[0].respond(null, null);
		});

		it("bypasses calling the original", (done: any) => {
			self.getTickList(7, 20, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([
					7,
					20,
					[[7, [joinEvent]], [9, [pdownEvent]]]
				]);

				self.getTickList(5, 9, (err: Error, tickList?: pl.TickList) => {
					expect(err).toBe(null);
					expect(tickList).toEqual([
						5,
						9,
						[[7, [joinEvent]], [9, [pdownEvent]]]
					]);
					done();
				});
			});
		});

		it("merely calls the original when it does not have", (done: any) => {
			self.getTickList(21, 23, (err: Error, tickList?: pl.TickList) => {
				expect(err).toBe(null);
				expect(tickList).toEqual([21, 23, []]);
				done();
			});
			amflow.requestsGetTicks[0].respond(null, [
				[21, null, null],
				[22, null, null],
				[23, null, null]
			]);
		});
	});

	describe("#getStartPoint", function () {
		it("bypasses the original", function (done: any) {
			var amflow = new MockAmflow();
			var sp6 = { frame: 6, timestamp: 500, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 900, data: { content: "dataFor18" } };
			var self = new ReplayAmflowProxy({
				amflow: amflow,
				tickList: [5, 20],
				startPoints: [sp6, sp18]
			});

			self.getStartPoint({ frame: 10 }, (err: Error, startPoint: amf.StartPoint) => {
				expect(err).toBe(null);
				expect(startPoint).toEqual(sp6);
				done();
			});
		});

		it("compares the result with the original", function (done: any) {
			var amflow = new MockAmflow();
			var sp6 = { frame: 6, timestamp: 1000, data: { content: "dataFor6" } };
			var sp18 = { frame: 18, timestamp: 2000, data: { content: "dataFor18" } };
			var self = new ReplayAmflowProxy({
				amflow: amflow,
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
});
