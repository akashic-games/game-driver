# CHANGELOG

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
