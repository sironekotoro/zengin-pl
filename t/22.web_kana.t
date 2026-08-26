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

# Web 版半角カタカナ変換（web/kana.js）の回帰テスト。
# ・単位変換（カタカナ/濁点結合/全角英数記号）
# ・実データ全レコードでの NFKC 往復一致
# を Node で実行して検証する。
#
# checkout に含まれる固定 fixture を検証する。

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $test_js = File::Spec->catfile( $repo_root, 't', 'web_kana_test.js' );

my $skip_msg;
$skip_msg ||= 'node.js が利用できません (Node.js のインストールで有効化)'
  unless defined _find_node();

if ($skip_msg) {
    plan skip_all => $skip_msg;
    exit 0;
}

plan tests => 1;

my ( $out, $exit ) = _run_node( _find_node(), $test_js );
is( $exit, 0, 'Web版半角カタカナ変換は NFKC 往復一致を満たす' );
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
    my $cmd = join ' ',
      ( map { "'" . $_ . "'" } ( $node, $script ) ), '2>&1';
    my $out = `$cmd`;
    my $exit = $? >> 8;
    return ( $out, $exit );
}
