use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use Test::More;
use Config;
use File::Basename qw(dirname);
use File::Spec;
use Cwd qw(abs_path);

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

# ブラウザ（ヘッドレス Chrome）での roma（ローマ字）表示退行テスト。
# 銀行・支店カードに .result-roma が表示されることを E2E で検証する。
#
# 前提: Chrome が利用可能な環境でのみ実行（t/web_roma_test.js が内部で検出・
#       見つからない場合は自身をスキップする）。Node 不在の場合はここで skip。

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $test_js = File::Spec->catfile( $repo_root, 't', 'web_roma_test.js' );

my $skip_msg;
$skip_msg ||= 'node.js が利用できません (Node.js のインストールで有効化)'
  unless defined _find_node();

if ($skip_msg) {
    plan skip_all => $skip_msg;
    exit 0;
}

plan tests => 1;

my ( $out, $exit ) = _run_node( _find_node(), $test_js );
is( $exit, 0, 'Web版の銀行・支店カードに roma（ローマ字）表示がある' );
diag($out) if $exit != 0;

sub _find_node {
    my $sep = $Config{path_sep};
    for my $dir ( split /\Q$sep\E/, $ENV{PATH} || '' ) {
        my $candidate = File::Spec->catfile( $dir || '.', 'node' );
        return $candidate if -x $candidate;
    }
    return undef;
}

sub _run_node {
    my ( $node, $script ) = @_;
    # Node 22+ のトップレベル await 自動検出では、テンプレートリテラル内の
    # await 文字列を誤って ESM 判定し require が使えなくなるため、
    # 「--no-experimental-detect-module」で CommonJS を強制する。
    # このフラグに対応しない古い Node では stderr に警告が出るだけで続行できる。
    my $cmd = join ' ',
      ( map { "'" . $_ . "'" } ( $node, '--no-experimental-detect-module', $script ) ),
      '2>&1';
    my $out = `$cmd`;
    my $exit = $? >> 8;

    # フラグ未対応・環境差異で失敗した場合は素の node で再試行。
    # 標準出力と終了コードは別々の変数に直後の $? から取り、明示的に返す
    # （リスト代入にまとめると $? の評価タイミングが曖昧になるため）。
    if ( $exit != 0 ) {
        my $fallback_cmd = join ' ',
          ( map { "'" . $_ . "'" } ( $node, $script ) ), '2>&1';
        my $fallback_out   = `$fallback_cmd`;
        my $fallback_exit  = $? >> 8;
        return ( $fallback_out, $fallback_exit );
    }
    return ( $out, $exit );
}
