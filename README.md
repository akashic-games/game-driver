<p align="center">
<img src="https://github.com/akashic-games/game-driver/blob/ae1x-master/img/akashic.png" />
</p>

# game-driver

**game-driver** は、Akashic Engine製のゲームを実行するドライバモジュールです。

このモジュールは、 Akashic Engineの実行系([akashic-sandbox][sandbox]など)に組み込まれています。
**ゲーム開発者(Akashic Engineの利用者)がこのモジュールを明示的に利用する必要はありません**。

## インストール

Node.js が必要です。次のコマンドでインストールできます。

```sh
npm i @akashic/game-driver
```

## ビルド方法

TypeScriptで書かれています。
`npm install` 後にビルドが必要です。

```sh
npm install
npm run build
```

## テスト方法

```sh
npm test
```

[TSLint][tslint]を使ったLintと[Jasmine][jasmine]を使ったテストが実行されます。

[sandbox]: https://github.com/akashic-games/akashic-sandbox
[tslint]: https://github.com/palantir/tslint "TSLint"
[jasmine]: http://jasmine.github.io "Jasmine"

## ライセンス
本リポジトリは MIT License の元で公開されています。
詳しくは [LICENSE](https://github.com/akashic-games/game-driver/blob/ae1x-master/LICENSE) をご覧ください。

ただし、画像ファイルおよび音声ファイルは
[CC BY 2.1 JP](https://creativecommons.org/licenses/by/2.1/jp/) の元で公開されています。
