"use strict";
import g = require("@akashic/akashic-engine");
import pl = require("@akashic/playlog");
import * as EventIndex from "./EventIndex";
import { Game } from "./Game";

export interface EventConverterParameterObejct {
	game: Game;
}

export class EventConverter {
	_game: Game;
	_playerTable: { [key: string]: g.Player };

	constructor(param: EventConverterParameterObejct) {
		this._game = param.game;
		this._playerTable = {};
	}

	/**
	 * playlog.Eventからg.Eventへ変換する。
	 */
	toGameEvent(pev: pl.Event): g.Event {
		var pointerId: number;
		var entityId: number;
		var target: g.E;
		var point: g.CommonOffset;
		var startDelta: g.CommonOffset;
		var prevDelta: g.CommonOffset;
		var local: boolean;
		var timestamp: number;

		var eventCode = pev[EventIndex.General.Code];
		var prio = pev[EventIndex.General.Priority];
		var playerId = pev[EventIndex.General.PlayerId];
		var player = this._playerTable[playerId] || { id: playerId };
		switch (eventCode) {
		case pl.EventCode.Join:
			player = {
				id: playerId,
				name: pev[EventIndex.Join.PlayerName]
			};
			this._playerTable[playerId] = player;

			var store: g.StorageValueStore = undefined;
			if (pev[EventIndex.Join.StorageData]) {
				var keys: g.StorageReadKey[] = [];
				var values: g.StorageValue[][] = [];
				pev[EventIndex.Join.StorageData].map((data: pl.StorageData) => {
					keys.push(data.readKey);
					values.push(data.values);
				});
				store = new g.StorageValueStore(keys, values);
			}
			return new g.JoinEvent(player, store, prio);

		case pl.EventCode.Leave:
			delete this._playerTable[player.id];
			return new g.LeaveEvent(player, prio);

		case pl.EventCode.Timestamp:
			timestamp = pev[EventIndex.Timestamp.Timestamp];
			return new g.TimestampEvent(timestamp, player, prio);

		case pl.EventCode.Message:
			local = pev[EventIndex.Message.Local];
			return new g.MessageEvent(pev[EventIndex.Message.Message], player, local, prio);

		case pl.EventCode.PointDown:
			local = pev[EventIndex.PointDown.Local];
			pointerId = pev[EventIndex.PointDown.PointerId];
			entityId = pev[EventIndex.PointDown.EntityId];
			target = (entityId == null) ? undefined
			          : (entityId >= 0) ? this._game.db[entityId]
			                            : this._game._localDb[entityId];
			point = {
				x: pev[EventIndex.PointDown.X],
				y: pev[EventIndex.PointDown.Y]
			};
			return new g.PointDownEvent(pointerId, target, point, player, local, prio);

		case pl.EventCode.PointMove:
			local = pev[EventIndex.PointMove.Local];
			pointerId = pev[EventIndex.PointMove.PointerId];
			entityId = pev[EventIndex.PointMove.EntityId];
			target = (entityId == null) ? undefined
			          : (entityId >= 0) ? this._game.db[entityId]
			                            : this._game._localDb[entityId];
			point = {
				x: pev[EventIndex.PointMove.X],
				y: pev[EventIndex.PointMove.Y]
			};
			startDelta = {
				x: pev[EventIndex.PointMove.StartDeltaX],
				y: pev[EventIndex.PointMove.StartDeltaY]
			};
			prevDelta = {
				x: pev[EventIndex.PointMove.PrevDeltaX],
				y: pev[EventIndex.PointMove.PrevDeltaY]
			};
			return new g.PointMoveEvent(pointerId, target, point, prevDelta, startDelta, player, local, prio);

		case pl.EventCode.PointUp:
			local = pev[EventIndex.PointUp.Local];
			pointerId = pev[EventIndex.PointUp.PointerId];
			entityId = pev[EventIndex.PointUp.EntityId];
			target = (entityId == null) ? undefined
			          : (entityId >= 0) ? this._game.db[entityId]
			                            : this._game._localDb[entityId];
			point = {
				x: pev[EventIndex.PointUp.X],
				y: pev[EventIndex.PointUp.Y]
			};
			startDelta = {
				x: pev[EventIndex.PointUp.StartDeltaX],
				y: pev[EventIndex.PointUp.StartDeltaY]
			};
			prevDelta = {
				x: pev[EventIndex.PointUp.PrevDeltaX],
				y: pev[EventIndex.PointUp.PrevDeltaY]
			};
			return new g.PointUpEvent(pointerId, target, point, prevDelta, startDelta, player, local, prio);

		case pl.EventCode.Operation:
			local = pev[EventIndex.Operation.Local];
			var operationCode = pev[EventIndex.Operation.OperationCode];
			var operationData = pev[EventIndex.Operation.OperationData];
			var decodedData = this._game._decodeOperationPluginOperation(operationCode, operationData);
			return new g.OperationEvent(operationCode, decodedData, player, local, prio);

		default:
			// TODO handle error
			throw g.ExceptionFactory.createAssertionError("EventConverter#toGameEvent");
		}
	}

