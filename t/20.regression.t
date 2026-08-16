use strict;
use warnings;
use utf8;
use open qw(:std :encoding(UTF-8));
use Test::More;
use lib 't/lib';
use Zengin::TestHelper qw(live_client_or_skip);

binmode Test::More->builder->output,         ':encoding(UTF-8)';
binmode Test::More->builder->failure_output, ':encoding(UTF-8)';

# このテストは「ライブラリ Zengin::Pl::search() の意味論」を検証する。
#
# 既知の仕様（docs/github-pages-search-plan.md 参照）:
#   - name / kana / hira / code に対しリテラル部分一致（\Q...\E）
#   - roma は検索対象外
#   - 戻り順は実装依存（保証されない）
#   - 数字のみの完全一致 dispatch は CLI / Web 層の仕様であり、
#     search() 直呼びでは数字でも部分一致となる
#
# したがって「最初の結果が〜」「件数が N 件」の順序依存アサーションは使わず、
# ・全結果がパターンを満たす
# ・想定コードが結果集合に含まれる
# ・複数候補が成り立つケースは件数下限のみ
# で検証する。Web 版の安定ソートと数字 dispatch は t/21.web_search.t で検証する。

my $client = live_client_or_skip(
    base_url => 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data'
);

my @corpus = (
    {
        desc       => '銀行コード部分一致',
        bank_pat   => '0001',
        include    => ['0001'],
    },
    {
        desc       => '銀行名 みずほ',
        bank_pat   => 'みずほ',
        include    => ['0001'],
    },
    {
        desc       => '銀行名部分一致 三菱（複数候補）',
        bank_pat   => '三菱',
        expect_multi => 1,
        include    => ['0005'],
    },
    {
        desc       => '銀行名部分一致 東京（複数候補）',
        bank_pat   => '東京',
        expect_multi => 1,
    },
    {
        desc       => '存在しない銀行',
        bank_pat   => '存在しない銀行',
        expect_zero => 1,
    },
    {
        desc       => 'roma は検索対象ではない',
        bank_pat   => 'mizuho',
        expect_zero => 1,
    },
    {
        desc          => '銀行コード + 支店名（部分一致）',
        bank_pat      => '0001',
        branch_pat    => '東京',
        expect_multi  => 1,
        include       => ['001'],
    },
    {
        desc          => '銀行コード + 支店コード（部分一致）',
        bank_pat      => '0001',
        branch_pat    => '001',
        include       => ['001'],
    },
    {
        desc          => '存在しない支店',
        bank_pat      => '0001',
        branch_pat    => '存在しない支店',
        expect_zero   => 1,
    },
);

sub _matches_any_field {
    my ( $row, $pat ) = @_;
    return 1 if defined $row->{name} && $row->{name} =~ /\Q$pat\E/;
    return 1 if defined $row->{kana} && $row->{kana} =~ /\Q$pat\E/;
    return 1 if defined $row->{hira} && $row->{hira} =~ /\Q$pat\E/;
    return 1 if defined $row->{code} && $row->{code} =~ /\Q$pat\E/;
    return 0;
}

for my $tc (@corpus) {
    subtest $tc->{desc} => sub {
        my $results = defined $tc->{branch_pat}
            ? $client->search( $tc->{bank_pat}, $tc->{branch_pat} )
            : $client->search( $tc->{bank_pat} );

        ok( ref $results eq 'ARRAY', '結果は配列リファレンス' );

        my $pattern = defined $tc->{branch_pat} ? $tc->{branch_pat} : $tc->{bank_pat};

        if ( $tc->{expect_zero} ) {
            is( scalar @{$results}, 0, '検索結果は 0 件' );
            return;
        }

        cmp_ok( scalar @{$results}, '>', 0, '1 件以上ヒット' );
        cmp_ok( scalar @{$results}, '>=', 2, '複数候補' ) if $tc->{expect_multi};

        for my $r ( @{$results} ) {
            ok( _matches_any_field( $r, $pattern ),
                '全結果が name/kana/hira/code のいずれかにマッチする' );
        }

        my %codes = map { $_->{code} => 1 } @{$results};
        for my $expected ( @{ $tc->{include} || [] } ) {
            ok( $codes{$expected}, "結果集合に $expected が含まれる（順序非依存）" );
        }
    };
}

# search() の戻り順は実装依存（ハッシュキー順）。順序を保証するのは CLI / Web の
# 表示層（それぞれ t/05.cli.t / t/21.web_search.t で検証）。

done_testing;