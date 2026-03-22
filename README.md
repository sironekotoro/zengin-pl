# Zengin::Pl

`Zengin::Pl` は、全銀コード（金融機関コード・支店コード）データを
GitHub 上の JSON リポジトリから取得する軽量 Perl クライアントです。

このリポジトリの正式な配布単位は、Git clone したリポジトリ直下です。
モジュール名は `Zengin::Pl`、ディストリビューション名は `Zengin-Pl` です。
`Zengin::Client` は後方互換のために残しています。

## Installation

### `cpanm` でローカル clone をインストール

```bash
git clone https://github.com/sironekotoro/zengin-pl.git
cd zengin-pl
cpanm .
```

`cpanm /path/to/zengin-pl` のように、clone 済みディレクトリを直接指定しても
インストールできます。

### 標準的な `Build.PL` 手順

```bash
git clone https://github.com/sironekotoro/zengin-pl.git
cd zengin-pl
perl Build.PL
./Build
./Build test
./Build install
```

## Usage

```perl
use Zengin::Pl;

my $client = Zengin::Pl->new();

my $banks = $client->search('みずほ');
printf "%s: %s\n", $_->{code}, $_->{name} for @$banks;

my $branches = $client->search('みずほ', '東京');
printf "%s: %s\n", $_->{code}, $_->{name} for @$branches;
```

## API

### `new(%args)`

```perl
my $client = Zengin::Pl->new(
    base_url => 'https://example.com/zengin-data'
);
```

`base_url` のデフォルト値は
[`https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data`](https://github.com/sironekotoro/zengin-data-mirror)
です。

### `get_all_banks`

全銀行情報をハッシュリファレンスで返します。

### `get_branches($bank_code)`

指定した銀行コードの支店情報をハッシュリファレンスで返します。

### `get_bank($code)`

指定した銀行コードの銀行情報を返します。

### `get_branch($bank_code, $branch_code)`

指定した銀行コード・支店コードの支店情報を返します。

### `search($bank_pattern)`

銀行名・カナ・ひらがな・コードで銀行を検索し、配列リファレンスを返します。

### `search($bank_pattern, $branch_pattern)`

銀行を絞り込んだ上で支店名・カナ・ひらがな・コードを検索し、配列リファレンスを返します。

## Test

```bash
prove -lr t
```

## License

MIT License

## Compatibility

既存コード向けに `Zengin::Client` も引き続き利用できますが、新規利用では `Zengin::Pl` を使ってください。
