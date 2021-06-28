"use strict";
import * as g from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import { makeLoadConfigurationFunc, LoadConfigurationFunc } from "@akashic/game-configuration/lib/utils";
import * as pdi from "@akashic/pdi-types";
import * as pl from "@akashic/playlog";
import { Promise } from "es6-promise";
import DriverConfiguration from "./DriverConfiguration";
import { EventBuffer } from "./EventBuffer";
import ExecutionMode from "./ExecutionMode";
import { Game } from "./Game";
import { GameHandlerSet } from "./GameHandlerSet";
import { GameLoop } from "./GameLoop";
import LoopConfiguration from "./LoopConfiguration";
import { Profiler } from "./Profiler";
import StartPointData from "./StartPointData";

const GAME_DESTROYED_MESSAGE = "GAME_DESTROYED";

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
	errorTrigger: g.Trigger<any> = new g.Trigger();
	configurationLoadedTrigger: g.Trigger<g.GameConfiguration> = new g.Trigger();
	gameCreatedTrigger: g.Trigger<Game> = new g.Trigger();

	_platform: pdi.Platform;
	_loadConfigurationFunc: LoadConfigurationFunc;
	_player: g.Player;
	_rendererRequirement: pdi.RendererRequirement | null = null;
	_playId: string | undefined; // g.Game#playId と型を合わせる
	_game: Game | null = null;
	_gameLoop: GameLoop | null = null;
	_eventBuffer: EventBuffer | null = null;

	_openedAmflow: boolean = false;
	_playToken: string | null = null;
	_permission: amf.Permission | null = null;
	_hidden: boolean = false;
	_destroyed: boolean = false;

	constructor(param: GameDriverParameterObject) {
		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._platform = param.platform;
		this._loadConfigurationFunc = makeLoadConfigurationFunc(param.platform.loadGameConfiguration);
		this._player = param.player;
	}

	/**
	 * `GameDriver` を初期化する。
	 */
	initialize(param: GameDriverInitializeParameterObject, callback: (err?: Error) => void): void {
		this.doInitialize(param).then(() => {
			callback();
		}, callback);
	}

	/**
	 * `GameDriver` の各種状態を変更する。
	 *
	 * 引数 `param` のうち、省略されなかった値が新たに設定される。
	 * `startGame()` によりゲームが開始されていた場合、暗黙に `stopGame()` が行われ、完了後 `startGame()` される。
	 */
	changeState(param: GameDriverInitializeParameterObject, callback: (err?: Error) => void): void {
		const pausing = this._gameLoop && this._gameLoop.running;
		if (pausing)
			this._gameLoop?.stop();
		this.initialize(param, err => {
			if (err) {
				callback(err);
				return;
			}
			if (pausing)
				this._gameLoop?.start();
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
		this._gameLoop?.setNextAge(age);
	}

	getPermission(): amf.Permission | null {
		return this._permission;
	}

	getDriverConfiguration(): DriverConfiguration {
		return {
			playId: this._playId,
			playToken: this._playToken ?? undefined,
			executionMode: this._gameLoop ? this._gameLoop.getExecutionMode() : undefined,
			eventBufferMode: this._eventBuffer ? this._eventBuffer.getMode() : undefined
		};
	}

	getLoopConfiguration(): LoopConfiguration | null {
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
		                                                                    : undefined;
		const game = this._game!;
		const pf = this._platform;
		const primarySurface = pf.getPrimarySurface();
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
		game.onResized.fire({ width, height });
		game.modified();
	}

	doInitialize(param: GameDriverInitializeParameterObject): Promise<void> {
		const p = new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
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
		const configurationUrl = param.configurationUrl;
		if (!configurationUrl)
			return p;
		return p.then<g.GameConfiguration>(() => {
			this._assertLive();
			return this._loadConfiguration(configurationUrl, param.assetBase, param.configurationBase);
		}).then<void>((conf: g.GameConfiguration) => {
			this._assertLive();
			return this._createGame(conf, this._player, param);
		});
	}

	destroy(): Promise<void> {
		// NOTE: ここで破棄されるTriggerのfire中に呼ばれるとクラッシュするので、同期的処理だが念のためPromiseに包んで非同期で実行する
		return new Promise<void>((resolve: () => void, _reject: (err: any) => void) => {
			this.stopGame();
			if (this._game) {
				this._game._destroy();
				this._game = null;
			}
			this.errorTrigger.destroy();
			this.errorTrigger = null!;
			this.configurationLoadedTrigger.destroy();
			this.configurationLoadedTrigger = null!;
			this.gameCreatedTrigger.destroy();
			this.gameCreatedTrigger = null!;
			if (this._platform.destroy) {
				this._platform.destroy();
			} else {
				this._platform.setRendererRequirement(undefined);
			}
			this._platform = null!;
			this._loadConfigurationFunc = null!;
			this._player = null!;
			this._rendererRequirement = null;
			this._playId = undefined;
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

	_doSetDriverConfiguration(dconf?: DriverConfiguration): Promise<void> {
		if (dconf == null) {
			return Promise.resolve();
		}
		// デフォルト値の補完
		if (dconf.playId === undefined)
			dconf.playId = this._playId ?? undefined;
		if (dconf.playToken === undefined)
			dconf.playToken = this._playToken ?? undefined;
		if (dconf.eventBufferMode === undefined) {
			if (dconf.executionMode === ExecutionMode.Active) {
				dconf.eventBufferMode = { isReceiver: true, isSender: false };
			} else if (dconf.executionMode === ExecutionMode.Passive) {
				dconf.eventBufferMode = { isReceiver: false, isSender: true };
			}
		}
		let p = Promise.resolve();
		if (this._playId !== dconf.playId) {
			p = p.then<void>(() => {
				this._assertLive();
				return this._doOpenAmflow(dconf.playId);
			});
		}
		if (this._playToken !== dconf.playToken) {
			p = p.then<void>(() => {
				this._assertLive();
				return this._doAuthenticate(dconf.playToken);
			});
		}
		return p.then<void>(() => {
			this._assertLive();
			if (dconf.eventBufferMode != null) {
				if (dconf.eventBufferMode.defaultEventPriority == null) {
					if (this._permission) {
						dconf.eventBufferMode.defaultEventPriority = pl.EventFlagsMask.Priority & this._permission.maxEventPriority;
					} else {
						// NOTE: permission が無ければイベントを送信することはできないが、念の為に優先度を最低につけておく。
						dconf.eventBufferMode.defaultEventPriority = 0;
					}
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
		});
	}

	_doCloseAmflow(): Promise<void> {
		return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
			if (!this._openedAmflow)
				return resolve();
			this._platform.amflow.close((err: any | null) => {
				this._openedAmflow = false;
				const error = this._getCallbackError(err);
				if (error) {
					return reject(error);
				}
				resolve();
			});
		});
	}

	_doOpenAmflow(playId: string | undefined): Promise<void> {
		if (playId === undefined) {
			return Promise.resolve();
		}
		var p = this._doCloseAmflow();
		return p.then<void>(() => {
			this._assertLive();
			return new Promise<void>((resolve: () => any, reject: (err: any) => void) => {
				if (playId === null)
					return resolve();
				this._platform.amflow.open(playId, (err: any | null) => {
					const error = this._getCallbackError(err);
					if (error) {
						return reject(error);
					}
					this._openedAmflow = true;
					this._playId = playId;
					if (this._game)
						this._updateGamePlayId(this._game);
					resolve();
				});
			});
		});
	}

	_doAuthenticate(playToken: string | undefined): Promise<void> {
		if (playToken == null)
			return Promise.resolve();
		return new Promise<void>((resolve: () => any, reject: (err: any) => void) => {
			this._platform.amflow.authenticate(playToken, (err: Error | null, permission?: amf.Permission) => {
				const error = this._getCallbackError(err);
				if (error) {
					return reject(error);
				}
				if (!permission) {
					reject(new Error("Permission denied."));
					return;
				}
				this._playToken = playToken;
				this._permission = permission;
				if (this._game) {
					this._game.handlerSet.isSnapshotSaver = permission.writeTick;
				}
				resolve();
			});
		});
	}

	_loadConfiguration(
		configurationUrl: string,
		assetBase: string | undefined,
		configurationBase: string | undefined
	): Promise<g.GameConfiguration> {
		return new Promise((resolve: (conf: g.GameConfiguration) => void, reject: (err: any) => void) => {
			this._loadConfigurationFunc(configurationUrl, assetBase, configurationBase, (err, conf) => {
				const error = this._getCallbackError(err);
				if (error) {
					return void reject(error);
				}
				if (!conf) {
					return void reject(new Error("GameDriver#_loadConfiguration: No configuration found."));
				}
				this.configurationLoadedTrigger.fire(conf);
				resolve(conf);
			});
		});
	}

	_putZerothStartPoint(data: StartPointData): Promise<void> {
		return new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
			// AMFlowは第0スタートポイントに関して「書かれるまで待つ」という動作をするため、「なければ書き込む」ことはできない。
			// NOTE: 仕様上第0スタートポイントには必ず data.startedAt が存在するとみなせる。
			var zerothStartPoint = { frame: 0, timestamp: data.startedAt!, data };
			this._platform.amflow.putStartPoint(zerothStartPoint, (err: any | null) => {
				const error = this._getCallbackError(err);
				if (error) {
					return reject(error);
				}
				resolve();
			});
		});
	}

	_getZerothStartPointData(): Promise<StartPointData> {
		return new Promise<StartPointData>((resolve, reject) => {
			this._platform.amflow.getStartPoint({ frame: 0 }, (err, startPoint) => {
				const error = this._getCallbackError(err);
				if (error)
					return reject(error);
				if (!startPoint)
					return reject(new Error("GameDriver#_getZerothStartPointData: No startPoint found"));

				const data = startPoint.data;
				if (typeof data.seed !== "number") // 型がないので一応確認
					return reject(new Error("GameDriver#_getZerothStartPointData: No seed found."));
				resolve(data);
			});
		});
	}

	_createGame(conf: g.GameConfiguration, player: g.Player, param: GameDriverInitializeParameterObject): Promise<void> {
		const writeTick = !!this._permission?.writeTick;
		const putSeed = !!(param.driverConfiguration?.executionMode === ExecutionMode.Active) && writeTick;
		let p;
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
		return p.then<void>(zerothData => {
			this._assertLive();
			const pf = this._platform;
			const driverConf = param.driverConfiguration || {
				eventBufferMode: { isReceiver: true, isSender: false },
				executionMode: ExecutionMode.Active
			};
			const seed = zerothData.seed;
			const args = param.gameArgs;
			const globalArgs = zerothData.globalArgs;
			const startedAt = zerothData.startedAt!;
			const rendererRequirement = {
				primarySurfaceWidth: conf.width,
				primarySurfaceHeight: conf.height,
				rendererCandidates: (conf as any).renderers // TODO: g.GameConfiguration に renderers の定義を加える
			};
			pf.setRendererRequirement(rendererRequirement);
			const handlerSet = new GameHandlerSet({
				isSnapshotSaver: writeTick
			});
			const game = new Game({
				engineModule: g,
				handlerSet,
				configuration: conf,
				selfId: player.id,
				player: player,
				resourceFactory: pf.getResourceFactory(),
				assetBase: param.assetBase,
				operationPluginViewInfo: (pf.getOperationPluginViewInfo ? pf.getOperationPluginViewInfo() : undefined),
				gameArgs: args,
				globalGameArgs: globalArgs
			});
			const eventBuffer = new EventBuffer({ game: game, amflow: pf.amflow });

			// NOTE: this._doSetDriverConfiguration() により driverConf の各 config が non-null であることが保証されている
			const eventBufferMode = driverConf.eventBufferMode!;
			const executionMode = driverConf.executionMode!;

			eventBuffer.setMode(eventBufferMode);
			pf.setPlatformEventHandler(eventBuffer);
			handlerSet.setEventFilterFuncs({
				addFilter: eventBuffer.addFilter.bind(eventBuffer),
				removeFilter: eventBuffer.removeFilter.bind(eventBuffer)
			});
			game.renderers.push(pf.getPrimarySurface().renderer());

			var gameLoop = new GameLoop({
				game: game,
				amflow: pf.amflow,
				platform: pf,
				executionMode,
				eventBuffer,
				// @ts-ignore TODO: param.loopConfiguration === undefined の扱い
				configuration: param.loopConfiguration,
				startedAt,
				profiler: param.profiler
			});

			gameLoop.rawTargetTimeReachedTrigger.add(game._onRawTargetTimeReached, game);
			handlerSet.setCurrentTimeFunc(gameLoop.getCurrentTime.bind(gameLoop));
			game._reset({ age: 0, randSeed: seed });
			this._updateGamePlayId(game);
			if (this._hidden)
				game._setMuted(true);

			handlerSet.snapshotTrigger.add(startPoint => {
				if (startPoint.frame === 0) {
					// 0 フレーム目の startPoint は状態復元の高速化に寄与しない。
					// またシードの保存など別用途で使っているので無視。(ref. _putZerothStartPoint())
					return;
				}
				this._platform.amflow.putStartPoint(startPoint, err => {
					const error = this._getCallbackError(err);
					if (error) {
						this.errorTrigger.fire(error);
					}
				});
			});

			this._game = game;
			this._eventBuffer = eventBuffer;
			this._gameLoop = gameLoop;
			this._rendererRequirement = rendererRequirement;
			this.gameCreatedTrigger.fire(game);
			this._game._loadAndStart({ args: param.gameArgs || undefined }); // TODO: Game#_restartWithSnapshot()と統合すべき
		});
	}

	_updateGamePlayId(game: Game): void {
		game.playId = this._playId;
		game.external.send = (data: any) => {
			if (!this._playId) return;
			this._platform.sendToExternal(this._playId, data);
		};
	}

	// 非同期処理中にゲームがdestroy済みかどうか判定するためのメソッド
	_assertLive(): void {
		if (this._destroyed) {
			throw new Error(GAME_DESTROYED_MESSAGE);
		}
	}

	// コールバック時にエラーが発生もしくはゲームがdestroy済みの場合はErrorを返す
	_getCallbackError(err: any): Error|null {
		if (err) {
			return err as Error;
		} else if (this._destroyed) {
			return new Error(GAME_DESTROYED_MESSAGE);
		}
		return null;
	}
}
