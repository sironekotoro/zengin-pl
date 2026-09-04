use strict;
use warnings;
use Test::More;
use Config;
use File::Basename qw(dirname);
use File::Spec;
use Cwd qw(abs_path);

my $repo_root = dirname( dirname( abs_path(__FILE__) ) );
my $test_js = File::Spec->catfile( $repo_root, 't', 'web_roma_test.js' );
my $node = _find_node();

plan skip_all => 'node.js が利用できません (Node.js のインストールで有効化)'
  unless defined $node;

plan tests => 1;
local $ENV{TEST_REVISION_FAILURE} = 1;
my ( $out, $exit ) = _run_node( $node, $test_js );
is( $exit, 0, 'revision取得失敗時に古いデータを最新と誤認しない' );
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
    my $cmd = join ' ', ( map { "'$_'" } ( $node, $script ) ), '2>&1';
    my $out = `$cmd`;
    my $exit = $? >> 8;
    return ( $out, $exit );
}
