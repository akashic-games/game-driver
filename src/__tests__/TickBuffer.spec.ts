import * as pl from "@akashic/playlog";
import ExecutionMode from "../ExecutionMode";
import { TickBuffer } from "../TickBuffer";
import { MockAmflow } from "./helpers/MockAmflow";

describe("TickBuffer", function() {
	const pd0: pl.PointDownEvent = [
		pl.EventCode.PointDown, // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		0,                      // 3: ポインターID
		10,                     // 4: X座標
		100                     // 5: Y座標
		// 6?: エンティティID
	];
	const msg0: pl.MessageEvent = [
		pl.EventCode.Message,   // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		42                      // 3: 汎用的なデータ
	];
	const timestamp0: pl.TimestampEvent = [
		pl.EventCode.Timestamp, // 0: EventCode
		0,                      // 1: プライオリティ
		"dummyPlayerId",        // 2: プレイヤーID
		788                     // 3: タイムスタンプ
	];

	it("can be instantiated", function() {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		expect(tb._amflow).toBe(amflow);
		expect(tb.knownLatestAge).toBe(-1);
		expect(tb._receiving).toBe(false);
		expect(tb._tickRanges.length).toBe(0);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);
	});

	it("drops ticks when changing ExecutionMode", function() {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		let gotNextTickCount = 0;
		function gotNextTick(): void {
			++gotNextTickCount;
		}
		tb.gotNextTickTrigger.add(gotNextTick, null);

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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb._onTicks(null, [ 3, 20, [[4, [pd0]], [10, [msg0]]] ]);
		expect(tb.currentAge).toBe(0);
		expect(tb._nearestAbsentAge).toBe(0);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 21, ticks: [[4, [pd0]], [10, [msg0]]] }
		]);

		// age 7 に飛ぶと age 4 が ticks から消える
		tb.setCurrentAge(7);
		expect(tb.currentAge).toBe(7);
		expect(tb.knownLatestAge).toBe(20);
		expect(tb._nearestAbsentAge).toBe(21);
		expect(tb._tickRanges).toEqual([
			{ start: 7, end: 21, ticks: [[10, [msg0]]] }
		]);

		// 何もないところまで飛ぶと全部消える
		tb.setCurrentAge(100);
		expect(tb.currentAge).toBe(100);
		expect(tb.knownLatestAge).toBe(99);
		expect(tb._nearestAbsentAge).toBe(100);
		expect(tb._tickRanges).toEqual([]);
		tb._onTicks(null, [ 100, 100 ]);
		expect(tb.currentAge).toBe(100);
		expect(tb.knownLatestAge).toBe(100);
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
		expect(tb.knownLatestAge).toBe(100);
		expect(tb._nearestAbsentAge).toBe(101);
		expect(tb._tickRanges).toEqual([
			{ start: 3, end: 21, ticks: [[4, [pd0]], [10, [msg0]]] },
			{ start: 45, end: 61, ticks: [[49, [pd0]], [51, [msg0, pd0]], [52, [msg0]]] }
		]);

		// currentAgeを2まで戻すと足したtickを消化できる
		tb.setCurrentAge(2);
		expect(tb.currentAge).toBe(2);
		expect(tb.knownLatestAge).toBe(100); // 上がった knownLatestAge は下がらない
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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb.start();
		expect(tb._receiving).toBe(true);

		const onTick = amflow.tickHandlers[0];
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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});
		expect(tb._prefetchThreshold).toBe(3);
		expect(tb._sizeRequestOnce).toBe(2);

		let gotNextTickCount = 0;
		function gotNextTick(): void {
			++gotNextTickCount;
		}
		tb.gotNextTickTrigger.add(gotNextTick, null);

		tb.start();
		expect(tb._receiving).toBe(true);
		const onTick = amflow.tickHandlers[0];
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
		amflow.requestsGetTicks[0].respond(null, []);

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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({ amflow: amflow, executionMode: ExecutionMode.Passive });

		tb._onTicks(null, [ 10, 25 ]);
		tb._onTicks(null, [ 52, 55 ]);
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
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		let read = tb.readNextTickTime();
		expect(read).toBe(null);  // tickがないときはnull

		tb._onTicks(null, [ 0, 5, [[1, [timestamp0]], [2, null, []]] ]);
		expect(tb.currentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);

		read = tb.readNextTickTime();
		expect(read).toBe(null);  // age 0 にtimestampがないのでnull
		expect(tb.currentAge).toBe(0);
		expect(tb._nextTickTimeCache).toBe(null);  // キャッシュもなし

		let tick = tb.consume();
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

	it("has workaround for old (relative) timestamps", function () {
		const startedAt = +(new Date(2000, 0, 1));
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2,
			startedAt: startedAt
		});

		const absTimestamp: pl.TimestampEvent = [
			pl.EventCode.Timestamp, // 0: EventCode
			0,                      // 1: プライオリティ
			"dummyPlayerId",        // 2: プレイヤーID
			startedAt + 1000        // 3: タイムスタンプ
		];

		const tick0: pl.Tick = [0, [absTimestamp]];
		const tick2: pl.Tick = [2, [timestamp0]];
		tb.addTick(tick0);
		tb.addTick([1]);
		tb.addTick(tick2);

		expect(tb.readNextTickTime()).toBe(absTimestamp[pl.TimestampEventIndex.Timestamp]);
		expect(tb.readNextTickTime()).toBe(absTimestamp[pl.TimestampEventIndex.Timestamp]);
		let t = tb.consume();
		expect(t).toEqual(tick0);

		expect(tb.readNextTickTime()).toBe(null);
		t = tb.consume();
		expect(t).toBe(1);

		// 相対が絶対に補正されている
		expect(tb.readNextTickTime()).toBe(timestamp0[pl.TimestampEventIndex.Timestamp] + startedAt);
		t = tb.consume();
		expect(t).toEqual(tick2);
	});

	// TODO: TickBuffer#requestNonIgnorableTicks(), requestAllTicks() の暫定対応と合わせて削除する
	it("uses the old getTickList() on specific environment", function () {
		/**
		 * プロパティを一時的に差し替えるユーティリティ。
		 *
		 * obj[prop] を value に差し替えて fun() を呼ぶ。
		 * 呼び出しが終わった時、 obj[prop] を復元する。
		 */
		function override(obj: any, prop: string, value: any, fun: () => void): void {
			const has = obj.hasOwnProperty(prop);
			const orig = obj[prop];
			try {
				obj[prop] = value;
				fun();
			} finally {
				if (has)
					obj[prop] = orig;
				else
					delete obj[prop];
			}
		}

		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});
		const spyOnGetTickList = jest.spyOn(amflow, "getTickList");

		const dummyFun = (): void => {
			// do nothing
		};
		override(global, "window", { confirm: dummyFun, prompt: dummyFun }, () => {
			tb.requestTicks(1, 2);
			amflow.requestsGetTicks[0].respond(null, []);
			expect(spyOnGetTickList.mock.calls[0][0]).toBe(1);
			expect(spyOnGetTickList.mock.calls[0][1]).toBe(1 + 2);

			tb.startSkipping();
			tb.requestTicks(3, 4);
			tb.endSkipping();
			amflow.requestsGetTicks[0].respond(null, []);
			expect(spyOnGetTickList.mock.calls[1][0]).toBe(3);
			expect(spyOnGetTickList.mock.calls[1][1]).toBe(3 + 4);
		});

		tb.requestTicks(5, 6);
		amflow.requestsGetTicks[0].respond(null, []);
		expect(spyOnGetTickList.mock.calls[2][0]).toEqual({
			begin: 5,
			end: 5 + 6
		});

		tb.startSkipping();
		tb.requestTicks(7, 8);
		amflow.requestsGetTicks[0].respond(null, []);
		tb.endSkipping();
		expect(spyOnGetTickList.mock.calls[3][0]).toEqual({
			begin: 7,
			end: 7+ 8,
			excludeEventFlags: { ignorable: true }
		});
	});

	it("notifies when got no tick", function () {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		let noTickCount = 0;
		tb.gotNoTickTrigger.add(() => {
			++noTickCount;
		});

		tb.requestTicks(0, 3);
		amflow.requestsGetTicks[0].respond(null, [[0], [1], [2]]);
		expect(noTickCount).toBe(0);

		tb.requestTicks(3, 3);
		amflow.requestsGetTicks[0].respond(null, []);
		expect(noTickCount).toBe(1);

		tb.requestTicks(3, 3);
		amflow.requestsGetTicks[0].respond(null, [[3, [[pl.EventCode.Message, null!, "dummy", {}]]]]);
		expect(noTickCount).toBe(1);

		tb.requestTicks(4, 3);
		amflow.requestsGetTicks[0].respond(null, [[4], [5]]);
		expect(noTickCount).toBe(1);

		tb.requestTicks(6, 3);
		amflow.requestsGetTicks[0].respond(null, []);
		expect(noTickCount).toBe(2);

		// このケースは通常ない (取得済みの範囲を再要求することはない) が、カバレッジを上げておく
		tb.requestTicks(4, 3);
		amflow.requestsGetTicks[0].respond(null, [[4], [5]]);
		expect(noTickCount).toBe(3);
	});

	it("can calculate duration to consume the latest tick - no events", function () {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		const frameTime = 1000 / 60;
		expect(tb._calcKnownLatestTickTimeDelta(1, 0, frameTime)).toBe(0);

		tb.requestTicks(0, 3);
		amflow.requestsGetTicks[0].respond(null, [[0], [1], [2]]);
		expect(tb._calcKnownLatestTickTimeDelta(2 * frameTime, 0, frameTime)).toBeCloseTo(2 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(3 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(4 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(5 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);

		tb.requestTicks(4, 1);
		amflow.requestsGetTicks[0].respond(null, [[4]]);
		// age 3 がない (間隙がある) があるので Infinity
		expect(tb._calcKnownLatestTickTimeDelta(3 * frameTime, 0, frameTime)).toBeCloseTo(Infinity);

		tb.requestTicks(3, 3);
		amflow.requestsGetTicks[0].respond(null, [[3], [4], [5]]);
		expect(tb._calcKnownLatestTickTimeDelta(5 * frameTime, 0, frameTime)).toBeCloseTo(5 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(6 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(7 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(8 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
	});

	it("can calculate duration to consume the latest tick - no timestamp", function () {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		const frameTime = 1000 / 30;
		const nonTimestampEvent = [pl.EventCode.Message, 0, "dummy", {}] as pl.Event;

		tb.requestTicks(0, 3);
		amflow.requestsGetTicks[0].respond(null, [[0], [1, [nonTimestampEvent]], [2]]);
		expect(tb._calcKnownLatestTickTimeDelta(2 * frameTime, 0, frameTime)).toBeCloseTo(2 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(3 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(4 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(5 * frameTime, 0, frameTime)).toBeCloseTo(3 * frameTime, 3);

		tb.requestTicks(3, 3);
		amflow.requestsGetTicks[0].respond(null, [[3], [4], [5]]);
		// eslint-disable-next-line max-len
		expect(tb._calcKnownLatestTickTimeDelta(4 * frameTime, 0, frameTime)).toBeCloseTo(4 * frameTime, 3); // 途中 (age 1) でtimeThresholdを超えるケース
		expect(tb._calcKnownLatestTickTimeDelta(5 * frameTime, 0, frameTime)).toBeCloseTo(5 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(6 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(7 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(8 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);

		tb.requestTicks(6, 3);
		amflow.requestsGetTicks[0].respond(null, [[6, [nonTimestampEvent]], [7], [8]]);
		expect(tb._calcKnownLatestTickTimeDelta(7 * frameTime, 0, frameTime)).toBeCloseTo(7 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(8 * frameTime, 0, frameTime)).toBeCloseTo(8 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(9 * frameTime, 0, frameTime)).toBeCloseTo(9 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(10 * frameTime, 0, frameTime)).toBeCloseTo(9 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(11 * frameTime, 0, frameTime)).toBeCloseTo(9 * frameTime, 3);

		expect(tb.consume()).toBe(0); // イベントがある age 1 が先頭になるケースを確認するためにage 0を消化
		expect(tb._calcKnownLatestTickTimeDelta(2 * frameTime, 0, frameTime)).toBeCloseTo(2 * frameTime, 3); // 途中 (age 6) で超えるケース
		expect(tb._calcKnownLatestTickTimeDelta(6 * frameTime, 0, frameTime)).toBeCloseTo(6 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(7 * frameTime, 0, frameTime)).toBeCloseTo(7 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(8 * frameTime, 0, frameTime)).toBeCloseTo(8 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(9 * frameTime, 0, frameTime)).toBeCloseTo(8 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(10 * frameTime, 0, frameTime)).toBeCloseTo(8 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(11 * frameTime, 0, frameTime)).toBeCloseTo(8 * frameTime, 3);
	});

	it("can calculate duration to consume the latest tick - with timestamp", function () {
		const amflow = new MockAmflow();
		const tb = new TickBuffer({
			amflow: amflow,
			executionMode: ExecutionMode.Passive,
			prefetchThreshold: 3,
			sizeRequestOnce: 2
		});

		const frameTime = 1000 / 60;
		const nonTimestampEvent = [pl.EventCode.Message, 0, "dummy", {}] as pl.Event;

		const baseTime = Date.parse("2022-04-01T08:00:00.000");
		function makeTimestampEvent(t: number): pl.Event {
			return [pl.EventCode.Timestamp, 0, "dummy", baseTime + t];
		}

		tb.requestTicks(0, 3);
		amflow.requestsGetTicks[0].respond(null, [[0], [1, [nonTimestampEvent, makeTimestampEvent(500)]], [2]]);
		expect(tb._calcKnownLatestTickTimeDelta(500, baseTime, frameTime)).toBeCloseTo(500, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 1 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 1 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 2 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 2 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 3 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 2 * frameTime, 3);

		let accessCount = 0;
		const trap = [pl.EventCode.Message, 0, "dummy", {}] as pl.Event;
		Object.defineProperty(trap, 0, {
			get: () => {
				++accessCount;
				return pl.EventCode.Message;
			}
		});

		tb.requestTicks(3, 3);
		amflow.requestsGetTicks[0].respond(null, [[3], [4, null, []], [5, [trap]]]);
		expect(accessCount).toBe(0);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 3 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 3 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 4 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 4 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 5 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 5 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(500 + 6 * frameTime, baseTime, frameTime)).toBeCloseTo(500 + 5 * frameTime, 3);
		expect(accessCount).toBe(4);

		tb.requestTicks(6, 3);
		amflow.requestsGetTicks[0].respond(null, [[6], [7, [trap]], [8, [makeTimestampEvent(1000)]]]);
		expect(tb._calcKnownLatestTickTimeDelta(1000 + 0 * frameTime, baseTime, frameTime)).toBeCloseTo(1000 + 0 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(1000 + 1 * frameTime, baseTime, frameTime)).toBeCloseTo(1000 + 1 * frameTime, 3);
		expect(tb._calcKnownLatestTickTimeDelta(1000 + 2 * frameTime, baseTime, frameTime)).toBeCloseTo(1000 + 1 * frameTime, 3);
		expect(accessCount).toBe(4); // 後続 tick に timestamp がある場合、それ以前のイベントが参照されることはない
	});
});
