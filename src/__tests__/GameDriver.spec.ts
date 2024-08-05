import type * as amf from "@akashic/amflow";
import { GameDriver } from "../GameDriver";
import { MockAmflow } from "./helpers/MockAmflow";
import { Platform } from "./helpers/MockPlatform";
import { GameLoop } from "../GameLoop";

describe("GameDriver", () => {
	const seed = 100;
	const globalArgs = {a: 1, b: 2, c: 3};
	const startedAt = 1496056872250;
	const fps = 45;
	let platform: Platform;

	beforeEach(() => {
		platform = new Platform({});
		platform.amflow = new MockAmflow();
	});

	afterEach(() => {
		platform = undefined!;
	});

	it("can be destroyed", (done: () => void) => {
		const gameDriver = new GameDriver({platform, player: null!});
		gameDriver.destroy().then(() => {
			// TODO game生成後の破棄テスト
			expect(gameDriver.errorTrigger).toBe(null);
			done();
		});
	});

	describe("initialize", () => {
		it("_deltaTimeBrokenThreshold parameter", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: {id: "dummyPlayerId"}});
			jest.spyOn(gameDriver, "_loadConfiguration").mockImplementation(
				(_configurationUrl: string, _assetBase: string | undefined, _configurationBase: string | undefined) => {
					return new Promise((resolve: (conf: any) => void, _reject: (err: any) => void) => {
						resolve({width: 100, height: 100, fps: 30});
					});
				}
			);
			jest.spyOn(GameLoop.prototype, "_updateGameAudioSuppression").mockImplementation(() => {});
			jest.spyOn(GameLoop.prototype, "reset").mockImplementation(() => {});

			const driverConf = {
				playId: "dummyId",
				playToken: "dummyToken",
				eventBufferMode: { isReceiver: true, isSender: false },
				executionMode: 1
			};
			const loopConf = {
				loopMode: 0,
				deltaTimeBrokenThreshold: 222
			};

			gameDriver.initialize({
				configurationUrl: "./game.json",
				assetBase: ".",
				driverConfiguration: driverConf,
				loopConfiguration: loopConf
			},  (e) => {
				if (e) {
					throw e;
				}
				expect(gameDriver._game).toBeDefined();
				expect(gameDriver._eventBuffer).toBeDefined();
				expect(gameDriver._gameLoop).toBeDefined();
				expect(gameDriver._rendererRequirement).toBeDefined();

				expect(gameDriver._gameLoop?._clock.deltaTimeBrokenThreshold).toBe(loopConf.deltaTimeBrokenThreshold)
				done();
			});
		});
	});

	describe("_putZerothStartPoint", () => {
		it("should write the StartPointData on amflow", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "putStartPoint").mockImplementation(
				(startPoint: amf.StartPoint, callback: (error: Error | null) => void): void => {
					expect(startPoint).toEqual({
						frame: 0,
						timestamp: startedAt,
						data: {seed, globalArgs, startedAt, fps}
					});
					callback(null);
				}
			);
			gameDriver._putZerothStartPoint({seed, globalArgs, startedAt, fps})
				.then(() => {
					expect(platform.amflow.putStartPoint).toHaveBeenCalled();
					done();
				});
		});

		it("should report amflow error", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "putStartPoint").mockImplementation(
				(_startPoint: amf.StartPoint, callback: (error: Error) => void): void => {
					callback(new Error());
				}
			);
			gameDriver._putZerothStartPoint({seed, globalArgs, startedAt, fps}).catch(_err => done());
		});
	});

	describe("_getStartPoint", () => {
		it("should get a StartPointData from amflow", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "getStartPoint").mockImplementation(
				(opts: amf.GetStartPointOptions, callback: (error: Error | null, startPoint: amf.StartPoint) => void): void => {
					expect(opts.frame).toBe(0);
					callback(null, {frame: 0, timestamp: 0, data: {seed, globalArgs, startedAt, fps}});
				}
			);
			gameDriver._getStartPoint(0)
				.then((sp: amf.StartPoint) => {
					expect(sp.data).toEqual({seed, globalArgs, startedAt, fps});
					expect(platform.amflow.getStartPoint).toHaveBeenCalled();
					done();
				});
		});

		it("should report amflow error", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "getStartPoint").mockImplementation(
				(_opts: amf.GetStartPointOptions, callback: (error: Error, startPoint?: amf.StartPoint) => void): void => {
					callback(new Error());
				}
			);
			gameDriver._getStartPoint(0).catch(_err => done());
		});
	});
});
