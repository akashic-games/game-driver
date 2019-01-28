import { PdiUtil } from "../../lib/PdiUtil";
import * as mockpf from "../helpers/lib/MockPlatform";

describe("PdiUtil", function() {
	describe("makeLoadConfigurationFunc", function () {
		var confs = {
			"conf1": {
				width: 320,
				height: 240,
				fps: 30,
				main: "./script/main.js",
				assets: {
					"main": { type: "script", path: "script/main.js", global: true },
					"mainScene": { type: "script", path: "script/mainScene.js", global: true },
					"chara": { type: "image", path: "image/chara.png", width: 120, height: 120 }
				}
			},
			"conf2": {
				fps: 60,
				main: "./CONF2/script/altMain.js",
				assets: {
					"altMain": { type: "script", path: "CONF2/script/main.js", global: true }
				},
				globalScripts: [
					"./node_modules/foo/bar.js"
				]
			},
			"conf3": {
				assets: {
					"mainScene": { path: "CONF3/script/mainScene.js" },
					"chara": { width: 60 }
				},
				globalScripts: [
					"./node_modules/zoo/index.js"
				]
			},
			"/base/a/1/conf1": {
				width: 800,
				height: 450,
				fps: 50,
				main: "./script/main.js",
				assets: {
					"main": { type: "script", path: "script/main.js", global: true },
					"mainScene": { type: "script", path: "script/mainScene.js", global: true },
					"chara": { type: "image", path: "image/chara.png", width: 120, height: 120 }
				}
			},
			"/base/a/2/conf2": {
				fps: 120,
				main: "./CONF2/script/altMain.js",
				assets: {
					"altMain": { type: "script", path: "CONF2/script/main.js", global: true }
				},
				globalScripts: [
					"./node_modules/foo/bar.js"
				]
			},
			"/base/a/3/conf3": {
				assets: {
					"mainScene": { path: "CONF3/script/mainScene.js" },
					"chara": { width: 180 }
				},
				globalScripts: [
					"./node_modules/zoo/index.js"
				]
			},
			"alternative/base/path/conf3": {
				assets: {
					"mainScene": { path: "CONF3/script/mainScene.js" },
					"chara": { width: 60 }
				},
				globalScripts: [
					"./node_modules/zoo/index.js"
				]
			},
			"conf(1+2)": {
				definitions: [
					{ url: "conf1", basePath: "" },
					{ url: "conf2", basePath: "" }
				]
			},
			"conf(1+2+3)": {
				definitions: [
					"./a/1/conf1", "./a/2/conf2", "./a/3/conf3"
				]
			},
			"conf((1+2))": {
				definitions: ["conf(1+2)"]
			},
			"conf((1+2)+3)": {
				definitions: [
					"conf(1+2)",
					{ url: "conf3", basePath: "alternative/base/path/" }
				]
			},
			"fail": {
				definitions: [mockpf.Platform.INEXISTENT_GAME_CONFIGURATION]
			},
			"fail2": {
				width: 320,
				height: 240,
				fps: 30,
				assets: {
					"mainScene": { type: "script", path: "./script/../../mainScene.js", global: true }
				}
			}
		};

		it("loads g.GameConfiguration", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("conf1", "base", "", (err: any, conf: any) => {
				expect(err).toBeFalsy();
				expect(conf).toEqual({
					width: 320,
					height: 240,
					fps: 30,
					main: "./script/main.js",
					assets: {
						"main": {
							type: "script",
							path: "base/script/main.js",
							virtualPath: "script/main.js",
							global: true
						},
						"mainScene": {
							type: "script",
							path: "base/script/mainScene.js",
							virtualPath: "script/mainScene.js",
							global: true
						},
						"chara": {
							type: "image",
							path: "base/image/chara.png",
							virtualPath: "image/chara.png",
							width: 120,
							height: 120
						}
					}
				});
				done();
			});
		});

		it("merges definitions", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("conf(1+2)", "", "", (err: any, conf: any) => {
				expect(err).toBeFalsy();
				expect(conf).toEqual({
					width: 320,
					height: 240,
					fps: 60,
					main: "./CONF2/script/altMain.js",
					assets: {
						"main": {
							type: "script",
							path: "script/main.js",
							virtualPath: "script/main.js",
							global: true
						},
						"mainScene": {
							type: "script",
							path: "script/mainScene.js",
							virtualPath: "script/mainScene.js",
							global: true
						},
						"chara": {
							type: "image",
							path: "image/chara.png",
							virtualPath: "image/chara.png",
							width: 120,
							height: 120
						},
						"altMain": {
							type: "script",
							path: "CONF2/script/main.js",
							virtualPath: "CONF2/script/main.js",
							global: true
						},
						"./node_modules/foo/bar.js": {
							type: "script",
							path: "./node_modules/foo/bar.js",
							virtualPath: "./node_modules/foo/bar.js",
							global: true
						}
					}
				});
				done();
			});
		});

		it("supports nested definitions", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("conf((1+2)+3)", "", "", (err: any, conf: any) => {
				expect(err).toBeFalsy();
				expect(conf).toEqual({
					width: 320,
					height: 240,
					fps: 60,
					main: "./CONF2/script/altMain.js",
					assets: {
						"main": {
							type: "script",
							path: "script/main.js",
							virtualPath: "script/main.js",
							global: true
						},
						"mainScene": {
							type: "script",
							path: "alternative/base/path/CONF3/script/mainScene.js",
							virtualPath: "CONF3/script/mainScene.js",
							global: true
						},
						"chara": {
							type: "image",
							path: "image/chara.png",
							virtualPath: "image/chara.png",
							width: 60,
							height: 120
						},
						"altMain": {
							type: "script",
							path: "CONF2/script/main.js",
							virtualPath: "CONF2/script/main.js",
							global: true
						},
						"./node_modules/foo/bar.js": {
							type: "script",
							path: "./node_modules/foo/bar.js",
							virtualPath: "./node_modules/foo/bar.js",
							global: true
						},
						"./node_modules/zoo/index.js": {
							type: "script",
							virtualPath: "./node_modules/zoo/index.js",
							path: "alternative/base/path/node_modules/zoo/index.js",
							global: true
						}
					}
				});
				done();
			});
		});

		it("handles load failure", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun(mockpf.Platform.INEXISTENT_GAME_CONFIGURATION, "", "", (err: any, conf: any) => {
				expect(!!err).toBe(true);
				done();
			});
		});

		it("handles nested load failure", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("fail", "", "", (err: any, conf: any) => {
				expect(!!err).toBe(true);
				done();
			});
		});

		it("catches normalize failure", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("fail2", "", "", (err: any, conf: any) => {
				expect(!!err).toBe(true);
				done();
			});
		});

		it("supports configuration base url", function (done: any) {
			var pf = new mockpf.Platform({ configurations: confs });
			var fun = PdiUtil.makeLoadConfigurationFunc(pf);
			fun("conf(1+2+3)", "./", "/base/", (err: any, conf: any) => {
				expect(conf).toEqual({
					width: 800,
					height: 450,
					fps: 120,
					main: "./CONF2/script/altMain.js",
					assets: {
						"main": {
							type: "script",
							path: "/base/a/1/script/main.js",
							virtualPath: "script/main.js",
							global: true
						},
						"mainScene": {
							type: "script",
							path: "/base/a/3/CONF3/script/mainScene.js",
							virtualPath: "CONF3/script/mainScene.js",
							global: true
						},
						"chara": {
							type: "image",
							path: "/base/a/1/image/chara.png",
							virtualPath: "image/chara.png",
							width: 180,
							height: 120
						},
						"altMain": {
							type: "script",
							path: "/base/a/2/CONF2/script/main.js",
							virtualPath: "CONF2/script/main.js",
							global: true
						},
						"./node_modules/foo/bar.js": {
							type: "script",
							path: "/base/a/2/node_modules/foo/bar.js",
							virtualPath: "./node_modules/foo/bar.js",
							global: true
						},
						"./node_modules/zoo/index.js": {
							type: "script",
							path: "/base/a/3/node_modules/zoo/index.js",
							virtualPath: "./node_modules/zoo/index.js",
							global: true
						}
					}
				});
				done();
			});
		});
	});

	describe("_mergeObject", function () {
		it("just copies for different type values", function () {
			expect(PdiUtil._mergeObject(
				{ a: true, b: null },
				{ a: 120, b: "foo", c: true }
			)).toEqual({
				a: 120,
				b: "foo",
				c: true
			});

			expect(PdiUtil._mergeObject(
				{ b: false, d: "foo" },
				{ a: [1, 2], b: { c: 10 }, c: null }
			)).toEqual({
				a: [1, 2],
				b: { c: 10 },
				c: null,
				d: "foo"
			});
		});

		it("just copies primitive values", function () {
			expect(PdiUtil._mergeObject(
				{ a: 120, b: "foo", c: null, d: true },
				{ a: 10, b: "bar", d: false }
			)).toEqual({
				a: 10,
				b: "bar",
				c: null,
				d: false
			});
		});

		it("concatenates arrays", function () {
			expect(PdiUtil._mergeObject(
				{ a: [1, 10], b: ["foo", 1], c: [] },
				{ a: [2, ["tee"]], b: [], c: [true, false] }
			)).toEqual({
				a: [1, 10, 2, ["tee"]],
				b: ["foo", 1],
				c: [true, false]
			});
		});

		it("recursively merges objects", function () {
			expect(PdiUtil._mergeObject(
				{
					a: {
						a1: [1, 2],
						a2: false,
						a3: { a31: null },
						a4: [false],
						a5: null
					}
				},
				{
					a: {
						a1: [3],
						a2: true,
						a3: { a32: 1 },
						a4: null,
						a6: { a61: "foo" }
					}
				}
			)).toEqual({
				a: {
					a1: [1, 2, 3],
					a2: true,
					a3: {
						a31: null,
						a32: 1
					},
					a4: null,
					a5: null,
					a6: { a61: "foo" }
				}
			});
		});
	});
});
