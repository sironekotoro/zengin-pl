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

- `tools/update_sheet.pl` はリポジトリに含めません（社内専用）
- Google Sheets 連携用のスクリプトは別途ローカルで管理してください
- 認証情報（Google APIなど）は `.gitignore` 済みです

---

## 🪪 ライセンス

MIT License  
© 2025 sironekotoro

---

## 🧑‍💻 作者

[@sironekotoro](https://github.com/sironekotoro)

本プロジェクトは ChatGPT (OpenAI GPT-5) の協力のもと開発・整備されています。
