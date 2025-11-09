use strict;
use warnings;
use utf8;
use Test::More;
use Zengin::Client;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

my $client = Zengin::Client->new( base_url =>
      'https://raw.githubusercontent.com/zengin-code/source-data/master/data' );

subtest 'get_bank' => sub {
    my $bank = $client->get_bank('0001');
    ok( $bank, 'みずほ銀行が取得できる' );
    like( $bank->{name}, qr/みずほ/, '銀行名にみずほ' );
};

subtest 'get_branch' => sub {
    my $branch = $client->get_branch( '0001', '001' );
    ok( $branch, '支店が取得できる' );
    like( $branch->{name}, qr/東京|本店/, '支店名に東京または本店' );
};

done_testing;
