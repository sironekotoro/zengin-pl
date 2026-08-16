use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use Test::More;
use lib 't/lib';
use Zengin::TestHelper qw(live_client_or_skip);
use JSON::XS;

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

my $client = live_client_or_skip(
    base_url => 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data'
);

my @search_corpus = (
    {
        desc          => '銀行コード完全一致',
        bank_pat      => '0001',
        branch_pat    => undef,
        expected_len  => 1,
        first_code    => '0001',
        first_name    => qr/みずほ/,
    },
    {
        desc          => '銀行名検索',
        bank_pat      => 'みずほ',
        branch_pat    => undef,
        expected_len  => qr/^\d+$/,
        first_code    => '0001',
        first_name    => qr/みずほ/,
    },
    {
        desc          => '銀行コード + 支店コード完全一致',
        bank_pat      => '0001',
        branch_pat    => '001',
        expected_len  => 1,
        first_code    => '001',
        first_name    => qr/東京/,
    },
    {
        desc          => '銀行名 + 支店名検索',
        bank_pat      => 'みずほ',
        branch_pat    => '東京',
        expected_len  => qr/^\d+$/,
        first_code    => qr/^\d+$/,
        first_name    => qr/東京/,
    },
    {
        desc          => '存在しない銀行',
        bank_pat      => '存在しない銀行',
        branch_pat    => undef,
        expected_len  => 0,
    },
    {
        desc          => '存在しない支店',
        bank_pat      => 'みずほ',
        branch_pat    => '存在しない支店',
        expected_len  => 0,
    },
    {
        desc          => '複数銀行候補',
        bank_pat      => '三菱',
        branch_pat    => undef,
        expected_len  => qr/^[2-9]\d*$/,
        first_code    => '0005',
        first_name    => qr/三菱/,
    },
    {
        desc          => '銀行コード検索',
        bank_pat      => '0005',
        branch_pat    => undef,
        expected_len  => 1,
        first_code    => '0005',
        first_name    => qr/三菱/,
    },
    {
        desc          => '支店コード検索',
        bank_pat      => 'みずほ',
        branch_pat    => '001',
        expected_len  => 1,
        first_code    => '001',
    },
    {
        desc          => ' части一致銀行名',
        bank_pat      => '東京',
        branch_pat    => undef,
        expected_len  => 1,
        first_code    => '0138',
        first_name    => qr/東京/,
    },
);

for my $tc (@search_corpus) {
    subtest $tc->{desc} => sub {
        my $results = $tc->{branch_pat}
            ? $client->search( $tc->{bank_pat}, $tc->{branch_pat} )
            : $client->search( $tc->{bank_pat} );

        my $expected_len = $tc->{expected_len};
        if ( ref $expected_len eq 'Regexp' ) {
            like( scalar @{$results}, $expected_len, "検索結果数が期待通り" );
        }
        else {
            is( scalar @{$results}, $expected_len, "検索結果数が期待通り" );
        }

        if ( @{$results} > 0 ) {
            my $first = $results->[0];
            is( $first->{code}, $tc->{first_code}, "最初の結果はコードが一致" );

            if ( $tc->{first_name} ) {
                like( $first->{name}, $tc->{first_name}, "最初の結果は名が一致" );
            }
        }
    };
}

subtest 'romaは検索対象ではない' => sub {
    my $results = $client->search('mizuho');
    is( scalar @{$results}, 0, 'roma検索では0件' );
};

done_testing;