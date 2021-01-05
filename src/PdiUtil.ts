"use strict";
import { Promise } from "es6-promise";
import * as g from "@akashic/akashic-engine";
import * as pdi from "@akashic/pdi-types";
import { GameConfiguration, GameConfigurationDefinitionDeclaration } from "./GameConfiguration";

export module PdiUtil {
	export type LoadConfigurationFunc = (url: string, asseBase: string | undefined, configurationBase: string | undefined,
	                                     callback: (err: any, conf: GameConfiguration) => void) => void;

	/**
	 * 与えられた `Platform` の `loadGameConfiguration()` をラップした、`GameConfiguration` 読み込み関数を作成して返す。
	 *
	 * 戻り値の関数は、次の点で `Platform#loadGameConfiguration()` と異なる。
	 * * "definitions" フィールドを解決する (再帰的に読み込みを行い、_mergeGameConfiguration() でカスケード解決する)
	 * * "assetBase" を使って `GameConfiguration` 内のアセットのパスを絶対パスに変換する
	 * * "configurationBase" を使って "definitions" フィールド内のパスを絶対パスに変換する
	 *
	 * @param pf ラップする `loadGameConfiguration()` を持つ `Platform`
	 */
	export function makeLoadConfigurationFunc(pf: pdi.Platform): PdiUtil.LoadConfigurationFunc {
		function loadResolvedConfiguration(url: string, assetBase: string | undefined, configurationBase: string | undefined,
		                                   callback: (err: Error | null, conf: any) => void): void {
			pf.loadGameConfiguration(url, (err: any, conf: any) => {
				if (err) {
					callback(err, null);
					return;
				}
				try {
					conf = PdiUtil._resolveConfigurationBasePath(conf, ((assetBase != null) ? assetBase : g.PathUtil.resolveDirname(url)));
				} catch (e) {
					callback(e, null);
					return;
				}
				if (!conf.definitions) {
					callback(null, conf);
					return;
				}
				var defs = conf.definitions.map((def: string|GameConfigurationDefinitionDeclaration) => {
					if (typeof def === "string") {
						const resolvedUrl = configurationBase != null ? g.PathUtil.resolvePath(configurationBase, def) : def;
						return promisifiedLoad(resolvedUrl, undefined, configurationBase);
					} else {
						const resolvedUrl = configurationBase != null ? g.PathUtil.resolvePath(configurationBase, def.url) : def.url;
						return promisifiedLoad(resolvedUrl, def.basePath, configurationBase);
					}
				});
				Promise.all<GameConfiguration>(defs)
					.then<void>((confs: GameConfiguration[]) => callback(null, confs.reduce(PdiUtil._mergeGameConfiguration)))
					.catch((e: Error) => callback(e, null));
			});
		}
		function promisifiedLoad(url: string, assetBase: string | undefined, configurationBase: string | undefined): Promise<GameConfiguration> {
			return new Promise<GameConfiguration>((resolve: (conf: GameConfiguration) => void, reject: (err: any) => void) => {
				loadResolvedConfiguration(url, assetBase, configurationBase, (err, conf) => {
					err ? reject(err) : resolve(conf);
				});
			});
		}
		return loadResolvedConfiguration;
	}

	/**
	 * 与えられた `GameConfiguration` のパス(相対パスになっている)を絶対パスに変える。
	 * @param configuration 対象の `GameConfiguration`
	 * @param assetBase アセットの相対パスの基準となるパス
	 */
	export function _resolveConfigurationBasePath(configuration: g.GameConfiguration, assetBase: string): g.GameConfiguration {
		function resolvePath(base: string, path: string): string {
			var ret = g.PathUtil.resolvePath(base, path);
			if (ret.indexOf(base) !== 0)
				throw new Error("PdiUtil._resolveConfigurationBasePath: invalid path: " + path);
			return ret;
		}
		var assets = configuration.assets;
		if (assets instanceof Object) {
			for (var p in assets) {
				if (!assets.hasOwnProperty(p)) continue;
				if ("path" in assets[p]) {
					assets[p].virtualPath = assets[p].virtualPath || assets[p].path;
					assets[p].path = resolvePath(assetBase, assets[p].path);
				}
			}
		}
		if (configuration.globalScripts) {
			configuration.globalScripts.forEach((path: string) => {
				if (assets.hasOwnProperty(path))
					throw new Error("PdiUtil._resolveConfigurationBasePath: asset ID already exists: " + path);
				assets[path] = {
					type: /\.json$/i.test(path) ? "text" : "script",
					virtualPath: path,
					path: resolvePath(assetBase, path),
					global: true
				};
			});
			delete configuration.globalScripts;
		}
		return configuration;
	}

	/**
	 * 与えられたオブジェクト二つを「マージ」する。
	 * ここでマージとは、オブジェクトのフィールドをイテレートし、
	 * プリミティブ値であれば上書き、配列であればconcat、オブジェクトであれば再帰的にマージする処理である。
	 *
	 * @param target マージされるオブジェクト。この値は破壊される
	 * @param source マージするオブジェクト
	 */
	export function _mergeObject(target: any, source: any): any {
		var ks = Object.keys(source);
		for (var i = 0, len = ks.length; i < len; ++i) {
			var k = ks[i];
			var sourceVal = source[k];
			var sourceValType = typeof sourceVal;
			var targetValType = typeof target[k];

			if (sourceValType !== targetValType) {
				target[k] = sourceVal;
				continue;
			}

			switch (typeof sourceVal) {
			case "string":
			case "number":
			case "boolean":
				target[k] = sourceVal;
				break;
			case "object":
				if (sourceVal == null) {
					target[k] = sourceVal;
				} else if (Array.isArray(sourceVal)) {
					target[k] = target[k].concat(sourceVal);
				} else {
					PdiUtil._mergeObject(target[k], sourceVal);
				}
				break;
			default:
				throw new Error("PdiUtil._mergeObject(): unknown type");
			}
		}
		return target;
	}

	export function _mergeGameConfiguration(target: GameConfiguration, source: GameConfiguration): GameConfiguration {
		return PdiUtil._mergeObject(target, source);
	}
}
