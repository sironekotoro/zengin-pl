# Author Notes

このディレクトリには、公開 API ではなくメンテナ向けの補助スクリプトを置いています。

## Google Sheets Sync

`update_google_sheet_from_mirror.pl` は、`zengin-data-mirror` の内容を Google Sheets に反映するための
個人運用スクリプトです。`Zengin::Pl` 自体の利用には不要です。

前提:

- Google Sheets API へアクセスできること
- 対象 Spreadsheet が事前に用意されていること
- OAuth refresh token を含む認証情報を環境変数で渡すこと

必要な環境変数:

- `MIRROR_UPDATED_AT`
- `SYNCED_AT` 任意。未指定時は実行時刻を使用
- `SIRONEKOTORO_CLIENT_ID`
- `SIRONEKOTORO_CLIENT_SECRET`
- `SIRONEKOTORO_REFRESH_TOKEN`

想定シート:

- `銀行`
- `支店`
- `解説`

更新内容:

- `銀行` シートに銀行一覧を書き込み
- `支店` シートに支店一覧を書き込み
- `解説` シートにデータ更新日時と反映日時を書き込み

このスクリプトは個人運用寄りなので、公開ライブラリの README には詳細を載せていません。
