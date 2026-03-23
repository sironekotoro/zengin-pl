[![Actions Status](https://github.com/sironekotoro/zengin-pl/actions/workflows/test.yml/badge.svg)](https://github.com/sironekotoro/zengin-pl/actions)
# NAME

Zengin::Pl - Lightweight Perl client for Zengin Code (全銀協コード) JSON dataset

# SYNOPSIS

    use Zengin::Pl;

    my $client = Zengin::Pl->new();

    my $banks = $client->search('みずほ');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$banks;

    my $branches = $client->search('みずほ', '東京');
    printf "%s: %s\n", $_->{code}, $_->{name} for @$branches;

# DESCRIPTION

Zengin::Pl は、全銀コード（金融機関コード・支店コード）データを
GitHub 上の JSON リポジトリから取得する軽量 Perl クライアントです。

このリポジトリの正式な配布単位は、Git clone したリポジトリ直下です。
モジュール名は `Zengin::Pl`、ディストリビューション名は `Zengin-Pl` です。
`Zengin::Client` は後方互換のために残しています。

# INSTALLATION

## cpanm でローカル clone をインストール

    git clone https://github.com/sironekotoro/zengin-pl.git
    cd zengin-pl
    cpanm .

`cpanm /path/to/zengin-pl` のように、clone 済みディレクトリを直接指定しても
インストールできます。

## 標準的な Build.PL 手順

    git clone https://github.com/sironekotoro/zengin-pl.git
    cd zengin-pl
    perl Build.PL
    ./Build
    ./Build test
    ./Build install

# USAGE

    use Zengin::Pl;

    my $client = Zengin::Pl->new(
        base_url => 'https://example.com/zengin-data'
    );

`base_url` のデフォルト値は
[https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data](https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data)
です。

# META

`meta()` は backend 自身の情報をハッシュリファレンスで返します。
zengin-pl-api のような呼び出し側が backend 情報を推測せず、そのまま取り込めることを意図しています。

    my $meta = $client->meta();

返り値例:

    {
      class    => 'Zengin::Pl',
      version  => '0.01',
      base_url => 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data',
      source   => {
        kind       => 'zengin-data-mirror',
        revision   => undef,
        updated_at => undef,
      },
    }

`base_url` は現在実際に使っている値を返します。
`source.revision` と `source.updated_at` は将来拡張用の枠として持っていますが、
現時点では未実装のため `undef` を返します。

# METHODS

## new(%args)

クライアントインスタンスを生成します。

## get\_all\_banks

全銀行情報をハッシュリファレンスで返します。

## get\_branches($bank\_code)

指定した銀行コードの支店情報をハッシュリファレンスで返します。

## get\_bank($code)

指定した銀行コードの銀行情報を返します。

## get\_branch($bank\_code, $branch\_code)

指定した銀行コード・支店コードの支店情報を返します。

## search($bank\_pattern)

銀行名・カナ・ひらがな・コードで銀行を検索し、配列リファレンスを返します。

## search($bank\_pattern, $branch\_pattern)

銀行を絞り込んだ上で支店名・カナ・ひらがな・コードを検索し、配列リファレンスを返します。

## meta()

backend 自身のメタ情報をハッシュリファレンスで返します。
現在は `class`、`version`、`base_url` と、
将来拡張用の `source.kind`、`source.revision`、`source.updated_at` を返します。

# TEST

    prove -lr t

# COMPATIBILITY

既存コード向けに `Zengin::Client` も引き続き利用できますが、
新規利用では `Zengin::Pl` を使ってください。

# DEVELOPMENT

このディストリビューションは Minilla で管理しています。`minil.toml` を設定の正とし、
`Build.PL` や `META.json` のような生成物は手で編集せず Minilla で更新してください。

`META.json` は Git clone 後に `cpanm /path/to/cloned-repo` を成立させるため、
生成物ですがリポジトリにも含めています。

メンテナ向けの個人運用スクリプトについては `author/README.md` を参照してください。

# LICENSE

MIT License

# AUTHOR

sironekotoro <8675420+sironekotoro@users.noreply.github.com>
