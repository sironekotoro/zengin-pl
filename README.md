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

## cpanm でインストール

    cpanm Zengin::Pl

公開後は `cpanm Zengin::Pl` でモジュール本体と `zengin` コマンドが
一緒にインストールされます。

## GitHub から直接インストール

    cpanm https://github.com/sironekotoro/zengin-pl.git

GitHub URL を直接指定した場合も、配布物に含まれる `script/zengin` が
インストールされます。

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

## CLI

`zengin` は `Zengin::Pl` を薄く呼び出す CLI ラッパーです。

    zengin <銀行名>
    zengin <銀行コード>
    zengin <銀行名> <支店名>
    zengin <銀行コード> <支店コード>

1引数で数字のみなら `get_bank`、2引数で両方数字なら `get_branch`、
それ以外は検索として動作します。

使用例:

    zengin みずほ
    zengin 0001
    zengin みずほ 東京
    zengin 0001 001

出力例:

    0005    三菱ＵＦＪ銀行
    0005    001    本店

検索結果が 0 件なら `not found` を表示します。
引数が不正な場合は usage を標準エラー出力に表示して非 0 で終了します。

Windows の `cmd.exe` では引数を `cp932` として decode し、
標準出力・標準エラーも `cp932` で出力します。
Unix 系では UTF-8 前提の引数をそのまま扱うため、macOS の Terminal からの
日本語引数でもそのまま利用できます。

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

このディストリビューションは `Module::Build::Tiny` を使っているため、
`script/` 配下に置いた CLI は追加設定なしで配布物とインストール対象に含まれます。

メンテナ向けの個人運用スクリプトについては `author/README.md` を参照してください。

# LICENSE

MIT License

# AUTHOR

sironekotoro <8675420+sironekotoro@users.noreply.github.com>
