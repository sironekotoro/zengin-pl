use strict;
use warnings;
use utf8;
use Test::More;
use lib 't/lib';
use Zengin::TestHelper qw(live_client_or_skip);

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';
binmode Test::More->builder->todo_output,    ':encoding(UTF-8)';

my $client = live_client_or_skip(
    base_url => 'https://raw.githubusercontent.com/zengin-code/source-data/master/data'
);

subtest 'get_all_banks' => sub {
    my $banks = $client->get_all_banks();

    ok( ref($banks) eq 'HASH',   '銀行一覧はハッシュリファレンス' );
    ok( exists $banks->{"0001"}, 'みずほ銀行（0001）が存在する' );
    like( $banks->{"0001"}{name}, qr/みずほ/, '銀行名に「みずほ」が含まれる' );
};

subtest 'get_branches for 0001' => sub {
    my $branches = $client->get_branches("0001");

    ok( ref($branches) eq 'HASH',  '支店一覧はハッシュリファレンス' );
    ok( exists $branches->{"001"}, '001支店が存在する' );
    like( $branches->{"001"}{name}, qr/東京|本店/, '支店名に「東京」か「本店」が含まれるかも' );
};

done_testing;
