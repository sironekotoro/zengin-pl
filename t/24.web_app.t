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

# Web 版インクリメンタル検索（web/app.js）のキーボード操作・ARIA 状態更新の
# 回帰テスト。mock DOM を用いたオフライン・決定論的なテストで、
# ブラウザ依存・ネットワーク依存はない。
#
# 検証内容:
#   - ArrowUp/ArrowDown による候補ナビゲーション（折り返し含む）
#   - Enter による選択（選択時）/ 全件検索（非選択時）
#   - Escape による候補リストの解除
#   - aria-expanded / aria-activedescendant / aria-selected の更新
#   - openSuggestions / closeSuggestions / setActiveSuggestion の状態管理

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $test_js = File::Spec->catfile( $repo_root, 't', 'web_app_test.js' );

my $skip_msg;
$skip_msg ||= 'node.js が利用できません (Node.js のインストールで有効化)'
  unless defined _find_node();

if ($skip_msg) {
    plan skip_all => $skip_msg;
    exit 0;
}

plan tests => 1;

my ( $out, $exit ) = _run_node( _find_node(), $test_js );
is( $exit, 0, 'Web版インクリメンタル検索のキーボード操作とARIA状態更新が正しい' );
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