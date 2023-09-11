# CHANGELOG

## 2.18.0
* @akashic/akashic-engine@3.15.0 に追従
* 旧ストレージ関連の実装を削除

## 2.17.0
* ローディングシーン中に `Game#destroy()` するとエラーになる問題を修正
  * `Game#handlerSet` の型を (オーバーライドしない) `g.GameHandlerSet` に
  * `Game#rawHandlerSet: GameHandlerSet` を追加

## 2.16.0
* @akashic/akashic-engine@3.14.0 に追従

## 2.15.0
* @akashic/akashic-engine@3.13.0 に追従

## 2.14.0
* @akashic/akashic-engine@3.12.0 に追従

## 2.13.0
* @akashic/akashic-engine@3.11.0 に追従

## 2.12.1
* スナップショットからの復元時、エントリポイントの引数 `args` が渡されていなかった問題を修正

## 2.12.0
* @akashic/akashic-engine@3.10.0 に追従
* @akashic/game-configuration@1.9.0 に追従

## 2.11.2
* g.game.removeEventFilter() に undefined を与えた時、何もしないように (異常系の挙動変更)

## 2.11.1
* 目標時刻を指定したリプレイ実行がローディングなどにかかる時間の影響を受けている問題を修正

## 2.11.0
* @akashic/akashic-engine@3.9.0 に追従

## 2.10.0
* @akashic/akashic-engine@3.7.0 に追従
* @akashic/game-configuration@1.6.0 に追従

## 2.9.0
* @akashic/akashic-engine@3.6.0 に追従

## 2.8.0
* @akashic/akashic-engine@3.5.0 に追従
* @akashic/pdi-types@1.4.0 に追従
* @akashic/pdi-common-impl@1.0.0 に追従

## 2.8.0-beta.1
* @akashic/akashic-engine@3.5.0-beta.2 に追従

## 2.8.0-beta.0
* @akashic/akashic-engine@3.5.0-beta.1 に追従
* @akashic/pdi-types@1.4.0-beta.1 に追従
* @akashic/pdi-common-impl@1.0.0 に追従

## 2.7.1
* 実行開始直後のごく短い早送りに限り、音声再生速度を変更しないように

## 2.7.0
* @akashic/akashic-engine@3.4.0 に追従
* @akashic/game-configuration@1.3.0 に追従

## 2.6.0
* @akashic/akashic-engine@3.3.0 に追従できていなかった問題を修正

## 2.5.0
* @akashic/akashic-engine@3.3.0 に追従
* @akashic/game-configuration@1.2.0 に追従

## 2.4.3
* スナップショットで外部からリセットした場合に、`TickBuffer#knownLatestAge` が更新されない問題を修正
* スナップショットで外部からリセットした場合に、しばらくゲームが開始されない問題を修正
* リプレイ再生時、無駄なティック取得を行う場合がある問題を修正
* `TickBuffer#gotNoTickTrigger` の誤通知を修正 (外部への影響なし)

## 2.4.2
* `MemoryAmflowClient`, `ReplayAmflowProxy` を削除し @akashic/amflow-util を利用するように

## 2.4.1
* 後方互換性のため、一部環境で暫定的に @akashic/amflow@2 以前の `AMFlow#getTickList()` の引数を利用するように差し戻し

## 2.4.0
* @akashic/akashic-engine@3.2.0 に追従

## 2.3.1
* v2.1.1 の変更を revert 。`TickBuffer#requestTicks()` で @akashic/amflow@3 の `AMFlow#getTickList()` を利用するように

## 2.3.0
* @akashic/amflow@3.1.0, @akashic/pdi-types@1.2.0 に追従

## 2.2.0
* @akashic/akashic-engine@3.1.0 に追従
* Realtime モードの実行開始時に最新のスタートポイントを取得するように

## 2.1.3
* スキップ中に発生したローカル/非ローカルイベントを破棄するように

## 2.1.2
* `Clock#_onLooperCall()` の引数に `NaN` が渡された場合、次のフレームまで進むよう変更

## 2.1.1
* `TickBuffer#requestTicks()` で @akashic/amflow@2 以前の `AMFlow#getTickList()` の引数を利用するように差し戻し

## 2.1.0
* @akashic/amflow@3.0.0 に対応
* ignorable event に対応

## 2.0.3
* @akashic/game-configuration@1.0.1 に追従

## 2.0.2
* 常に No permission となってしまうバグの修正

## 2.0.1
* @akashic/game-configuration を利用するように変更

## 2.0.0
* @akashic/akashic-engine@3.0.0 に追従

## 2.0.0-beta.12
* `build` ディレクトリ以下のビルド成果物が壊れていたバグの修正

## 2.0.0-beta.11
* @akashic/akashic-engine@3.0.0-beta.36 に追従

## 2.0.0-beta.10
* @akashic/akashic-engine@3.0.0-beta.35 に追従

## 2.0.0-beta.9
* @akashic/amflowのmajor更新と@akashic/playlogのminor更新に伴うバージョンアップ

## 2.0.0-beta.8
* @akashic/akashic-engine@v3.0.0-beta.26 に追従
* @akashic/pdi-types を使うように

## 2.0.0-beta.7
* @akashic/akashic-engine@v3.0.0-beta.18 に追従

## 2.0.0-beta.2 - 6
* @akashic/akashic-engine@v3.0.0-beta.0 - 17 に追従

## 2.0.0-beta.1
* `g.Game#modified` の関数化に伴い、`g.Game#modified()` に修正。

## 1.10.1
* `build` ディレクトリ以下のビルド成果物が壊れていたバグの修正

## 1.10.0
* @akashic/amflowのmajor更新と@akashic/playlogのminor更新に伴うバージョンアップ

## 1.9.1
* playlog の eventFlags の値をマスクしないように修正

## 1.9.0
* @akashic/amflowと@akashic/playlogのmajor更新に伴うバージョンアップ

## 1.8.0
* @akashic/amflowと@akashic/playlogのmajor更新に伴うバージョンアップ

## 1.7.0
* `Game#_terminateGame()` を `Game#_abortGame()` にリネーム

## 1.6.5
* `MemoryAmflowClient#sendTick` と `MemoryAmflowClient#sendEvent` で送信するプレイログ情報を clone して保持するように修正

## 1.6.4
* `g.Game#random#generate()` を追加

## 1.6.3
* dependenciesのrange指定ミス修正 (動作上の問題はなかったはずだが、将来的なトラブル回避のため)

## 1.6.2
* イベントフィルタが引数と異なる種類のイベントを返した場合に、正しく動作しないことがある問題を修正
* イベントフィルタの返した値が、同じフィルタに再適用されることがある問題を修正

## 1.6.1
* g.Game#getCurrentTime()が正しく整数化されない問題への対応

## 1.6.0
* @akashic/akashic-engineのminor更新に伴うバージョンアップ

## 1.5.0
* @akashic/amflowのminor更新に伴うバージョンアップ

## 1.4.14
* `Platform#destroy()` を呼び出すように変更

## 1.4.13
* ゲームがdestroyされている場合でもPromise内で処理が続行されてしまう問題への対応
* リプレイ時において、ティックがない場合に補間ティックを挿入することにより目標時刻を超えてしまうバグを修正

## 1.4.12
* リプレイ時において、目標時刻が最終ティック以降に指定された場合にスキップ通知をするように修正
* `LoopConfiguration#omitInterpolatedTickOnReplay` の初期値を真に

## 1.4.11
* 初期リリース
