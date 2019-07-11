"use strict";
import { Promise } from "es6-promise";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import * as pdi from "@akashic/akashic-pdi";
import ExecutionMode from "./ExecutionMode";
import LoopConfiguration from "./LoopConfiguration";
import DriverConfiguration from "./DriverConfiguration";
import StartPointData from "./StartPointData";
import { Game } from "./Game";
import { EventBuffer } from "./EventBuffer";
import { GameLoop } from "./GameLoop";
import { PdiUtil } from "./PdiUtil";
import { Profiler } from "./Profiler";

export interface GameDriverParameterObject {
	/**
	 * ゲーム実行に用いられる環境依存レイヤ。
	 */
	platform: pdi.Platform;
	/**
	 * プレイヤー。
	 * id は `g.Game#selfId` として与えられる値。
	 */
	player: g.Player;
	/**
	 * エラー通知コールバック。
	 */
	errorHandler?: (error: any) => void;
	/**
	 * `errorHandler` を呼び出す場合に `this` として利用される値。
	 */
	errorHandlerOwner?: any;
}

export interface GameDriverInitializeParameterObject {
	/**
	 * GameDriverの動作モード。
	 */
	driverConfiguration?: DriverConfiguration;
	/**
	 * GameLoopの動作モード。
	 */
	loopConfiguration?: LoopConfiguration;
	/**
	 * 非表示状態か否か。
	 * 初期値は偽。
	 *
	 * 真である場合、音声などはミュートされる。
	 * この値は「GameDriverが認識する自身の表示状態」である。
	 * 実際に表示・非表示を制御することはGameDriverのユーザが行わなければならない。
	 */
	hidden?: boolean;
	/**
	 * game.jsonを読み込むために `Platform#loadConfiguration()` の第一引数として渡す値。
	 * 典型的にはgame.jsonのURL。(ただしgame-driver自身は `Platform` に引き渡すだけなので内容には関知しない。URLである必要もない。)
	 * 指定された場合、 `Game` が生成される。既存の `Game` がある場合、破棄して作り直される。
	 */
	configurationUrl?: string;
	/**
	 * `configurationUrl` 内の `definitions` を解決するための基準となるパス。
	 */
	configurationBase?: string;
	/**
	 * asset読み込みの基準パス。
	 */
	assetBase?: string;
	/**
	 * Gameの起動時引数。
	 * mainスクリプトに `g.GameMainParameterObject#args` として渡される。
	 */
	gameArgs?: any;
	/**
	 * プレイログに記録される起動時引数。
	 * mainスクリプトに `g.GameMainParameterObject#globalArgs` として渡される。
	 * この値は `executionMode` が `Active` でないかぎり利用されない。
	 */
	globalGameArgs?: any;
	/**
	 * 利用するプロファイラー。
	 * プロファイラーを利用しない場合、省略すること。
	 */
	profiler?: Profiler;
}

export class GameDriver {
	errorTrigger: g.Trigger<any>;
	configurationLoadedTrigger: g.Trigger<g.GameConfiguration>;
	gameCreatedTrigger: g.Trigger<Game>;

	_platform: pdi.Platform;
	_loadConfigurationFunc: PdiUtil.LoadConfigurationFunc;
	_player: g.Player;
	_rendererRequirement: pdi.RendererRequirement;
	_playId: string;
	_game: Game;
	_gameLoop: GameLoop;
	_eventBuffer: EventBuffer;

	_openedAmflow: boolean;
	_playToken: string;
	_permission: amf.Permission;
	_hidden: boolean;
	_destroyed: boolean; // ゲームをdestroy済みかどうかのフラグ。destroy時にのみtrueになる。

	constructor(param: GameDriverParameterObject) {
		this.errorTrigger = new g.Trigger<any>();

		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this.configurationLoadedTrigger = new g.Trigger<g.GameConfiguration>();
		this.gameCreatedTrigger = new g.Trigger<Game>();

		this._platform = param.platform;
		this._loadConfigurationFunc = PdiUtil.makeLoadConfigurationFunc(param.platform);
		this._player = param.player;
		this._rendererRequirement = null;
		this._playId = null;
		this._game = null;
		this._gameLoop = null;
		this._eventBuffer = null;
		this._openedAmflow = false;
		this._playToken = null;
		this._permission = null;
		this._hidden = false;
		this._destroyed = false;
	}

	/**
	 * `GameDriver` を初期化する。
	 */
	initialize(param: GameDriverInitializeParameterObject, callback: (err?: Error) => void): void {
		this.doInitialize(param).then(() => { callback(); }, callback);
	}

