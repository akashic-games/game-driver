import * as pl from "@akashic/playlog";
import * as pdi from "@akashic/akashic-pdi";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import EventPriority from "../../lib/EventPriority";
import { PointEventResolver } from "../../lib/PointEventResolver";

describe("PointEventResolver", function() {
	it("can be instantiated", function () {
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var resolver = new PointEventResolver({ game: game });
		expect(resolver._game).toBe(game);
	});

	it("makes PointDownEvent for pointDown()", function (done: () => void) {
		// このテストは simple_game のエンティティに依存している点に注意。
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var resolver = new PointEventResolver({ game: game });

		game.loadAndDo(function () {
			var e: pl.PointDownEvent;
			// (10, 20) の位置 (何もない)
			e = resolver.pointDown({
				type: pdi.PointType.Down,
				identifier: 0,
				offset: { x: 10, y: 20 }
			});
			expect(e.length).toBe(7);
			expect(e[0]).toBe(pl.EventCode.PointDown);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);    // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");         // 2: プレイヤーID
			expect(e[3]).toBe(0);                       // 3: ポインターID
			expect(e[4]).toBe(10);                      // 4: X座標
			expect(e[5]).toBe(20);                      // 5: Y座標
			expect(e[6]).toBe(null);                    // 6?: エンティティID

			// (110, 110) の位置 (50x50の赤いFilledRectが(100, 100)にある)
			e = resolver.pointDown({
				type: pdi.PointType.Down,
				identifier: 0,
				offset: { x: 110, y: 110 }
			});
			expect(e.length).toBe(7);
			expect(e[0]).toBe(pl.EventCode.PointDown);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);    // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");         // 2: プレイヤーID
			expect(e[3]).toBe(0);                       // 3: ポインターID
			expect(e[4]).toBe(10);                      // 4: X座標
			expect(e[5]).toBe(10);                      // 5: Y座標
			expect(e[6] > 0).toBe(true);                // 6?: エンティティID

			// (150, 150) の位置 (50x50の青いlocalのFilledRectが(130, 130)にある)
			e = resolver.pointDown({
				type: pdi.PointType.Down,
				identifier: 0,
				offset: { x: 150, y: 150 }
			});
			expect(e.length).toBe(8);
			expect(e[0]).toBe(pl.EventCode.PointDown);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);    // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");         // 2: プレイヤーID
			expect(e[3]).toBe(0);                       // 3: ポインターID
			expect(e[4]).toBe(20);                      // 4: X座標
			expect(e[5]).toBe(20);                      // 5: Y座標
			expect(e[6] < 0).toBe(true);                // 6?: エンティティID
			expect(e[7]).toBe(true);                    // 7?: ローカル
			done();
		});
	});

	it("makes Point(Move|Up)Event for pointDown()/pointUp()", function (done: () => void) {
		// このテストは simple_game のエンティティに依存している点に注意。
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var resolver = new PointEventResolver({ game: game });

		game.loadAndDo(function () {
			var e: any;
			// (10, 20) の位置 (何もない)
			resolver.pointDown({ type: pdi.PointType.Down, identifier: 0, offset: { x: 10, y: 20 } });
			e = resolver.pointMove({ type: pdi.PointType.Move, identifier: 0, offset: { x: 20, y: 25 } });
			expect(e.length).toBe(11);
			expect(e[0]).toBe(pl.EventCode.PointMove);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);    // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");         // 2: プレイヤーID
			expect(e[3]).toBe(0);                       // 3: ポインターID
			expect(e[4]).toBe(10);                      // 4: X座標
			expect(e[5]).toBe(20);                      // 5: Y座標
			expect(e[6]).toBe(10);                      // 6: ポイントダウンイベントからのX座標の差
			expect(e[7]).toBe(5);                       // 7: ポイントダウンイベントからのY座標の差
			expect(e[8]).toBe(10);                      // 8: 直前のポイントムーブイベントからのX座標の差
			expect(e[9]).toBe(5);                       // 9: 直前のポイントムーブイベントからのY座標の差
			expect(e[10]).toBe(null);                   // 10?: エンティティID
			e = resolver.pointUp({ type: pdi.PointType.Up, identifier: 0, offset: { x: 22, y: 23 } });
			expect(e.length).toBe(11);
			expect(e[0]).toBe(pl.EventCode.PointUp);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);  // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");       // 2: プレイヤーID
			expect(e[3]).toBe(0);                     // 3: ポインターID
			expect(e[4]).toBe(10);                    // 4: X座標
			expect(e[5]).toBe(20);                    // 5: Y座標
			expect(e[6]).toBe(12);                    // 6: ポイントダウンイベントからのX座標の差
			expect(e[7]).toBe(3);                     // 7: ポイントダウンイベントからのY座標の差
			expect(e[8]).toBe(2);                     // 8: 直前のポイントムーブイベントからのX座標の差
			expect(e[9]).toBe(-2);                    // 9: 直前のポイントムーブイベントからのY座標の差
			expect(e[10]).toBe(null);                 // 10?: エンティティID

			// (110, 110) の位置 (50x50の赤いFilledRectが(100, 100)にある)
			resolver.pointDown({ type: pdi.PointType.Down, identifier: 0, offset: { x: 110, y: 110 } });
			e = resolver.pointMove({ type: pdi.PointType.Move, identifier: 0, offset: { x: 130, y: 115 } });
			expect(e.length).toBe(11);
			expect(e[0]).toBe(pl.EventCode.PointMove);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);    // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");         // 2: プレイヤーID
			expect(e[3]).toBe(0);                       // 3: ポインターID
			expect(e[4]).toBe(10);                      // 4: X座標
			expect(e[5]).toBe(10);                      // 5: Y座標
			expect(e[6]).toBe(20);                      // 6: ポイントダウンイベントからのX座標の差
			expect(e[7]).toBe(5);                       // 7: ポイントダウンイベントからのY座標の差
			expect(e[8]).toBe(20);                      // 8: 直前のポイントムーブイベントからのX座標の差
			expect(e[9]).toBe(5);                       // 9: 直前のポイントムーブイベントからのY座標の差
			expect(e[10] > 0).toBe(true);               // 10?: エンティティID
			e = resolver.pointUp({ type: pdi.PointType.Up, identifier: 0, offset: { x: 127, y: 100 } });
			expect(e.length).toBe(11);
			expect(e[0]).toBe(pl.EventCode.PointUp);  // 0: イベントコード
			expect(e[1]).toBe(EventPriority.Joined);  // 1: 優先度
			expect(e[2]).toBe("dummyPlayerId");       // 2: プレイヤーID
			expect(e[3]).toBe(0);                     // 3: ポインターID
			expect(e[4]).toBe(10);                    // 4: X座標
			expect(e[5]).toBe(10);                    // 5: Y座標
			expect(e[6]).toBe(17);                    // 6: ポイントダウンイベントからのX座標の差
			expect(e[7]).toBe(-10);                   // 7: ポイントダウンイベントからのY座標の差
			expect(e[8]).toBe(-3);                    // 8: 直前のポイントムーブイベントからのX座標の差
			expect(e[9]).toBe(-15);                   // 9: 直前のポイントムーブイベントからのY座標の差
			expect(e[10] > 0).toBe(true);             // 10?: エンティティID
			done();
		});
	});

	it("ignores 'move'/'up' not following to 'down'", function (done: () => void) {
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var resolver = new PointEventResolver({ game: game });

		game.loadAndDo(function () {
			resolver.pointDown({
				type: pdi.PointType.Down,
				identifier: 0,
				offset: { x: 10, y: 20 }
			});

			expect(resolver.pointMove({
				type: pdi.PointType.Move,
				identifier: 1,   // pointDown() の identifier と異なる値
				offset: { x: 0, y: 0 }
			})).toBe(null);

			expect(resolver.pointUp({
				type: pdi.PointType.Up,
				identifier: 1,   // pointDown() の identifier と異なる値
				offset: { x: 0, y: 0 }
			})).toBe(null);
			done();
		});
	});
});
