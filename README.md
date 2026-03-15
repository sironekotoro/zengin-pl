# Zengin::Client

**Zengin::Client** は、全銀コード（金融機関コード・支店コード）データを
GitHub 上の JSON リポジトリから取得する軽量 Perl クライアントです。

> Lightweight Perl client for Zengin Code data.

---

## 📦 インストール

GitHub リポジトリから直接インストールできます：

```bash
cpanm https://github.com/sironekotoro/zengin-pl.git
```

---

## 🚀 使い方

```perl
use Zengin::Client;

my $client = Zengin::Client->new();

# 全ての銀行一覧を取得
my $banks = $client->get_all_banks();

# 銀行名を表示
foreach my $code (sort keys %$banks) {
    printf "%s: %s\n", $code, $banks->{$code}->{name};
}
```

---

## 🧰 オプション

```perl
my $client = Zengin::Client->new(
    base_url => 'https://example.com/zengin-data'
);
```

`base_url` はデフォルトで  
[`https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data`](https://github.com/sironekotoro/zengin-data-mirror)  
を参照します。

---

## 🧪 テスト

```bash
prove -lr t
```

---

## ⚠️ 注意事項

- Google Sheets 連携は `author/update_google_sheet_from_mirror.pl` と GitHub Actions で実行します
- GitHub Actions には `SIRONEKOTORO_CLIENT_ID` `SIRONEKOTORO_CLIENT_SECRET` `SIRONEKOTORO_REFRESH_TOKEN` の repository secrets が必要です
- 同期状態は `.github/state/last_synced_updated_at` で管理します

---

## 🔄 Google Sheets Sync

GitHub Actions から毎日日本時間 9:00 に `zengin-data-mirror` の更新を確認し、変更があれば Google Sheets を更新します。

- 対象シート: `銀行`, `支店`, `解説`
- 更新判定: `zengin-data-mirror/data/updated_at`
- 解説シート:
  - `データ更新日: <mirror updated_at>`
  - `反映日時: <workflow 実行日時>`

---

## 🪪 ライセンス

MIT License  
© 2025 sironekotoro

---

## 🧑‍💻 作者

[@sironekotoro](https://github.com/sironekotoro)

本プロジェクトは ChatGPT (OpenAI GPT-5) の協力のもと開発・整備されています。
