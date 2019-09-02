# CHANGELOG

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
