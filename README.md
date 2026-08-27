[![Actions Status](https://github.com/sironekotoro/zengin-pl/actions/workflows/actions.yml/badge.svg)](https://github.com/sironekotoro/zengin-pl/actions)
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

# WEB

[全銀協コード検索](https://zengin.sironekotoro.com/) は、GitHub Pages で公開している
銀行・支店コード検索 Web UI です。検索処理はブラウザ上で実行し、Web UI には独自の favicon / app icon も含まれます。

Web 版は Pages ビルド時に銀行・支店データを生成・同梱せず、ブラウザから
[zengin-data-mirror](https://github.com/sironekotoro/zengin-data-mirror) を直接参照します。
データの基本 URL は次のとおりです。

    https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data

ブラウザは起動時に `revision` を `cache: 'no-store'` で取得します。取得した値を
cache-busting key として使い、`banks.json`、`branches/<bank_code>.json`、`updated_at` は
それぞれ `?v=<revision>` 付きの URL から取得します。`revision` は
`zengin-data-mirror` 自身の Git commit SHA ではなく、mirror が取り込んだ upstream
`source-data` の状態を識別する値です。そのため raw URL の ref には使わず、データ URL の
cache-busting にだけ使います。

mirror 側のデータが更新されても、Pages を再ビルドする必要はありません。次回アクセス時に
新しい `revision` が取得され、新しい URL でデータを読み込みます。`web/data/` を生成・同梱する
以前の方式は廃止済みです。Web UI 自体を変更した場合のみ、通常どおり Pages のデプロイが必要です。

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
        revision   => '647513f71c69505e09deb7a1da1717ec22dabedc',
        updated_at => '20260630',
      },
    }

`base_url` は現在実際に使っている値を返します。
`source.kind` は `'zengin-data-mirror'` 固定で、`source.revision` と
`source.updated_at` は mirror の `revision` / `updated_at` から取得した値です。
`revision` は40桁の16進値として検証され、小文字で返されます。通信や値の取得に失敗した場合は、
その項目の値を取得できず、次回呼び出しで再取得されます。

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
現在は `class`、`version`、`base_url` と、mirror から取得した
`source.kind`、`source.revision`、`source.updated_at` を返します。

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
