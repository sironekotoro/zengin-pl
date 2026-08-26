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

# Web 版検索（web/search.js）の回帰テスト。
# ・数字のみ入力の完全一致 dispatch（CLI/Web 独自）
# ・name/kana/hira/code の部分一致（roma 対象外）
# ・code 昇順の安定ソート
# を Node で実行して検証する。
#
# checkout に含まれる固定 fixture を使う。Pages build はデータを生成しない。

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $fixture_banks = File::Spec->catfile( $repo_root, 't', 'fixtures', 'web-data', 'banks.json' );
my $test_js = File::Spec->catfile( $repo_root, 't', 'web_search_test.js' );

my $skip_msg;
$skip_msg = 'Web検索fixtureが見つかりません' unless -f $fixture_banks;

my $node = _find_node();
$skip_msg ||= 'node.js が利用できません (Node.js のインストールで有効化)' unless defined $node;

if ($skip_msg) {
    plan skip_all => $skip_msg;
    exit 0;
}

plan tests => 1;

my ( $out, $exit ) = _run_node( $node, $test_js );
is( $exit, 0, 'Web版検索は CLI 相当の意味論（部分一致/数字完全一致/昇順ソート）に一致する' );
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