	/**
	 * `GameDriver` の各種状態を変更する。
	 *
	 * 引数 `param` のうち、省略されなかった値が新たに設定される。
	 * `startGame()` によりゲームが開始されていた場合、暗黙に `stopGame()` が行われ、完了後 `startGame()` される。
	 */
	changeState(param: GameDriverInitializeParameterObject, callback: (err?: Error) => void): void {
		var pausing = this._gameLoop && this._gameLoop.running;
		if (pausing)
			this._gameLoop.stop();
		this.initialize(param, (err: Error) => {
			if (err) {
				callback(err);
				return;
			}
			if (pausing)
				this._gameLoop.start();
			callback();
		});
	}

	/**
	 * ゲームを開始する。
	 * このメソッドの呼び出しは、 `initialize()` の完了後でなければならない。
	 */
	startGame(): void {
		if (!this._gameLoop) {
			this.errorTrigger.fire(new Error("Not initialized"));
			return;
		}
		this._gameLoop.start();
	}

	/**
	 * ゲームを(一時的に)止める。
	 *
	 * このメソッドの呼び出し後、 `startGame()` が呼び出されるまで、 `Game#tick()` は呼び出されない。
	 * Active であればティックの生成が行われず、 Passive であれば受信したティックは蓄積される。
	 */
	stopGame(): void {
		if (this._gameLoop) {
			this._gameLoop.stop();
		}
	}

	/**
	 * このドライバが次にティックを生成する場合の、ageの値を設定する。
	 * `ExecutionMode.Active` でない場合、動作に影響を与えない。
	 * このメソッドの呼び出しは、 `initialize()` の完了後でなければならない。
	 *
	 * @param age 次に生成されるティックのage
	 */
	setNextAge(age: number): void {
		this._gameLoop.setNextAge(age);
	}

	getPermission(): amf.Permission {
		return this._permission;
	}

	getDriverConfiguration(): DriverConfiguration {
		return {
			playId: this._playId,
			playToken: this._playToken,
			executionMode: this._gameLoop ? this._gameLoop.getExecutionMode() : undefined,
			eventBufferMode: this._eventBuffer ? this._eventBuffer.getMode() : undefined
		};
	}

	getLoopConfiguration(): LoopConfiguration {
		return this._gameLoop ? this._gameLoop.getLoopConfiguration() : null;
	}

	getHidden(): boolean {
		return this._hidden;
	}

	/**
	 * PDIに対してプライマリサーフェスのリセットを要求する。
	 * 
	 * @param width プライマリサーフェスの幅。
	 * @param height プライマリサーフェスの高さ。
	 * @param rendererCandidates Rendererのタイプ。
	 */
	resetPrimarySurface(width: number, height: number, rendererCandidates?: string[]): void {
		rendererCandidates = rendererCandidates ? rendererCandidates
		                                        : this._rendererRequirement ? this._rendererRequirement.rendererCandidates
		                                                                    : null;
		var game = this._game;
		var pf = this._platform;
		var primarySurface = pf.getPrimarySurface();
		game.renderers = game.renderers.filter(renderer => renderer !== primarySurface.renderer());

		pf.setRendererRequirement({
			primarySurfaceWidth: width,
			primarySurfaceHeight: height,
			rendererCandidates: rendererCandidates
		});
		this._rendererRequirement = {
			primarySurfaceWidth: width,
			primarySurfaceHeight: height,
			rendererCandidates: rendererCandidates
		};

		game.renderers.push(pf.getPrimarySurface().renderer());
		game.width = width;
		game.height = height;
		game.resized.fire({ width, height });
		game.modified = true;
	}

