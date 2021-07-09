"use strict";

interface StartPointData {
	/**
	 * 乱数シード。
	 * 第0スタートポイントにのみ存在する。
	 */
	seed?: number;

	/**
	 * プレイ全体で共有される引数。
	 * 第0スタートポイントにのみ存在する。
	 */
	globalArgs?: any;

	/**
	 * プレイ開始日時(の `Date.now()` の値)。
	 *
	 * この値は絶対的な時刻情報であり、他の箇所の注釈なしの「時刻」や `timestamp` (プレイ開始からの相対時刻情報である) とは異なる。
	 * 第0スタートポイントにのみ存在する。
	 */
	startedAt?: number;

	/**
	 * このプレイのFPS値。
	 * この値はメタ情報として記録されている。現実装のgame-driverモジュールはこの値を参照しない。
	 * 第0スタートポイントにのみ存在する。
	 */
	fps?: number;

	/**
	 * 次に生成されるエンティティの ID (`Game#_idx`) の値。
	 * 第0以外のスタートポイントにのみ存在する。
	 */
	nextEntityId?: number;

	/**
	 * 乱数生成器のシリアリゼーション。
	 * 第0以外のスタートポイントにのみ存在する。
	 */
	randGenSer?: any;

	/**
	 * スナップショット。
	 * 第0以外のスタートポイントにのみ存在する。
	 */
	gameSnapshot?: any;

	/**
	 * タイムスタンプ。
	 * この値は後方互換性のために存在する。現在は StartPoint そのものにタイムスタンプが持てるので新たに書き込むことはない。
	 */
	timestamp?: number;
}

export default StartPointData;