	/**
	 * g.Eventからplaylog.Eventに変換する。
	 */
	toPlaylogEvent(e: g.Event, preservePlayer?: boolean): pl.Event {
		var targetId: number;
		var playerId: string;
		switch (e.type) {
		case g.EventType.Join:
		case g.EventType.Leave:
			// game-driver は決して Join と Leave を生成しない
			throw g.ExceptionFactory.createAssertionError("EventConverter#toPlaylogEvent: Invalid type: " + g.EventType[e.type]);
		case g.EventType.Timestamp:
			var ts = <g.TimestampEvent>e;
			playerId = preservePlayer ? ts.player.id : this._game.player.id;
			return [
				pl.EventCode.Timestamp, // 0: イベントコード
				ts.priority,            // 1: 優先度
				playerId,               // 2: プレイヤーID
				ts.timestamp            // 3: タイムスタンプ
			];
		case g.EventType.PointDown:
			var pointDown = <g.PointDownEvent>e;
			targetId = pointDown.target ? pointDown.target.id : null;
			playerId = preservePlayer ? pointDown.player.id : this._game.player.id;
			return [
				pl.EventCode.PointDown, // 0: イベントコード
				pointDown.priority,     // 1: 優先度
				playerId,               // 2: プレイヤーID
				pointDown.pointerId,    // 3: ポインターID
				pointDown.point.x,      // 4: X座標
				pointDown.point.y,      // 5: Y座標
				targetId,               // 6?: エンティティID
				!!pointDown.local       // 7?: 直前のポイントムーブイベントからのY座標の差
			];
		case g.EventType.PointMove:
			var pointMove = <g.PointMoveEvent>e;
			targetId = pointMove.target ? pointMove.target.id : null;
			playerId = preservePlayer ? pointMove.player.id : this._game.player.id;
			return [
				pl.EventCode.PointMove, // 0: イベントコード
				pointMove.priority,     // 1: 優先度
				playerId,               // 2: プレイヤーID
				pointMove.pointerId,    // 3: ポインターID
				pointMove.point.x,      // 4: X座標
				pointMove.point.y,      // 5: Y座標
				pointMove.startDelta.x, // 6: ポイントダウンイベントからのX座標の差
				pointMove.startDelta.y, // 7: ポイントダウンイベントからのY座標の差
				pointMove.prevDelta.x,  // 8: 直前のポイントムーブイベントからのX座標の差
				pointMove.prevDelta.y,  // 9: 直前のポイントムーブイベントからのY座標の差
				targetId,               // 10?: エンティティID
				!!pointMove.local       // 11?: 直前のポイントムーブイベントからのY座標の差
			];
		case g.EventType.PointUp:
			var pointUp = <g.PointUpEvent>e;
			targetId = pointUp.target ? pointUp.target.id : null;
			playerId = preservePlayer ? pointUp.player.id : this._game.player.id;
			return [
				pl.EventCode.PointUp, // 0: イベントコード
				pointUp.priority,     // 1: 優先度
				playerId,             // 2: プレイヤーID
				pointUp.pointerId,    // 3: ポインターID
				pointUp.point.x,      // 4: X座標
				pointUp.point.y,      // 5: Y座標
				pointUp.startDelta.x, // 6: ポイントダウンイベントからのX座標の差
				pointUp.startDelta.y, // 7: ポイントダウンイベントからのY座標の差
				pointUp.prevDelta.x,  // 8: 直前のポイントムーブイベントからのX座標の差
				pointUp.prevDelta.y,  // 9: 直前のポイントムーブイベントからのY座標の差
				targetId,             // 10?: エンティティID
				!!pointUp.local       // 11?: 直前のポイントムーブイベントからのY座標の差
			];
		case g.EventType.Message:
			var message = <g.MessageEvent>e;
			playerId = preservePlayer ? message.player.id : this._game.player.id;
			return [
				pl.EventCode.Message, // 0: イベントコード
				message.priority,     // 1: 優先度
				playerId,             // 2: プレイヤーID
				message.data,         // 3: 汎用的なデータ
				!!message.local       // 4?: ローカル
			];
		case g.EventType.Operation:
			var op = <g.OperationEvent>e;
			playerId = preservePlayer ? op.player.id : this._game.player.id;
			return [
				pl.EventCode.Operation, // 0: イベントコード
				op.priority,            // 1: 優先度
				playerId,               // 2: プレイヤーID
				op.code,                // 3: 操作プラグインコード
				op.data,                // 4: 操作プラグインデータ
				!!op.local              // 5?: ローカル
			];
		default:
			throw g.ExceptionFactory.createAssertionError("Unknown type: " + e.type);
		}
	}

	makePlaylogOperationEvent(op: g.InternalOperationPluginOperation): pl.Event {
		var playerId = this._game.player.id;
		var priority = (op.priority != null) ? op.priority : 0;
		return [
			pl.EventCode.Operation, // 0: イベントコード
			priority,               // 1: 優先度
			playerId,               // 2: プレイヤーID
			op._code,               // 3: 操作プラグインコード
			op.data,                // 4: 操作プラグインデータ
			!!op.local              // 5: ローカル
		];
	}
}
