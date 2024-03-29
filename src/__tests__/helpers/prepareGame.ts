import * as fs from "fs";
import * as path from "path";
import * as g from "@akashic/akashic-engine";
import * as utils from "@akashic/game-configuration/lib/utils";
import { GameHandlerSet } from "../../GameHandlerSet";
import { MockGame } from "./MockGame";
import * as mockrf from "./MockResourceFactory";

export enum FixtureGame {
	/**
	 * spec/fixture/simple_game/ のゲーム。
	 */
	SimpleGame,
	/**
	 * spec/fixture/local_tick_game/ のゲーム。
	 */
	LocalTickGame
}

const gameTitleTable: { [key: number]: string } = {};
gameTitleTable[FixtureGame.SimpleGame] = "../fixtures/simple_game/";
gameTitleTable[FixtureGame.LocalTickGame] = "../fixtures/local_tick_game/";

export interface PrepareGameParameterObject {
	title: FixtureGame;
	playerId?: string;
	player?: g.Player;
	scriptLoadDelay?: number;
	gameArgs?: any;
}

export function prepareGame(param: PrepareGameParameterObject): MockGame {
	const gamePath = gameTitleTable[param.title];
	const assetBase = path.resolve(__dirname, gamePath);

	// NOTE: 本来非同期で処理されている部分を無理やり同期処理に直している。
	// TODO: 無理やり同期処理にせず、呼び出し元で await をつける
	let configuration = JSON.parse(fs.readFileSync(path.resolve(assetBase, "game.json"), "utf8"));
	const loadGameConfiguration: utils.LoadGameConfigurationFunc = (_url, callback) => {
		return callback(null, configuration);
	};

	const loadConfiguration = utils.makeLoadConfigurationFunc(loadGameConfiguration);
	loadConfiguration("", assetBase, "", (_err, conf) => {
		configuration = conf;
	});

	const game = new MockGame({
		engineModule: g,
		configuration: configuration,
		handlerSet: new GameHandlerSet({ isSnapshotSaver: false }),
		resourceFactory: new mockrf.ResourceFactory({ scriptLoadDelay: param.scriptLoadDelay }),
		assetBase: assetBase,
		selfId: param.playerId,
		player: param.player ? param.player : { id: param.playerId },
		gameArgs: param.gameArgs
	});
	return game;
}
