use strict;
use warnings;
use utf8;
use Test::More;
use lib 't/lib';
use Zengin::TestHelper qw(live_client_or_skip);

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

my $client = live_client_or_skip(
    base_url => 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data'
);

sub assert_arrayref_of_hashes {
    my ( $res, $label ) = @_;
    ok( ref $res eq 'ARRAY', "$label: 配列リファレンス" );
    ok( @{$res} > 0,         "$label: 1件以上ヒット" );
    ok( ref $res->[0] eq 'HASH', "$label: 要素はハッシュリファレンス" );
}

subtest 'search banks only' => sub {
    my $res = $client->search('みずほ');
    assert_arrayref_of_hashes( $res, '1引数検索' );
    ok( exists $res->[0]->{code}, '銀行情報は code を持つ' );
    ok( exists $res->[0]->{name}, '銀行情報は name を持つ' );
    like( $res->[0]->{name}, qr/みずほ/, '銀行名に みずほ を含む' );
    ok( !exists $res->[0]->{bank}, 'bank ネストを持たない' );
    ok( !exists $res->[0]->{branch}, 'branch ネストを持たない' );
};

subtest 'search banks + branches' => sub {
    my $res = $client->search( 'みずほ', '東京' );
    assert_arrayref_of_hashes( $res, '2引数検索' );
    ok( exists $res->[0]->{code}, '支店情報は code を持つ' );
    ok( exists $res->[0]->{name}, '支店情報は name を持つ' );
    like( $res->[0]->{name}, qr/東京/, '支店名に 東京 を含む' );
    ok( !exists $res->[0]->{bank}, 'bank ネストを持たない' );
    ok( !exists $res->[0]->{branch}, 'branch ネストを持たない' );
};

subtest 'search supports regexp' => sub {
    my $banks = $client->search(qr/^みずほ/);
    assert_arrayref_of_hashes( $banks, '正規表現による銀行検索' );
    like( $banks->[0]->{name}, qr/^みずほ/, '銀行名の前方一致検索ができる' );

    my $branches = $client->search( 'みずほ', qr/^東京/ );
    assert_arrayref_of_hashes( $branches, '正規表現による支店検索' );
    like( $branches->[0]->{name}, qr/^東京/, '支店名の前方一致検索ができる' );
};

subtest 'search returns empty arrayref when no matches' => sub {
    my $banks = $client->search('ありえない銀行名');
    is( ref $banks, 'ARRAY', '銀行0件でも配列リファレンス' );
    is( scalar @{$banks}, 0, '銀行0件なら空配列' );

    my $branches = $client->search( 'みずほ', 'ありえない支店名' );
    is( ref $branches, 'ARRAY', '支店0件でも配列リファレンス' );
    is( scalar @{$branches}, 0, '支店0件なら空配列' );
};

subtest 'search matches code fields' => sub {
    my $banks = $client->search('0001');
    assert_arrayref_of_hashes( $banks, '銀行コード検索' );
    ok( grep( { defined $_->{code} && $_->{code} eq '0001' } @{$banks} ),
        '銀行コードでも検索できる' );

    my $branches = $client->search( 'みずほ', '001' );
    assert_arrayref_of_hashes( $branches, '支店コード検索' );
    ok( grep( { defined $_->{code} && $_->{code} eq '001' } @{$branches} ),
        '支店コードでも検索できる' );
};

done_testing;
