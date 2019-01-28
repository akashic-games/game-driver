"use strict";
import * as g from "@akashic/akashic-engine";

export interface GameConfigurationDefinitionDeclaration {
	/**
	 * GameConfigurationの内容を得られるURL。
	 */
	url: string;
	/**
	 * GameConfigurationのpath, globalScriptsのパスの基準となるパス。
	 * 指定されなかった場合、 `g.PathUtil.resolveDirname(this.url)` が与えられたものとみなされる。
	 */
	basePath?: string;
}

export interface GameConfiguration extends g.GameConfiguration {
	/**
	 * `GameConfigurationDefinitionDeclaration` の配列。
	 *
	 * 指定された場合、この `GameConfiguration` は、指定された配列で得られた `GameConfiguration` を
	 * すべてマージしたものであるかのように取り扱われる。この時このオブジェクトの他のプロパティは無視される。
	 *
	 * 配列の各要素には文字列を与えることもできる。
	 * `path: string` は `{ url: path }: GameConfigurationDefinitionDeclaration` として解釈される。
	 */
	definitions?: (string|GameConfigurationDefinitionDeclaration)[];
}