	doInitialize(param: GameDriverInitializeParameterObject): Promise<void> {
		var p = new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
			if (this._gameLoop && this._gameLoop.running) {
				return reject(new Error("Game is running. Must be stopped."));
			}
			if (this._gameLoop && param.loopConfiguration) {
				this._gameLoop.setLoopConfiguration(param.loopConfiguration);
			}
			if (param.hidden != null) {
				this._hidden = param.hidden;
				if (this._game) {
					this._game._setMuted(param.hidden);
				}
			}
			resolve();
		}).then(() => {
			this._assertLive();
			return this._doSetDriverConfiguration(param.driverConfiguration);
		});
		if (!param.configurationUrl)
			return p;
		return p.then<g.GameConfiguration>(() => {
			this._assertLive();
			return this._loadConfiguration(param.configurationUrl, param.assetBase, param.configurationBase);
		}).then<void>((conf: g.GameConfiguration) => {
			this._assertLive();
			return this._createGame(conf, this._player, param);
		});
	}

	destroy(): Promise<void> {
		// NOTE: ここで破棄されるTriggerのfire中に呼ばれるとクラッシュするので、同期的処理だが念のためPromiseに包んで非同期で実行する
		return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
			this.stopGame();
			if (this._game) {
				this._game._destroy();
				this._game = null;
			}
			this.errorTrigger.destroy();
			this.errorTrigger = null;
			this.configurationLoadedTrigger.destroy();
			this.configurationLoadedTrigger = null;
			this.gameCreatedTrigger.destroy();
			this.gameCreatedTrigger = null;
			this._platform.setRendererRequirement(undefined);
			this._platform = null;
			this._loadConfigurationFunc = null;
			this._player = null;
			this._rendererRequirement = null;
			this._playId = null;
			this._gameLoop = null;
			this._eventBuffer = null;
			this._openedAmflow = false;
			this._playToken = null;
			this._permission = null;
			this._hidden = false;
			this._destroyed = true;
			resolve();
		});
	}

	_doSetDriverConfiguration(dconf: DriverConfiguration): Promise<void> {
		if (dconf == null) {
			return Promise.resolve();
		}
		// デフォルト値の補完
		if (dconf.playId === undefined)
			dconf.playId = this._playId;
		if (dconf.playToken === undefined)
			dconf.playToken = this._playToken;
		if (dconf.eventBufferMode === undefined) {
			if (dconf.executionMode === ExecutionMode.Active) {
				dconf.eventBufferMode = { isReceiver: true, isSender: false };
			} else if (dconf.executionMode === ExecutionMode.Passive) {
				dconf.eventBufferMode = { isReceiver: false, isSender: true };
			}
		}
		var p = Promise.resolve();
		if (this._playId !== dconf.playId)
			p = p.then<void>(() => {
				this._assertLive();
				return this._doOpenAmflow(dconf.playId);
			});
		if (this._playToken !== dconf.playToken)
			p = p.then<void>(() => {
				this._assertLive();
				return this._doAuthenticate(dconf.playToken);
			});
		return p.then<void>(() => {
			this._assertLive();
			return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
				if (dconf.eventBufferMode != null) {
					if (dconf.eventBufferMode.defaultEventPriority == null) {
						dconf.eventBufferMode.defaultEventPriority = this._permission.maxEventPriority;
					}
					if (this._eventBuffer) {
						this._eventBuffer.setMode(dconf.eventBufferMode);
					}
				}
				if (dconf.executionMode != null) {
					if (this._gameLoop) {
						this._gameLoop.setExecutionMode(dconf.executionMode);
					}
				}
				resolve();
			});
		});
	}

	_doCloseAmflow(): Promise<void> {
		return new Promise<void>((resolve: () => void , reject: (err: any) => void) => {
			if (!this._openedAmflow)
				return resolve();
			this._platform.amflow.close((err?: any) => {
				this._assertLive();
				this._openedAmflow = false;
				if (err)
					return reject(err);
				resolve();
			});
		});
	}

	_doOpenAmflow(playId: string): Promise<void> {
		if (playId === undefined) {
			return Promise.resolve();
		}
		var p = this._doCloseAmflow();
		return p.then<void>(() => {
			this._assertLive();
			return new Promise<void>((resolve: () => any, reject: (err: any) => void) => {
				if (playId === null)
					return resolve();
				this._platform.amflow.open(playId, (err?: any) => {
					this._assertLive();
					if (err)
						return reject(err);
					this._openedAmflow = true;
					this._playId = playId;
					if (this._game)
						this._updateGamePlayId(this._game);
					resolve();
				});
			});
		});
	}

	_doAuthenticate(playToken: string): Promise<void> {
		if (playToken == null)
			return Promise.resolve();
		return new Promise<void>((resolve: () => any, reject: (err: any) => void) => {
			this._platform.amflow.authenticate(playToken, (err: Error, permission?: amf.Permission) => {
				this._assertLive();
				if (err)
					return reject(err);
				this._playToken = playToken;
				this._permission = permission;
				if (this._game) {
					this._game.isSnapshotSaver = this._permission.writeTick;
				}
				resolve();
			});
		});
	}

	_loadConfiguration(configurationUrl: string, assetBase: string, configurationBase: string): Promise<g.GameConfiguration> {
		return new Promise((resolve: (conf: g.GameConfiguration) => void, reject: (err: any) => void) => {
			this._loadConfigurationFunc(configurationUrl, assetBase, configurationBase, (err: any, conf?: g.GameConfiguration) => {
				this._assertLive();
				if (err)
					return reject(err);
				this.configurationLoadedTrigger.fire(conf);
				resolve(conf);
			});
		});
	}

	_putZerothStartPoint(data: StartPointData): Promise<void> {
		return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
			// AMFlowは第0スタートポイントに関して「書かれるまで待つ」という動作をするため、「なければ書き込む」ことはできない。
			var zerothStartPoint = { frame: 0, timestamp: data.startedAt, data };
			this._platform.amflow.putStartPoint(zerothStartPoint, (err: any) => {
				this._assertLive();
				if (err) return reject(err);
				resolve();
			});
		});
	}

	_getZerothStartPointData(): Promise<StartPointData> {
		return new Promise<StartPointData>((resolve: (data: StartPointData) => void, reject: (err: any) => void) => {
			this._platform.amflow.getStartPoint({ frame: 0 }, (err: Error, startPoint: amf.StartPoint) => {
				this._assertLive();
				if (err) return reject(err);
				var data = <StartPointData>startPoint.data;
				if (typeof data.seed !== "number")  // 型がないので一応確認
					return reject(new Error("GameDriver#_getRandomSeed: No seed found."));
				resolve(data);
			});
		});
	}

	_createGame(conf: g.GameConfiguration, player: g.Player, param: GameDriverInitializeParameterObject): Promise<void> {
		var putSeed = (param.driverConfiguration.executionMode === ExecutionMode.Active) && this._permission.writeTick;
		var p;
		if (putSeed) {
			p = this._putZerothStartPoint({
				seed: Date.now(),
				globalArgs: param.globalGameArgs,
				fps: conf.fps,
				startedAt: Date.now()
			});
		} else {
			p = Promise.resolve();
		}
		p = p.then<StartPointData>(() => {
			this._assertLive();
			return this._getZerothStartPointData();
		});
		return p.then<void>((zerothData: StartPointData) => {
			this._assertLive();
			var pf = this._platform;
			var driverConf = param.driverConfiguration || {
				eventBufferMode: {isReceiver: true, isSender: false},
				executionMode: ExecutionMode.Active
			};
			var seed = zerothData.seed;
			var args = param.gameArgs;
			var globalArgs = zerothData.globalArgs;
			var startedAt = zerothData.startedAt;
			var rendererRequirement = {
				primarySurfaceWidth: conf.width,
				primarySurfaceHeight: conf.height,
				rendererCandidates: (<any>conf).renderers   // TODO: akashic-engineのGameConfigurationにrenderersの定義を加える
			};
			pf.setRendererRequirement(rendererRequirement);
			var game = new Game({
				configuration: conf,
				player: player,
				resourceFactory: pf.getResourceFactory(),
				assetBase: param.assetBase,
				isSnapshotSaver: this._permission.writeTick,
				operationPluginViewInfo: (pf.getOperationPluginViewInfo ? pf.getOperationPluginViewInfo() : null),
				gameArgs: args,
				globalGameArgs: globalArgs
			});
			var eventBuffer = new EventBuffer({game: game, amflow: pf.amflow});
			eventBuffer.setMode(driverConf.eventBufferMode);
			pf.setPlatformEventHandler(eventBuffer);
			game.setEventFilterFuncs({
				addFilter: eventBuffer.addFilter.bind(eventBuffer),
				removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
			});
			game.renderers.push(pf.getPrimarySurface().renderer());

			var gameLoop = new GameLoop({
				game: game,
				amflow: pf.amflow,
				platform: pf,
				executionMode: driverConf.executionMode,
				eventBuffer: eventBuffer,
				configuration: param.loopConfiguration,
				startedAt: startedAt,
				profiler: param.profiler
			});

			gameLoop.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
			game.setCurrentTimeFunc(gameLoop.getCurrentTime.bind(gameLoop));
			game._reset({age: 0, randGen: new g.XorshiftRandomGenerator(seed)});
			this._updateGamePlayId(game);
			if (this._hidden)
				game._setMuted(true);

			game.snapshotTrigger.add((startPoint: amf.StartPoint) => {
				this._platform.amflow.putStartPoint(startPoint, (err: Error) => {
					this._assertLive();
					if (err)
						this.errorTrigger.fire(err);
				});
			});

			this._game = game;
			this._eventBuffer = eventBuffer;
			this._gameLoop = gameLoop;
			this._rendererRequirement = rendererRequirement;
			this.gameCreatedTrigger.fire(game);
			this._game._loadAndStart({args: param.gameArgs || undefined}); // TODO: Game#_restartWithSnapshot()と統合すべき
		});
	}

	_updateGamePlayId(game: Game): void {
		game.playId = this._playId;
		game.external.send = (data: any) => {
			this._platform.sendToExternal(this._playId, data);
		};
	}

	// 非同期処理中にゲームがdestroy済みかどうかするための関数。
	_assertLive(): void {
		if (this._destroyed) {
			throw new Error("Game has been destroyed.");
		}
	}
}
