"use strict";
import ExecutionMode from "./ExecutionMode";
import { EventBufferMode } from "./EventBuffer";

interface DriverConfiguration {
	/**
	 * プレイID。
	 * AMFlow のセッション識別に用いる。
	 */
	playId?: string;
	/**
	 * プレイトークン。
	 * AMFlow の権限管理に用いる。
	 */
	playToken?: string;
	/**
	 * 実行モード。
	 */
	executionMode?: ExecutionMode;
	/**
	 * イベントの受信・送信モード。
	 * `undefined` の場合、 `executionMode` が指定されているなら、それに応じた値が設定される。
	 */
	eventBufferMode?: EventBufferMode;
}

export default DriverConfiguration;
