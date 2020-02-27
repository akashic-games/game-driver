import * as path from "path";
import * as fs from "fs";
import * as g from "@akashic/akashic-engine";
import * as mockrf from "./MockResourceFactory";
import { MockGame } from "./MockGame";
import { PdiUtil } from "../../../lib/PdiUtil";

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

var gameTitleTable: { [key: number]: string } = {};
gameTitleTable[FixtureGame.SimpleGame] = "../../fixtures/simple_game/";
gameTitleTable[FixtureGame.LocalTickGame] = "../../fixtures/local_tick_game/";

export interface PrepareGameParameterObject {
	title: FixtureGame;
	playerId?: string;
	player?: g.Player;
}

export function prepareGame(param: PrepareGameParameterObject): MockGame {
	var gamePath = gameTitleTable[param.title];
	var assetBase = path.resolve(__dirname, gamePath);
	var configuration = JSON.parse(fs.readFileSync(path.resolve(assetBase, "game.json"), "utf8"));
	configuration = PdiUtil._resolveConfigurationBasePath(configuration, assetBase);

	var game = new MockGame({
		engineModule: g,
		configuration: configuration,
		resourceFactory: new mockrf.ResourceFactory(),
		assetBase: assetBase,
		selfId: param.playerId,
		player: param.player ? param.player : { id: param.playerId }
	});
	return game;
}
