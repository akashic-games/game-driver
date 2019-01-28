import * as pl from "@akashic/playlog";
import { TickBuffer } from "../../lib/TickBuffer";
import ExecutionMode from "../../lib/ExecutionMode";
import { MockAmflow } from "../helpers/lib/MockAmflow";

describe("TickBuffer", function() {
	var pd0: pl.PointDownEvent = [
		pl.EventCode.PointDown, // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		0,                      // 3: ポインターID
		10,                     // 4: X座標
		100                     // 5: Y座標
														// 6?: エンティティID
	];
	var msg0: pl.MessageEvent = [
		pl.EventCode.Message,   // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		42                      // 3: 汎用的なデータ
	];
	var timestamp0: pl.TimestampEvent = [
		pl.EventCode.Timestamp, // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		788                     // 3: タイムスタンプ
	];

	it("can be instantiated", function() {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		expect(tb._amflow).toBe(amflow);
		expect(tb.knownLatestAge).toBe(-1);
		expect(tb._receiving).toBe(false);
		expect(tb._tickRanges.length).toBe(0);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);
	});

	it("drops ticks when changing ExecutionMode", function() {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb.addTick([0]);
		tb.addTick([2]);
		expect(tb.consume()).toBe(0);
		expect(tb.currentAge).toBe(1);

		tb.setExecutionMode(ExecutionMode.Active);
		expect(tb.currentAge).toBe(1);
		expect(tb._nearestAbsentAge).toBe(1);
		expect(tb._tickRanges).toEqual([]);
	});

	it("manages _tickRanges for addTick()", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		var gotNextTickCount = 0;
		function gotNextTick() {
			++gotNextTickCount;
		}
		tb.gotNextTickTrigger.handle(null, gotNextTick);

		// とりあえず第0tick追加
		expect(tb._nearestAbsentAge).toBe(0);
		expect(tb._tickRanges).toEqual([]);
		tb.addTick([0]);
		expect(gotNextTickCount).toBe(1);
		expect(tb._nearestAbsentAge).toBe(1);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 1, ticks: [] }
		]);

		// 既知tickと離れた未来のtickを追加
		tb.addTick([4]);
		expect(tb._nearestAbsentAge).toBe(1);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 1, ticks: [] },
			{ start: 4, end: 5, ticks: [] }
		]);

		// 最新でない既知tickに続くtickを追加
		tb.addTick([1]);
		tb.addTick([2]);
		expect(tb._nearestAbsentAge).toBe(3);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 3, ticks: [] },
			{ start: 4, end: 5, ticks: [] }
		]);

		// consume() して _tickRanges の変化を確認
		expect(tb.consume()).toBe(0);
		expect(tb.consume()).toBe(1);
		expect(tb.currentAge).toBe(2);
		expect(tb._tickRanges).toEqual([
			{ start: 2, end: 3, ticks: [] },
			{ start: 4, end: 5, ticks: [] }
		]);
		expect(tb.consume()).toBe(2);
		expect(tb._tickRanges).toEqual([
			{ start: 4, end: 5, ticks: [] }
		]);
		expect(tb.consume()).toBe(null);
		expect(tb.currentAge).toBe(3);
		expect(tb._nearestAbsentAge).toBe(3);
		expect(tb._tickRanges).toEqual([
			{ start: 4, end: 5, ticks: [] }
		]);

		// 既知tickの前につながるtick (age 3) を追加
		tb.addTick([3]);
		expect(gotNextTickCount).toBe(2);
		tb.addTick([6]);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 4, ticks: [] },
			{ start: 4, end: 5, ticks: [] },
			{ start: 6, end: 7, ticks: [] }
		]);

		// 既知tickにちょうど挟まるtickを追加
		tb.addTick([5]);
		expect(gotNextTickCount).toBe(2);
		expect(tb.currentAge).toBe(3);
		expect(tb._nearestAbsentAge).toBe(7);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 4, ticks: [] },
			{ start: 4, end: 6, ticks: [] },
			{ start: 6, end: 7, ticks: [] }
		]);
		expect(tb.consume()).toBe(3);
		expect(tb.currentAge).toBe(4);
		expect(tb._nearestAbsentAge).toBe(7);
		expect(tb._tickRanges).toEqual([
			{ start: 4, end: 6, ticks: [] },
			{ start: 6, end: 7, ticks: [] }
		]);

		// 既存と重複するageの、異なるtickを追加 (無視される)
		tb.addTick([6, [pd0]]);
		expect(tb._tickRanges).toEqual([
			{ start: 4, end: 6, ticks: [] },
			{ start: 6, end: 7, ticks: [] }
		]);
		expect(tb.consume()).toBe(4);
		expect(tb.consume()).toBe(5);
		expect(tb.consume()).toBe(6);
		expect(tb.consume()).toBe(null);
		expect(tb._tickRanges).toEqual([]);

		// currentAgeより前のageのtickを追加 (consume()で消化する時に捨てられる)
		tb.addTick([2, [pd0]]);
		expect(tb._tickRanges).toEqual([
			{ start: 2, end: 3, ticks: [[2, [pd0]]] }
		]);
		expect(tb.currentAge).toBe(7);
		expect(tb._nearestAbsentAge).toBe(7);
		expect(tb.consume()).toBe(null);
		expect(tb._tickRanges).toEqual([
			{ start: 2, end: 3, ticks: [[2, [pd0]]] }
		]);
		tb.addTick([7]);
		expect(tb._tickRanges).toEqual([
			{ start: 2, end: 3, ticks: [[2, [pd0]]] },
			{ start: 7, end: 8, ticks: [] }
		]);
		expect(tb.consume()).toBe(7);
		expect(tb._tickRanges).toEqual([]);
	});

	it("manages _tickRanges for _onTicks()", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		var gotNextTickCount = 0;
		function gotNextTick() {
			++gotNextTickCount;
		}
		tb.gotNextTickTrigger.handle(null, gotNextTick);

		tb._onTicks(null, [ 3, 20, [[4, [pd0]], [10, [msg0]]] ]);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(0);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 21, ticks: [[4, [pd0]], [10, [msg0]]] }
		]);

		// age 7 に飛ぶと age 4 が ticks から消える
		tb.setCurrentAge(7);
		expect(tb.currentAge).toBe(7);
		expect(tb._nearestAbsentAge).toBe(21);
		expect(tb._tickRanges).toEqual([
			{ start: 7, end: 21, ticks: [[10, [msg0]]] }
		]);

		// 何もないところまで飛ぶと全部消える
		tb.setCurrentAge(100);
		expect(tb.currentAge).toBe(100);
		expect(tb._nearestAbsentAge).toBe(100);
		expect(tb._tickRanges).toEqual([]);
		tb._onTicks(null, [ 100, 100, null ]);
		expect(tb.currentAge).toBe(100);
		expect(tb._nearestAbsentAge).toBe(101);
		expect(tb._tickRanges).toEqual([
			{ start: 100, end: 101, ticks: [] }
		]);
		expect(tb.consume()).toBe(100);
		expect(tb._tickRanges).toEqual([]);

		// currentAgeより前も足せる。
		tb._onTicks(null, [
			3, 20, [[4, [pd0]], [10, [msg0]]]
		]);
		tb._onTicks(null, [
			45, 60, [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]]
		]);
		expect(tb.currentAge).toBe(101);
		expect(tb._nearestAbsentAge).toBe(101);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 21, ticks: [[4, [pd0]], [10, [msg0]]] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// currentAgeを2まで戻すと足したtickを消化できる
		tb.setCurrentAge(2);
		expect(tb.currentAge).toBe(2);
		expect(tb._nearestAbsentAge).toBe(2);
		tb.setCurrentAge(19);
		expect(tb.currentAge).toBe(19);
		expect(tb._nearestAbsentAge).toBe(21);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeに包含されるrange
		tb._onTicks(null, [ 52, 55, [[54, [pd0]]] ]);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeの後ろに接するrange
		tb._onTicks(null, [ 21, 24, [[21, [msg0]]] ]);
		expect(tb.currentAge).toBe(19);
		expect(tb._nearestAbsentAge).toBe(25);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 21, end: 25, ticks: [[21, [msg0]]] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeの前に接するrange
		tb._onTicks(null, [ 42, 45, [] ]);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 21, end: 25, ticks: [[21, [msg0]]] },
			{ start: 42, end: 45, ticks: [] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeの後ろに重複するrange
		tb._onTicks(null, [ 23, 28, [[27, [pd0]]] ]);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 21, end: 25, ticks: [[21, [msg0]]] },
			{ start: 25, end: 29, ticks: [[27, [pd0]]] },
			{ start: 42, end: 45, ticks: [] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeの前に重複するrange
		tb._onTicks(null, [ 41, 44, [[41, [pd0]]] ]);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 21, end: 25, ticks: [[21, [msg0]]] },
			{ start: 25, end: 29, ticks: [[27, [pd0]]] },
			{ start: 41, end: 42, ticks: [[41, [pd0]]] },
			{ start: 42, end: 45, ticks: [] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// 既存rangeを包含するrange
		tb._onTicks(null, [ 23, 48, [[27, [pd0]], [41, [pd0]]]]);
		expect(tb.currentAge).toBe(19);
		expect(tb._nearestAbsentAge).toBe(61);
		expect(tb._tickRanges).toEqual([
			{ start: 19, end: 21, ticks: [] },
			{ start: 21, end: 25, ticks: [[21, [msg0]]] },
			{ start: 25, end: 45, ticks: [[27, [pd0]], [41, [pd0]]] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);
	});

	it("can subscribe ticks", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb.start();
		expect(tb._receiving).toBe(true);

		var onTick = amflow.tickHandlers[0];
		expect(onTick).toBe(tb._addTick_bound);

		onTick([0]);
		expect(tb.knownLatestAge).toBe(0);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(1);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 1, ticks: [] }
		]);
		onTick([1]);
		onTick([2, [pd0]]);
		onTick([3]);
		onTick([4, [pd0]]);
		expect(tb.knownLatestAge).toBe(4);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(5);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 5, ticks: [ [2, [pd0]], [4, [pd0]] ] }
		]);
		onTick([2]);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 5, ticks: [ [2, [pd0]], [4, [pd0]] ] }
		]);

		onTick([100, [pd0]]);
		onTick([101]);
		onTick([104]);
		expect(tb.knownLatestAge).toBe(104);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(5);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 5, ticks: [ [2, [pd0]], [4, [pd0]] ] },
			{ start: 100, end: 102, ticks: [[100, [pd0]]] },
			{ start: 104, end: 105, ticks: [] }
		]);
		onTick([101]);
		onTick([102]);
		onTick([103]);
		onTick([104]);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 5, ticks: [ [2, [pd0]], [4, [pd0]] ] },
			{ start: 100, end: 104, ticks: [[100, [pd0]]] },
			{ start: 104, end: 105, ticks: [] }
		]);

		tb.stop();
		expect(tb._receiving).toBe(false);
	});

	it("provides accumulated ticks", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});
		expect(tb._prefetchThreshold).toBe(3);
		expect(tb._sizeRequestOnce).toBe(2);

		var gotNextTickCount = 0;
		function gotNextTick() {
			++gotNextTickCount;
		}
		tb.gotNextTickTrigger.handle(null, gotNextTick);

		tb.start();
		expect(tb._receiving).toBe(true);
		var onTick = amflow.tickHandlers[0];
		expect(onTick).toBe(tb._addTick_bound);

		onTick([0]);
		expect(gotNextTickCount).toBe(1);
		onTick([1]);
		onTick([2]);
		onTick([3]);
		onTick([4]);
		expect(tb._tickRanges).toEqual([
			{ start: 0, end: 5, ticks: [] }
		]);

		expect(amflow.requestsGetTicks.length).toBe(0);
		expect(tb._nearestAbsentAge).toBe(5);
		expect(tb.consume()).toBe(0);
		expect(tb.consume()).toBe(1);
		expect(tb.consume()).toBe(2);
		expect(tb.currentAge).toBe(3);
		expect(amflow.requestsGetTicks.length).toBe(1);
		expect(amflow.requestsGetTicks[0].from).toBe(5);
		expect(amflow.requestsGetTicks[0].to).toBe(5 + 2);
		expect(tb.consume()).toBe(3);
		expect(tb.consume()).toBe(4);
		expect(tb.currentAge).toBe(5);
		expect(tb._nearestAbsentAge).toBe(5);
		expect(tb.consume()).toBe(null);
		expect(tb.consume()).toBe(null);

		amflow.requestsGetTicks[0].respond(null, [
			[5, [pd0]],
			[6]
		]);
		expect(tb.currentAge).toBe(5);
		expect(tb._nearestAbsentAge).toBe(7);
		expect(gotNextTickCount).toBe(2);

		expect(tb.consume()).toEqual([5, [pd0]]);
		expect(tb.consume()).toBe(6);
		expect(tb.consume()).toBe(null);
		expect(tb.currentAge).toBe(7);
		expect(tb._nearestAbsentAge).toBe(7);

		// ついでに長さ0のエッジケースも通過のみテスト
		tb.requestTicks(tb.currentAge, 0);
		amflow.requestsGetTicks[0].respond(null, null);

		tb.requestTicks();
		expect(amflow.requestsGetTicks.length).toBe(1);
		expect(amflow.requestsGetTicks[0].from).toBe(7);
		expect(amflow.requestsGetTicks[0].to).toBe(7 + 2);
		amflow.requestsGetTicks[0].respond(null, [
			[7],
			[8]
		]);
		expect(tb._nearestAbsentAge).toBe(9);
		expect(gotNextTickCount).toBe(3);

		tb.stop();
		expect(tb._receiving).toBe(false);
	});

	it("drops ticks until the current", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb._onTicks(null, [ 10, 25, null ]);
		tb._onTicks(null, [ 52, 55, null ]);
		expect(tb._tickRanges).toEqual([
			{ start: 10, end: 26, ticks: [] },
			{ start: 52, end: 56, ticks: [] }
		]);
		tb.setCurrentAge(53);
		expect(tb._tickRanges).toEqual([
			{ start: 53, end: 56, ticks: [] }
		]);

		tb._onTicks(null, [ 54, 70, [[56, [pd0]]] ]);
		expect(tb._tickRanges).toEqual([
			{ start: 53, end: 56, ticks: [] },
			{ start: 56, end: 71, ticks: [[56, [pd0]]] }
		]);

		// edge case: TickRangeの切れ目までdrop
		tb.setCurrentAge(56);
		expect(tb._tickRanges).toEqual([
			{ start: 56, end: 71, ticks: [[56, [pd0]]] }
		]);
	});

	it("can peek the next tick time", function () {
		var amflow = new MockAmflow();
		var tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		var read = tb.readNextTickTime();
		expect(read).toBe(null);  // tickがないときはnull

		tb._onTicks(null, [ 0, 5, [[1, [timestamp0]], [2, null, []]] ]);
		expect(tb.currentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);

		read = tb.readNextTickTime();
		expect(read).toBe(null);  // age 0 にtimestampがないのでnull
		expect(tb.currentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);  // キャッシュもなし

		var tick = tb.consume();
		expect(tick).toBe(0);
		expect(tb.currentAge).toBe(1);
		expect(tb._nextTickTimeCache).toBe(null);  // age 1 にはtimestampがあるがまだキャッシュされていない

		read = tb.readNextTickTime();
		expect(read).toBe(timestamp0[pl.TimestampEventIndex.Timestamp]);
		expect(tb.currentAge).toBe(1);  // read してもcurrentAgeは変わらない
		expect(tb._nextTickTimeCache).toBe(read);  // キャッシュはされている

		tb.setCurrentAge(1);
		expect(tb.currentAge).toBe(1);
		expect(tb._nextTickTimeCache).toBe(null);  // currentAgeを変えなくてもsetするとキャッシュは飛ぶ

		read = tb.readNextTickTime();
		expect(read).toBe(timestamp0[pl.TimestampEventIndex.Timestamp]); // キャッシュから取得できる
		tick = tb.consume();
		expect(tb._nextTickTimeCache).toBe(null);  // consume()するとキャッシュをリセット
		expect(tick).toEqual([1, [timestamp0]]);

		read = tb.readNextTickTime();
		expect(read).toBe(null);
		expect(tb._nextTickTimeCache).toBe(null);
	});
});

