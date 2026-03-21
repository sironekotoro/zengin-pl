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

# 銀行名で検索
my $banks = $client->search('みずほ');
printf "%s: %s\n", $_->{code}, $_->{name} for @$banks;

# 銀行名 + 支店名で検索
my $branches = $client->search('みずほ', '東京');
printf "%s: %s\n", $_->{code}, $_->{name} for @$branches;
```

---

## 🔎 検索

### `search($bank)`

銀行名・カナ・ひらがな・コードを対象に検索し、銀行情報の配列リファレンスを返します。

```perl
my $banks = $client->search('みずほ');

for my $bank (@$banks) {
    printf "%s: %s\n", $bank->{code}, $bank->{name};
}
```

### `search($bank, $branch)`

まず銀行を絞り込み、その銀行配下の支店名・カナ・ひらがな・コードを検索して、支店情報の配列リファレンスを返します。

```perl
my $branches = $client->search('みずほ', '東京');

for my $branch (@$branches) {
    printf "%s: %s\n", $branch->{code}, $branch->{name};
}
```

---

## 📚 API

### `get_all_banks`

全銀行情報をハッシュリファレンスで取得します。キーは銀行コード、値は銀行情報です。

```perl
my $banks = $client->get_all_banks();
printf "%s: %s\n", $_, $banks->{$_}->{name} for sort keys %$banks;
```

### `get_branches($bank_code)`

指定した銀行コードの支店情報をハッシュリファレンスで取得します。キーは支店コード、値は支店情報です。

```perl
my $branches = $client->get_branches('0001');
printf "%s: %s\n", $_, $branches->{$_}->{name} for sort keys %$branches;
```

### `get_bank($code)`

指定した銀行コードの銀行情報を取得します。

```perl
my $bank = $client->get_bank('0001');
printf "%s: %s\n", $bank->{code}, $bank->{name};
```

### `get_branch($bank_code, $branch_code)`

指定した銀行コード・支店コードの支店情報を取得します。

```perl
my $branch = $client->get_branch('0001', '001');
printf "%s: %s\n", $branch->{code}, $branch->{name};
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

## 🔄 Google Sheets Sync

GitHub Actions から毎日日本時間 9:00 に `zengin-data-mirror` の更新を確認し、変更があれば Google Sheets を更新します。

- 対象シート: `銀行`, `支店`, `解説`
- 更新判定: `zengin-data-mirror/data/updated_at`
- 解説シート:
  - `データ更新日: <mirror updated_at>`
  - `反映日時: <workflow 実行日時>`

### 注意事項

- Google Sheets 連携は `author/update_google_sheet_from_mirror.pl` と GitHub Actions で実行します
- GitHub Actions には `SIRONEKOTORO_CLIENT_ID` `SIRONEKOTORO_CLIENT_SECRET` `SIRONEKOTORO_REFRESH_TOKEN` の repository secrets が必要です
- 同期状態は `.github/state/last_synced_updated_at` で管理します

---

## 🪪 ライセンス

MIT License
© 2026 sironekotoro

---

## 🧑‍💻 作者

[@sironekotoro](https://github.com/sironekotoro)

本プロジェクトは ChatGPT (OpenAI GPT-5) の協力のもと開発・整備されています。
