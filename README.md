# Minerooms

Backroomsとマインスイーパを融合した、一人称視点の脱出ゲームです。

黄ばんだ部屋を探索し、カーペットのシミから危険な壁を推理しながら、天井に隠された脱出口を探します。マップの上下左右はつながっており、穴へ落ちると同じ構造の別の階へ移動します。

## Play

公開版: [minerooms.mitorim.chatgpt.site](https://minerooms.mitorim.chatgpt.site)

### PC

- `WASD`: 移動
- 矢印キー / マウス: 視点移動
- `R`: 壁を壊す
- `F`: フラグを付ける・外す
- `Shift`: 走る

キー設定やマウス感度はゲーム内のSettingsから変更できます。

### Smartphone

画面左のスティックで移動し、画面をドラッグして視点を動かします。移動と視点操作は2本指で同時に行えます。画面中央のボタンで壁を壊し、右側のボタンでフラグを付け外しできます。

## Local development

Node.js 22.13.0以降が必要です。

```bash
npm install
npm run dev
```

プロダクションビルドの確認:

```bash
npm run build
```

## Audio assets

`public/sounds/` の音源はライセンス上、このリポジトリには含まれていません。ローカルで音声付きのゲームを動かす場合は、利用権を持つ音源を次の名前で配置してください。

```text
public/sounds/
  crash-1.mp3
  crash-2.mp3
  crash-near.mp3
  exit.mp3
  fall-1.mp3
  fall-2.mp3
  fluorescent-buzz.mp3
  marking.mp3
  mine-broke.mp3
  running.mp3
  walking.mp3
```

音源がない場合でもゲーム本体は起動しますが、該当するBGM・SEは再生されません。

## Credits

- Designed and developed by mitori / studio pseudohalo
- Development supported by 琴瑟
- Sound effects use Splice audio samples under license

詳しいクレジットと使用ライブラリのライセンスは、タイトル画面のCreditsおよびLicensesから確認できます。

## License

CC0 1.0 Universal — No rights reserved. mitori / studio pseudohalo.

このプロジェクトのmitori制作のソースコードとオリジナル素材は、[CC0 1.0 Universal](./LICENSE)によりパブリックドメインへ提供しています。依存ライブラリ、アイコン、ライセンス音源には、それぞれのライセンスが適用されます。ライセンス音源を収録した`public/sounds/`はCC0の対象外で、このリポジトリには含まれません。
